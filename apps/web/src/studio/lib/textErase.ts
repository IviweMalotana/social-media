import { createWorker, type Worker as TesseractWorker } from 'tesseract.js'
import type { Canvas, FabricImage } from 'fabric'
import type { HistoryManager } from './history'
import { ensureWorkingCanvas, type EraserImage } from './eraser'

/**
 * OCR-driven text eraser. Runs Tesseract.js (WASM) on the target image's
 * working canvas, gets word-level bounding boxes, and paints each transparent
 * — punching all detected text (labels, watermarks, batch codes, etc.) out
 * of the image in one action.
 *
 * Design notes
 * - Worker is lazy-initialised on first use and cached, because loading
 *   the tesseract WASM + English trained data is ~10 MB. Subsequent calls
 *   reuse it and are near-instant to start.
 * - Erasure happens on the working canvas (same buffer the eraser tool
 *   mutates), so text-erase and manual eraser strokes compose cleanly.
 * - Each word bbox gets a small padding so anti-aliased glyph edges are
 *   caught along with the solid stroke.
 * - Progress is surfaced via callback so the UI can show a % bar during
 *   the multi-second recognition pass.
 */

const BBOX_PADDING_PX = 3

let workerPromise: Promise<TesseractWorker> | null = null

function withHistory(canvas: Canvas) {
  return (canvas as unknown as { history?: HistoryManager }).history
}

async function getWorker(onProgress?: (fraction: number) => void): Promise<TesseractWorker> {
  if (!workerPromise) {
    workerPromise = createWorker('eng', 1, {
      logger: (m: { status: string; progress: number }) => {
        // Tesseract reports "loading language traineddata" (before) and
        // "recognizing text" (during OCR). Surface the recognition phase
        // only — the initial load is a one-time cost we hide behind
        // "Loading OCR…" copy in the UI.
        if (m.status === 'recognizing text' && typeof m.progress === 'number') {
          onProgress?.(m.progress)
        }
      },
    })
  }
  return workerPromise
}

export interface EraseTextResult {
  wordsErased: number
  boxes: { x: number; y: number; w: number; h: number }[]
}

/**
 * Erase every detected word on the image. `onPhase` fires with a coarse
 * state ('loading' → 'recognizing' → 'painting'), `onProgress` with a
 * [0,1] fraction during 'recognizing'.
 */
export async function eraseAllText(
  fabricCanvas: Canvas,
  image: FabricImage,
  callbacks: {
    onPhase?: (phase: 'loading' | 'recognizing' | 'painting' | 'done') => void
    onProgress?: (fraction: number) => void
  } = {},
): Promise<EraseTextResult> {
  callbacks.onPhase?.('loading')
  const workingCanvas = ensureWorkingCanvas(image as EraserImage)
  const worker = await getWorker(callbacks.onProgress)

  callbacks.onPhase?.('recognizing')
  const result = await worker.recognize(workingCanvas)
  const words = result.data.words ?? []

  callbacks.onPhase?.('painting')
  const ctx = workingCanvas.getContext('2d')!
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  ctx.fillStyle = 'rgba(0,0,0,1)'
  const boxes: EraseTextResult['boxes'] = []
  for (const word of words) {
    const bbox = word.bbox
    if (!bbox) continue
    const x = Math.max(0, bbox.x0 - BBOX_PADDING_PX)
    const y = Math.max(0, bbox.y0 - BBOX_PADDING_PX)
    const w = bbox.x1 - bbox.x0 + BBOX_PADDING_PX * 2
    const h = bbox.y1 - bbox.y0 + BBOX_PADDING_PX * 2
    ctx.fillRect(x, y, w, h)
    boxes.push({ x, y, w, h })
  }
  ctx.restore()
  ;(image as unknown as { dirty: boolean }).dirty = true
  fabricCanvas.requestRenderAll()
  withHistory(fabricCanvas)?.snapshot()

  callbacks.onPhase?.('done')
  return { wordsErased: words.length, boxes }
}
