import type { Canvas, FabricImage, TPointerEventInfo } from 'fabric'
import type { HistoryManager } from './history'
import { eraseTextBoxes } from './textErase'

/**
 * Eraser tool — free-hand painting or box-select that punches transparent
 * pixels into the selected image. Not content-aware ("magic remove" needs a
 * WASM inpainting model, deferred), but reliable and cheap: user drags over
 * the label / watermark / whatever, and those pixels become transparent.
 * Combine with a solid canvas background color to visually "remove" the
 * erased region.
 *
 * How it works:
 * 1. Convert the image's source (an <img> element) into a same-size
 *    <canvas> element. Fabric renders whatever HTMLElement its `.getElement()`
 *    points at, so swapping in a canvas gives us a mutable pixel buffer.
 * 2. On Fabric mouse events, translate the pointer coordinates into
 *    image-local pixel coordinates (accounting for scale/rotation/flip)
 *    and paint transparent circles (brush) or rectangles (box) via
 *    `destination-out` compositing.
 * 3. Fabric re-renders from the updated canvas element on each frame.
 *
 * The transformation from canvas → image-local coordinates multiplies the
 * pointer by the inverse of the image's calcTransformMatrix so it works
 * correctly even after the image has been rotated, scaled, flipped, or
 * nudged.
 */

export type EraserImage = FabricImage & { _eraserWorkingCanvas?: HTMLCanvasElement }

function withHistory(canvas: Canvas) {
  return (canvas as unknown as { history?: HistoryManager }).history
}

export function ensureWorkingCanvas(img: EraserImage): HTMLCanvasElement {
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

export interface EraserCallbacks {
  /**
   * Fires whenever the pointer moves over the canvas (regardless of button
   * state). Coordinates are in Fabric canvas-space. Used by the CanvasStage
   * to position the visible brush indicator overlay.
   */
  onCursorMove?: (canvasX: number, canvasY: number) => void
  /**
   * Fires when the pointer leaves the canvas so the visible brush indicator
   * can be hidden.
   */
  onCursorLeave?: () => void
  /**
   * Fires during a box-erase drag with the current selection rectangle in
   * canvas coordinates. `null` when no drag is in progress.
   */
  onBoxDrag?: (rect: { x: number; y: number; w: number; h: number } | null) => void
}

export interface EraserSession {
  detach: () => void
}

/**
 * Attach an eraser session that uses Fabric's own mouse event system (rather
 * than raw DOM listeners on the wrapped canvas element — Fabric adds an
 * upper canvas overlay for interaction that swallows those events).
 *
 * `mode: 'brush'` paints circles as the user drags.
 * `mode: 'box'` waits for mousedown-mousemove-mouseup and erases the
 *   rectangular region between them on release.
 */
export function attachEraser(
  fabricCanvas: Canvas,
  image: EraserImage,
  getBrushSize: () => number,
  mode: 'brush' | 'box' | 'smart',
  callbacks: EraserCallbacks = {},
): EraserSession {
  const workingCanvas = ensureWorkingCanvas(image)
  const ctx = workingCanvas.getContext('2d')!
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  let pressed = false
  let lastImgPoint: { x: number; y: number } | null = null
  let boxStart: { x: number; y: number } | null = null

  const canvasToImageLocal = (canvasX: number, canvasY: number): { x: number; y: number } => {
    const matrix = image.calcTransformMatrix()
    const invertMatrix = invert(matrix)
    const local = applyMatrix(invertMatrix, { x: canvasX, y: canvasY })
    // Fabric places object origin at its centre; the working canvas uses
    // top-left at (0,0), so shift by half-size.
    return {
      x: local.x + workingCanvas.width / 2,
      y: local.y + workingCanvas.height / 2,
    }
  }

  const paintBrush = (x: number, y: number) => {
    const size = getBrushSize()
    ctx.globalCompositeOperation = 'destination-out'
    ctx.fillStyle = 'rgba(0,0,0,1)'
    ctx.beginPath()
    ctx.arc(x, y, size / 2, 0, Math.PI * 2)
    ctx.fill()
    if (lastImgPoint) {
      // Interpolate between successive events so fast drags don't leave gaps.
      ctx.lineWidth = size
      ctx.strokeStyle = 'rgba(0,0,0,1)'
      ctx.beginPath()
      ctx.moveTo(lastImgPoint.x, lastImgPoint.y)
      ctx.lineTo(x, y)
      ctx.stroke()
    }
    lastImgPoint = { x, y }
    ;(image as unknown as { dirty: boolean }).dirty = true
    fabricCanvas.requestRenderAll()
  }

  const eraseRect = (canvasRect: { x: number; y: number; w: number; h: number }) => {
    // Convert two corners of the canvas-space rect into image-local pixels
    // and erase the full quad between them. For simplicity (and because the
    // typical use is on an un-rotated image), we axis-align in image space
    // — rotation would need a full 4-corner path.
    const a = canvasToImageLocal(canvasRect.x, canvasRect.y)
    const b = canvasToImageLocal(canvasRect.x + canvasRect.w, canvasRect.y + canvasRect.h)
    const x = Math.min(a.x, b.x)
    const y = Math.min(a.y, b.y)
    const w = Math.abs(b.x - a.x)
    const h = Math.abs(b.y - a.y)
    ctx.globalCompositeOperation = 'destination-out'
    ctx.fillStyle = 'rgba(0,0,0,1)'
    ctx.fillRect(x, y, w, h)
    ;(image as unknown as { dirty: boolean }).dirty = true
    fabricCanvas.requestRenderAll()
  }

  const onMouseDown = (e: TPointerEventInfo) => {
    const pointer = (e as unknown as { scenePoint: { x: number; y: number } }).scenePoint
    if (mode === 'brush') {
      pressed = true
      lastImgPoint = null
      const p = canvasToImageLocal(pointer.x, pointer.y)
      paintBrush(p.x, p.y)
    } else {
      // 'box' and 'smart' share the same drag-rectangle interaction; only the
      // release action differs.
      pressed = true
      boxStart = { x: pointer.x, y: pointer.y }
      callbacks.onBoxDrag?.({ x: pointer.x, y: pointer.y, w: 0, h: 0 })
    }
  }

  const onMouseMove = (e: TPointerEventInfo) => {
    const pointer = (e as unknown as { scenePoint: { x: number; y: number } }).scenePoint
    callbacks.onCursorMove?.(pointer.x, pointer.y)
    if (!pressed) return
    if (mode === 'brush') {
      const p = canvasToImageLocal(pointer.x, pointer.y)
      paintBrush(p.x, p.y)
    } else if (boxStart) {
      callbacks.onBoxDrag?.({
        x: Math.min(boxStart.x, pointer.x),
        y: Math.min(boxStart.y, pointer.y),
        w: Math.abs(pointer.x - boxStart.x),
        h: Math.abs(pointer.y - boxStart.y),
      })
    }
  }

  const onMouseUp = (e: TPointerEventInfo) => {
    if (!pressed) return
    pressed = false
    if ((mode === 'box' || mode === 'smart') && boxStart) {
      const pointer = (e as unknown as { scenePoint: { x: number; y: number } }).scenePoint
      const rect = {
        x: Math.min(boxStart.x, pointer.x),
        y: Math.min(boxStart.y, pointer.y),
        w: Math.abs(pointer.x - boxStart.x),
        h: Math.abs(pointer.y - boxStart.y),
      }
      if (rect.w > 2 && rect.h > 2) {
        if (mode === 'smart') {
          // Convert the canvas-space rect to image-local pixels (same math
          // eraseRect uses, then hand the result to the text-erase smart-fill
          // so this box gets the per-row bottle-colour treatment instead of
          // being punched transparent).
          const a = canvasToImageLocal(rect.x, rect.y)
          const b = canvasToImageLocal(rect.x + rect.w, rect.y + rect.h)
          const x = Math.min(a.x, b.x)
          const y = Math.min(a.y, b.y)
          const bw = Math.abs(b.x - a.x)
          const bh = Math.abs(b.y - a.y)
          eraseTextBoxes(fabricCanvas, image, [{ x, y, w: bw, h: bh }])
        } else {
          eraseRect(rect)
        }
      }
      boxStart = null
      callbacks.onBoxDrag?.(null)
    }
    lastImgPoint = null
    withHistory(fabricCanvas)?.snapshot()
  }

  const onMouseOut = () => {
    callbacks.onCursorLeave?.()
    pressed = false
    lastImgPoint = null
    boxStart = null
    callbacks.onBoxDrag?.(null)
  }

  fabricCanvas.on('mouse:down', onMouseDown)
  fabricCanvas.on('mouse:move', onMouseMove)
  fabricCanvas.on('mouse:up', onMouseUp)
  fabricCanvas.on('mouse:out', onMouseOut)

  return {
    detach() {
      fabricCanvas.off('mouse:down', onMouseDown)
      fabricCanvas.off('mouse:move', onMouseMove)
      fabricCanvas.off('mouse:up', onMouseUp)
      fabricCanvas.off('mouse:out', onMouseOut)
    },
  }
}

/**
 * Reset an image's erased pixels by rebuilding the working canvas from the
 * original source URL. Exposed for a future "Reset erase" toolbar action.
 */
export function resetErase(image: EraserImage): void {
  delete image._eraserWorkingCanvas
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

// --- 2D affine matrix helpers. Fabric v7 does expose util helpers here but
// the API has shifted between minor versions; keep local copies so we're
// resilient to that.

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
