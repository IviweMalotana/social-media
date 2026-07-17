import type { Canvas, FabricImage, TPointerEventInfo } from 'fabric'
import type { HistoryManager } from './history'
import { ensureWorkingCanvas, type EraserImage } from './eraser'

/**
 * Restore tool — undoes background removal in a user-selected rectangle
 * by copying pixels from the ORIGINAL image back into the working canvas.
 *
 * Why
 * ---
 * ISNet is a "salient object detection" model — it picks ONE main subject.
 * Product photos with two bottles, or a bottle + a smaller box, end up
 * with only one item preserved. The CC-largest hole-fill in refineAlpha
 * then discards the other item as noise.
 *
 * Rather than trying to make the model smarter, this tool lets the user
 * say "restore THIS box" by drawing a rectangle over the missing item.
 * We copy the original pixels for those coordinates back into the
 * working canvas, and Fabric re-renders. Anything painted this way still
 * respects the working-canvas contract used by the eraser, magic remove,
 * OCR erase, and everything else in the studio.
 *
 * Requires
 * --------
 * `image._originalSrc` — the pre-BG-remove data URL, set by
 * `removeImageBackground` after the cutout is created. If it's missing
 * (image was never BG-removed) the tool refuses to attach and reports
 * "no original to restore from" so the toolbar disables it cleanly.
 */

type RestoreImage = FabricImage & { _originalSrc?: string; _restoreOriginal?: HTMLCanvasElement }

function withHistory(canvas: Canvas) {
  return (canvas as unknown as { history?: HistoryManager }).history
}

/**
 * Lazy-load the original bitmap into an off-screen canvas the first time
 * the tool attaches. Subsequent boxes reuse it — the source only needs
 * to be decoded once per image.
 */
async function ensureOriginalCanvas(image: RestoreImage): Promise<HTMLCanvasElement | null> {
  if (image._restoreOriginal) return image._restoreOriginal
  if (!image._originalSrc) return null
  const el = new Image()
  el.crossOrigin = 'anonymous'
  await new Promise<void>((resolve, reject) => {
    el.onload = () => resolve()
    el.onerror = () => reject(new Error('restore: original src load failed'))
    el.src = image._originalSrc!
  })
  const c = document.createElement('canvas')
  c.width = el.naturalWidth
  c.height = el.naturalHeight
  const ctx = c.getContext('2d')!
  ctx.drawImage(el, 0, 0)
  image._restoreOriginal = c
  return c
}

export interface RestoreCallbacks {
  onBoxDrag?: (rect: { x: number; y: number; w: number; h: number } | null) => void
  onCursorMove?: (canvasX: number, canvasY: number) => void
  onCursorLeave?: () => void
  onFailed?: (message: string) => void
}

export interface RestoreSession {
  detach: () => void
}

/**
 * Attach a restore session. Behaves like the box eraser: drag a rectangle,
 * release to apply. Instead of erasing, we copy the original pixels for
 * that region back into the working canvas at the same image-local coords.
 */
export function attachRestore(
  fabricCanvas: Canvas,
  image: RestoreImage,
  callbacks: RestoreCallbacks = {},
): RestoreSession {
  const workingCanvas = ensureWorkingCanvas(image as EraserImage)
  const workingCtx = workingCanvas.getContext('2d')!

  // Kick off the original-source load; if it fails, report and no-op.
  let original: HTMLCanvasElement | null = null
  let originalReady = false
  ensureOriginalCanvas(image)
    .then((c) => {
      original = c
      originalReady = true
      if (!c) callbacks.onFailed?.('No original image cached — run Remove background first.')
    })
    .catch((err) => callbacks.onFailed?.(err instanceof Error ? err.message : String(err)))

  const canvasToImageLocal = (canvasX: number, canvasY: number): { x: number; y: number } => {
    const matrix = image.calcTransformMatrix()
    const inv = invert(matrix)
    const local = applyMatrix(inv, { x: canvasX, y: canvasY })
    return {
      x: local.x + workingCanvas.width / 2,
      y: local.y + workingCanvas.height / 2,
    }
  }

  let boxStart: { x: number; y: number } | null = null

  const paintBox = (canvasRect: { x: number; y: number; w: number; h: number }) => {
    if (!original) return
    // Translate the canvas-space rectangle into image-local pixels.
    const a = canvasToImageLocal(canvasRect.x, canvasRect.y)
    const b = canvasToImageLocal(canvasRect.x + canvasRect.w, canvasRect.y + canvasRect.h)
    const x = Math.max(0, Math.floor(Math.min(a.x, b.x)))
    const y = Math.max(0, Math.floor(Math.min(a.y, b.y)))
    const rw = Math.min(workingCanvas.width - x, Math.ceil(Math.abs(b.x - a.x)))
    const rh = Math.min(workingCanvas.height - y, Math.ceil(Math.abs(b.y - a.y)))
    if (rw < 2 || rh < 2) return
    // The original bitmap may be at a different resolution than the working
    // canvas (imgly can downscale during processing). Rescale on the fly by
    // mapping from working-canvas coords into original-image coords.
    const scaleX = original.width / workingCanvas.width
    const scaleY = original.height / workingCanvas.height
    workingCtx.drawImage(
      original,
      x * scaleX,
      y * scaleY,
      rw * scaleX,
      rh * scaleY,
      x,
      y,
      rw,
      rh,
    )
    ;(image as unknown as { dirty: boolean }).dirty = true
    fabricCanvas.requestRenderAll()
  }

  const onMouseDown = (e: TPointerEventInfo) => {
    if (!originalReady) return
    const pointer = (e as unknown as { scenePoint: { x: number; y: number } }).scenePoint
    boxStart = { x: pointer.x, y: pointer.y }
    callbacks.onBoxDrag?.({ x: pointer.x, y: pointer.y, w: 0, h: 0 })
  }

  const onMouseMove = (e: TPointerEventInfo) => {
    const pointer = (e as unknown as { scenePoint: { x: number; y: number } }).scenePoint
    callbacks.onCursorMove?.(pointer.x, pointer.y)
    if (!boxStart) return
    callbacks.onBoxDrag?.({
      x: Math.min(boxStart.x, pointer.x),
      y: Math.min(boxStart.y, pointer.y),
      w: Math.abs(pointer.x - boxStart.x),
      h: Math.abs(pointer.y - boxStart.y),
    })
  }

  const onMouseUp = (e: TPointerEventInfo) => {
    if (!boxStart) return
    const pointer = (e as unknown as { scenePoint: { x: number; y: number } }).scenePoint
    const rect = {
      x: Math.min(boxStart.x, pointer.x),
      y: Math.min(boxStart.y, pointer.y),
      w: Math.abs(pointer.x - boxStart.x),
      h: Math.abs(pointer.y - boxStart.y),
    }
    if (rect.w > 2 && rect.h > 2) {
      paintBox(rect)
      withHistory(fabricCanvas)?.snapshot()
    }
    boxStart = null
    callbacks.onBoxDrag?.(null)
  }

  const onMouseOut = () => {
    callbacks.onCursorLeave?.()
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
