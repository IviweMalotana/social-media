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
 *
 * Hallucination filtering
 * -----------------------
 * Tesseract has no concept of "is this really text vs. a texture that
 * happens to look like text." Ridged surfaces (glass bottle flutes,
 * fabric weave, brick wall), fine repeating patterns, and even random
 * noise get flagged as strings of characters at low confidence.
 *
 * A first pass at Erase-all-text carved rectangular chunks out of a
 * fluted-glass bottle because Tesseract read the vertical ridges as
 * columns of letters. We filter before erasing:
 *
 *   1. Confidence ≥ MIN_CONFIDENCE (60). Real text on a photo is
 *      usually >85; hallucinations cluster below 60.
 *   2. At least MIN_ALNUM alphanumeric characters in the detected
 *      string. Random-symbol matches ("!|/(") get dropped.
 *   3. Bounding-box dimensions plausible for text: at least a couple
 *      pixels wide and tall, not larger than a big fraction of the
 *      image (giant boxes are almost always the whole scene being
 *      mislabelled).
 */

const BBOX_PADDING_PX = 3
const MIN_CONFIDENCE = 60
const MIN_ALNUM = 2
const MIN_BBOX_SIDE = 4
const MAX_BBOX_SIDE_FRACTION = 0.5

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
  wordsSkipped: number
  boxes: { x: number; y: number; w: number; h: number }[]
}

export interface TextCandidate {
  id: string
  x: number
  y: number
  w: number
  h: number
  text: string
  confidence: number
  /**
   * True when the candidate passed the confidence/alnum/size filters —
   * i.e. Tesseract is reasonably sure this is real text, not a texture
   * mislabelled as characters. The review UI defaults to selecting these
   * so the common case ("erase everything obvious") is one click.
   */
  likelyReal: boolean
}

/**
 * Reject a Tesseract "word" if it looks like a hallucination.
 * Cheap sanity checks — see the file-top comment for why each one matters.
 */
function looksLikeRealText(
  word: { text?: string; confidence?: number; bbox?: { x0: number; y0: number; x1: number; y1: number } },
  imageWidth: number,
  imageHeight: number,
): boolean {
  if (!word.bbox) return false
  if ((word.confidence ?? 0) < MIN_CONFIDENCE) return false
  const text = word.text ?? ''
  const alnum = (text.match(/[\p{L}\p{N}]/gu) ?? []).length
  if (alnum < MIN_ALNUM) return false
  const boxW = word.bbox.x1 - word.bbox.x0
  const boxH = word.bbox.y1 - word.bbox.y0
  if (boxW < MIN_BBOX_SIDE || boxH < MIN_BBOX_SIDE) return false
  if (boxW > imageWidth * MAX_BBOX_SIDE_FRACTION && boxH > imageHeight * MAX_BBOX_SIDE_FRACTION) return false
  return true
}

/**
 * Detect text without erasing. Returns every candidate Tesseract flagged,
 * each tagged with a `likelyReal` boolean based on the same confidence/
 * alnum/size filters `eraseAllText` used to apply. Powers the two-step
 * "Detect text → review → apply" flow — see the QuickActionsPanel /
 * CanvasStage wiring for how this gets surfaced.
 */
export async function detectText(
  image: FabricImage,
  callbacks: {
    onPhase?: (phase: 'loading' | 'recognizing' | 'done') => void
    onProgress?: (fraction: number) => void
  } = {},
): Promise<TextCandidate[]> {
  callbacks.onPhase?.('loading')
  const workingCanvas = ensureWorkingCanvas(image as EraserImage)
  const worker = await getWorker(callbacks.onProgress)

  callbacks.onPhase?.('recognizing')
  const result = await worker.recognize(workingCanvas)
  const words = result.data.words ?? []
  const candidates: TextCandidate[] = []
  for (const word of words) {
    if (!word.bbox) continue
    const boxW = word.bbox.x1 - word.bbox.x0
    const boxH = word.bbox.y1 - word.bbox.y0
    if (boxW < MIN_BBOX_SIDE || boxH < MIN_BBOX_SIDE) continue
    candidates.push({
      id: `${word.bbox.x0}-${word.bbox.y0}-${boxW}x${boxH}`,
      x: Math.max(0, word.bbox.x0 - BBOX_PADDING_PX),
      y: Math.max(0, word.bbox.y0 - BBOX_PADDING_PX),
      w: boxW + BBOX_PADDING_PX * 2,
      h: boxH + BBOX_PADDING_PX * 2,
      text: word.text ?? '',
      confidence: word.confidence ?? 0,
      likelyReal: looksLikeRealText(word, workingCanvas.width, workingCanvas.height),
    })
  }
  callbacks.onPhase?.('done')
  return candidates
}

const RING_SAMPLE_WIDTH = 8

/**
 * Erase a fixed list of rectangles and repaint them with the surrounding
 * colour, so a label removed off a coloured bottle becomes that colour
 * instead of a transparent (or "canvas background" white) hole.
 *
 * How
 * ---
 * For every box:
 *   1. Sample the ring of OPAQUE pixels immediately outside the box
 *      (RING_SAMPLE_WIDTH px wide). Weight them equally, average RGB.
 *   2. If no opaque neighbours (box floating in transparent background),
 *      punch the box transparent — same as the old behaviour.
 *   3. Otherwise paint the box with the averaged colour at full alpha.
 *
 * Only one ImageData round-trip regardless of how many boxes we process,
 * so this stays fast on big images.
 *
 * Trade-off worth noting
 * ----------------------
 * Flat colour fill on a curved / shaded surface (glass bottle, plastic
 * container) reads as "smooth patch where the label was" — visibly
 * different from the bottle's shine. It's a big step up from "obvious
 * transparent gap," and it's the right default for the pipeline. If a
 * user wants true photorealistic reconstruction the Magic Remove tool
 * covers that; the Cleanup section still offers Fill erased as a manual
 * follow-up.
 */
export function eraseTextBoxes(
  fabricCanvas: Canvas,
  image: FabricImage,
  boxes: { x: number; y: number; w: number; h: number }[],
): void {
  if (boxes.length === 0) return
  const workingCanvas = ensureWorkingCanvas(image as EraserImage)
  const ctx = workingCanvas.getContext('2d')!
  const w = workingCanvas.width
  const h = workingCanvas.height
  const imageData = ctx.getImageData(0, 0, w, h)
  const data = imageData.data

  for (const b of boxes) {
    // Clamp box to image bounds and pre-compute ring extents.
    const boxLeft = Math.max(0, Math.floor(b.x))
    const boxTop = Math.max(0, Math.floor(b.y))
    const boxRight = Math.min(w, Math.floor(b.x + b.w))
    const boxBottom = Math.min(h, Math.floor(b.y + b.h))
    if (boxRight <= boxLeft || boxBottom <= boxTop) continue

    let rSum = 0
    let gSum = 0
    let bSum = 0
    let count = 0
    const ringLeft = Math.max(0, boxLeft - RING_SAMPLE_WIDTH)
    const ringTop = Math.max(0, boxTop - RING_SAMPLE_WIDTH)
    const ringRight = Math.min(w, boxRight + RING_SAMPLE_WIDTH)
    const ringBottom = Math.min(h, boxBottom + RING_SAMPLE_WIDTH)
    for (let y = ringTop; y < ringBottom; y++) {
      for (let x = ringLeft; x < ringRight; x++) {
        // Only sample the RING (outside the box) — not the box interior,
        // which is what we're about to overwrite.
        if (x >= boxLeft && x < boxRight && y >= boxTop && y < boxBottom) continue
        const i = (y * w + x) * 4
        // Skip fully-transparent neighbours (background). Semi-transparent
        // pixels aren't sampled either — they'd bias toward the background
        // colour where the mask is soft.
        if (data[i + 3] < 200) continue
        rSum += data[i]
        gSum += data[i + 1]
        bSum += data[i + 2]
        count++
      }
    }

    if (count === 0) {
      // No opaque surroundings — box is floating in transparent background,
      // so best we can do is punch it out completely.
      for (let y = boxTop; y < boxBottom; y++) {
        for (let x = boxLeft; x < boxRight; x++) {
          data[(y * w + x) * 4 + 3] = 0
        }
      }
      continue
    }

    const rAvg = rSum / count
    const gAvg = gSum / count
    const bAvg = bSum / count
    for (let y = boxTop; y < boxBottom; y++) {
      for (let x = boxLeft; x < boxRight; x++) {
        const i = (y * w + x) * 4
        data[i] = rAvg
        data[i + 1] = gAvg
        data[i + 2] = bAvg
        data[i + 3] = 255
      }
    }
  }

  ctx.putImageData(imageData, 0, 0)
  ;(image as unknown as { dirty: boolean }).dirty = true
  fabricCanvas.requestRenderAll()
  withHistory(fabricCanvas)?.snapshot()
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
  let skipped = 0
  for (const word of words) {
    if (!looksLikeRealText(word, workingCanvas.width, workingCanvas.height)) {
      skipped++
      continue
    }
    const bbox = word.bbox!
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
  return { wordsErased: boxes.length, wordsSkipped: skipped, boxes }
}
