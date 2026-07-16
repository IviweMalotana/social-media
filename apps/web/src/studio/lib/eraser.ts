import type { Canvas, FabricImage } from 'fabric'
import type { HistoryManager } from './history'

/**
 * Eraser tool — free-hand painting that punches transparent pixels into the
 * selected image. Not content-aware ("magic remove" needs a WASM inpainting
 * model, deferred), but reliable and cheap: user drags over the label /
 * watermark / whatever, and those pixels become transparent. Combine with
 * a solid canvas background color to visually "remove" the erased region.
 *
 * How it works:
 * 1. Convert the image's source (an <img> element) into a same-size
 *    <canvas> element. Fabric renders whatever HTMLElement its `.getElement()`
 *    points at, so swapping in a canvas gives us a mutable pixel buffer.
 * 2. On pointer drag, translate the Fabric canvas coordinates into
 *    image-local pixel coordinates (accounting for scale/rotation/flip)
 *    and paint transparent circles via `destination-out` compositing.
 * 3. Fabric re-renders from the updated canvas element on each frame.
 *
 * The transformation from canvas → image-local coordinates uses Fabric's
 * calcTransformMatrix + invertTransform helpers so it works correctly even
 * after the image has been rotated, scaled, flipped, or nudged.
 */

type EraserImage = FabricImage & { _eraserWorkingCanvas?: HTMLCanvasElement }

function withHistory(canvas: Canvas) {
  return (canvas as unknown as { history?: HistoryManager }).history
}

/**
 * Swap the image's source for a mutable off-screen canvas if it isn't one
 * already. Idempotent — subsequent calls reuse the same working canvas so
 * successive erase strokes accumulate.
 */
function ensureWorkingCanvas(img: EraserImage): HTMLCanvasElement {
  if (img._eraserWorkingCanvas) return img._eraserWorkingCanvas
  const element = img.getElement() as HTMLImageElement | HTMLCanvasElement
  const width = (element as HTMLImageElement).naturalWidth || (element as HTMLCanvasElement).width
  const height = (element as HTMLImageElement).naturalHeight || (element as HTMLCanvasElement).height
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  const ctx = c.getContext('2d')!
  ctx.drawImage(element, 0, 0, width, height)
  img.setElement(c)
  img._eraserWorkingCanvas = c
  return c
}

export interface EraserSession {
  onPointerDown: (event: PointerEvent) => void
  onPointerMove: (event: PointerEvent) => void
  onPointerUp: (event: PointerEvent) => void
  onPointerLeave: (event: PointerEvent) => void
  detach: () => void
}

/**
 * Attach an eraser session to the Fabric canvas + image. Returns pointer
 * handlers the caller wires onto the canvas DOM element, plus a `detach`
 * that resets state and takes a history snapshot so the strokes become one
 * undo step (not one snapshot per pixel painted).
 */
export function attachEraser(
  fabricCanvas: Canvas,
  image: EraserImage,
  getBrushSize: () => number,
): EraserSession {
  const workingCanvas = ensureWorkingCanvas(image)
  const ctx = workingCanvas.getContext('2d')!
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  let pressed = false
  let lastPoint: { x: number; y: number } | null = null

  const canvasToImageLocal = (canvasX: number, canvasY: number): { x: number; y: number } => {
    // Fabric returns the inverse transform matrix from canvas → object space.
    // Multiplying the pointer position by it gives us the image-local coords
    // that account for translate/scale/rotate/flip on the FabricImage instance.
    const matrix = image.calcTransformMatrix()
    const invertMatrix = (
      image.constructor as unknown as { invertTransform: (m: number[]) => number[] }
    ).invertTransform
      ? (image.constructor as unknown as { invertTransform: (m: number[]) => number[] }).invertTransform(matrix)
      : invert(matrix)
    const local = applyMatrix(invertMatrix, { x: canvasX, y: canvasY })
    // Fabric places (0,0) at the image center; the working canvas uses (0,0)
    // at the top-left corner, so shift.
    return {
      x: local.x + workingCanvas.width / 2,
      y: local.y + workingCanvas.height / 2,
    }
  }

  const paint = (x: number, y: number) => {
    const size = getBrushSize()
    ctx.globalCompositeOperation = 'destination-out'
    ctx.beginPath()
    ctx.arc(x, y, size / 2, 0, Math.PI * 2)
    ctx.fill()
    if (lastPoint) {
      // Interpolate between successive events so fast drags don't leave gaps.
      ctx.lineWidth = size
      ctx.strokeStyle = 'rgba(0,0,0,1)'
      ctx.beginPath()
      ctx.moveTo(lastPoint.x, lastPoint.y)
      ctx.lineTo(x, y)
      ctx.stroke()
    }
    lastPoint = { x, y }
    // Tell Fabric its cache is stale so it re-samples the (now-mutated)
    // working canvas on the next render.
    ;(image as unknown as { dirty: boolean }).dirty = true
    fabricCanvas.requestRenderAll()
  }

  const pointerToImage = (event: PointerEvent) => {
    const rect = fabricCanvas.getElement().getBoundingClientRect()
    // The DOM canvas is CSS-scaled by our viewport transform; convert screen
    // pixels back to Fabric internal pixels before applying the object matrix.
    const scaleX = fabricCanvas.width! / rect.width
    const scaleY = fabricCanvas.height! / rect.height
    const canvasX = (event.clientX - rect.left) * scaleX
    const canvasY = (event.clientY - rect.top) * scaleY
    return canvasToImageLocal(canvasX, canvasY)
  }

  const onPointerDown = (event: PointerEvent) => {
    pressed = true
    lastPoint = null
    const p = pointerToImage(event)
    paint(p.x, p.y)
  }
  const onPointerMove = (event: PointerEvent) => {
    if (!pressed) return
    const p = pointerToImage(event)
    paint(p.x, p.y)
  }
  const onPointerUp = () => {
    if (!pressed) return
    pressed = false
    lastPoint = null
    withHistory(fabricCanvas)?.snapshot()
  }
  const onPointerLeave = () => {
    pressed = false
    lastPoint = null
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerLeave,
    detach() {
      pressed = false
      lastPoint = null
    },
  }
}

/**
 * Public helper: reset an image's erased pixels by rebuilding the working
 * canvas from a fresh source URL. Used by the toolbar "Reset erase" action.
 * Also allows callers to programmatically clear the erase state.
 */
export function resetErase(image: EraserImage): void {
  delete image._eraserWorkingCanvas
  // Force Fabric to re-fetch and re-draw the original bitmap from src.
  const src = image.getSrc()
  if (src) {
    const el = new Image()
    el.crossOrigin = 'anonymous'
    el.onload = () => {
      image.setElement(el)
      ;(image as unknown as { dirty: boolean }).dirty = true
      image.canvas?.requestRenderAll()
    }
    el.src = src
  }
}

// --- fallback matrix helpers (Fabric v7 exposes these but the API surface
// has shifted between minor versions; keep local copies so we work either way).

function invert(m: number[]): number[] {
  const [a, b, c, d, e, f] = m
  const det = a * d - b * c
  if (!det) return [1, 0, 0, 1, 0, 0]
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det]
}

function applyMatrix(m: number[], p: { x: number; y: number }): { x: number; y: number } {
  const [a, b, c, d, e, f] = m
  return { x: a * p.x + c * p.y + e, y: b * p.x + d * p.y + f }
}
