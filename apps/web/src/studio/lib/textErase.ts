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

// Tesseract returns bboxes tight around the visible ink stroke. Anti-aliased
// pixels at the top/bottom edge of each glyph (light halos around letters
// against a darker surface) sit *outside* the bbox and get left behind as a
// faint white line if we don't pad. 7px catches typical 24-48pt product-label
// glyph AA reliably without inflating boxes so much that we start eating
// surrounding subject pixels.
const BBOX_PADDING_PX = 7
const MIN_CONFIDENCE = 60
const MIN_ALNUM = 2
const MIN_BBOX_SIDE = 2
// Upscale the working canvas by this factor before feeding to Tesseract.
// Tiny label text (e.g. "Preferred packaging supplier" at the bottom of a
// product photo) is often below the model's per-glyph pixel threshold at
// native resolution. Rendering into a 2× canvas gives Tesseract 4× the
// pixels per glyph and catches text that wouldn't be detected otherwise.
// Bboxes are divided by this factor before returning so they still index
// the ORIGINAL working canvas correctly.
const OCR_UPSCALE = 2
const MAX_BBOX_SIDE_FRACTION = 0.5

let workerPromise: Promise<TesseractWorker> | null = null

function withHistory(canvas: Canvas) {
  return (canvas as unknown as { history?: HistoryManager }).history
}

async function getWorker(onProgress?: (fraction: number) => void): Promise<TesseractWorker> {
  if (!workerPromise) {
    // Load English + Simplified Chinese so labels with Chinese characters
     // (common on cosmetics/supplements from Chinese suppliers) get detected
     // as well. Adds ~15 MB to the first-use download; cached after.
    workerPromise = createWorker(['eng', 'chi_sim'], 1, {
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
  // Feed Tesseract an upscaled copy so tiny glyphs (bottom-of-label fine
  // print) have enough pixels per character to be recognised.
  const ocrCanvas = document.createElement('canvas')
  ocrCanvas.width = workingCanvas.width * OCR_UPSCALE
  ocrCanvas.height = workingCanvas.height * OCR_UPSCALE
  const ocrCtx = ocrCanvas.getContext('2d')!
  ocrCtx.imageSmoothingEnabled = true
  ocrCtx.imageSmoothingQuality = 'high'
  ocrCtx.drawImage(workingCanvas, 0, 0, ocrCanvas.width, ocrCanvas.height)
  const result = await worker.recognize(ocrCanvas)
  const words = result.data.words ?? []
  const candidates: TextCandidate[] = []
  for (const word of words) {
    if (!word.bbox) continue
    // Downscale bboxes so they index the ORIGINAL working canvas.
    const bx0 = word.bbox.x0 / OCR_UPSCALE
    const by0 = word.bbox.y0 / OCR_UPSCALE
    const bx1 = word.bbox.x1 / OCR_UPSCALE
    const by1 = word.bbox.y1 / OCR_UPSCALE
    const boxW = bx1 - bx0
    const boxH = by1 - by0
    if (boxW < MIN_BBOX_SIDE || boxH < MIN_BBOX_SIDE) continue
    candidates.push({
      id: `${bx0.toFixed(1)}-${by0.toFixed(1)}-${boxW.toFixed(1)}x${boxH.toFixed(1)}`,
      x: Math.max(0, bx0 - BBOX_PADDING_PX),
      y: Math.max(0, by0 - BBOX_PADDING_PX),
      w: boxW + BBOX_PADDING_PX * 2,
      h: boxH + BBOX_PADDING_PX * 2,
      text: word.text ?? '',
      confidence: word.confidence ?? 0,
      // Pass the OCR canvas dimensions so the max-size ratio in
      // looksLikeRealText compares apples to apples (word.bbox is still
      // in upscaled coords at this point).
      likelyReal: looksLikeRealText(word, ocrCanvas.width, ocrCanvas.height),
    })
  }
  callbacks.onPhase?.('done')
  return candidates
}

const SAMPLE_STRIP = 6
const SAMPLE_SKIP = 2
const SAMPLE_V_WINDOW = 2
const OPAQUE_ALPHA = 200

/**
 * Erase a fixed list of rectangles and repaint them with the surrounding
 * colour, so a label removed off a coloured bottle becomes that colour
 * instead of a transparent (or "canvas background" white) hole.
 *
 * How the fill works (per-row horizontal interpolation)
 * -----------------------------------------------------
 * A flat average across the whole ring produces a visible "faded patch"
 * on any surface with vertical lighting variation — bottles, glassware,
 * cylinders — because it ignores the local shade at each row.
 *
 * Instead, for every box:
 *   1. For each row Y inside the box, walk left and right along that row
 *      (through the pixels JUST outside the box) and average a short
 *      strip of opaque samples. That gives left-colour + right-colour
 *      per row — preserving the vertical lighting gradient of the bottle.
 *   2. For each interior pixel at (X, Y), linearly interpolate between
 *      the row's left-colour and right-colour based on X's position in
 *      the row. So the fill blends smoothly left→right across the box
 *      while the vertical gradient (highlights top, shadows bottom) is
 *      carried down naturally.
 *   3. Rows where both sides are transparent fall back to a vertical
 *      neighbour scan (nearest opaque above / below on the same column).
 *      Any pixel still without a valid sample is punched transparent —
 *      the box was floating in space to begin with.
 *
 * Runs on a single ImageData buffer for all boxes, so we're paying one
 * expensive get/put round-trip regardless of how many labels get erased.
 *
 * If a user still wants photorealistic reconstruction (glare on glass
 * under the label), Magic Remove covers that — this pass targets the
 * pipeline default.
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
  const paintedRegions: { left: number; top: number; right: number; bottom: number }[] = []

  for (const b of boxes) {
    const boxLeft = Math.max(0, Math.floor(b.x))
    const boxTop = Math.max(0, Math.floor(b.y))
    const boxRight = Math.min(w, Math.floor(b.x + b.w))
    const boxBottom = Math.min(h, Math.floor(b.y + b.h))
    if (boxRight <= boxLeft || boxBottom <= boxTop) continue
    paintedRegions.push({ left: boxLeft, top: boxTop, right: boxRight, bottom: boxBottom })

    // For every row inside the box, work out left- and right-side sample
    // colours by scanning outward through opaque pixels. Cache them per row
    // so the interior-pixel loop can just interpolate.
    interface Side { r: number; g: number; b: number; count: number }
    const emptySide = (): Side => ({ r: 0, g: 0, b: 0, count: 0 })
    const leftByRow: Side[] = []
    const rightByRow: Side[] = []
    // Pool samples from a VERTICAL WINDOW around each row (SAMPLE_V_WINDOW
     // rows above + below). Sampling only row Y produced horizontal streaks
     // when consecutive rows happened to hit different tones (highlight vs
     // shadow); a 5-row window averages that noise away and yields a smooth
     // vertical gradient down the fill.
    for (let y = boxTop; y < boxBottom; y++) {
      const left = emptySide()
      const right = emptySide()
      for (let dy = -SAMPLE_V_WINDOW; dy <= SAMPLE_V_WINDOW; dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= h) continue
        // Walk outward on this window-row, SKIP the first SAMPLE_SKIP opaque
        // pixels (they carry the anti-aliased halo from the label edge), then
        // take the next SAMPLE_STRIP.
        let leftSeen = 0
        let leftHits = 0
        for (
          let x = boxLeft - 1;
          x >= Math.max(0, boxLeft - (SAMPLE_STRIP + SAMPLE_SKIP) * 4) && leftHits < SAMPLE_STRIP;
          x--
        ) {
          const i = (yy * w + x) * 4
          if (data[i + 3] < OPAQUE_ALPHA) continue
          if (leftSeen++ < SAMPLE_SKIP) continue
          left.r += data[i]
          left.g += data[i + 1]
          left.b += data[i + 2]
          left.count++
          leftHits++
        }
        let rightSeen = 0
        let rightHits = 0
        for (
          let x = boxRight;
          x < Math.min(w, boxRight + (SAMPLE_STRIP + SAMPLE_SKIP) * 4) && rightHits < SAMPLE_STRIP;
          x++
        ) {
          const i = (yy * w + x) * 4
          if (data[i + 3] < OPAQUE_ALPHA) continue
          if (rightSeen++ < SAMPLE_SKIP) continue
          right.r += data[i]
          right.g += data[i + 1]
          right.b += data[i + 2]
          right.count++
          rightHits++
        }
      }
      leftByRow.push(left)
      rightByRow.push(right)
    }

    for (let y = boxTop; y < boxBottom; y++) {
      const rowIdx = y - boxTop
      const left = leftByRow[rowIdx]
      const right = rightByRow[rowIdx]
      const hasLeft = left.count > 0
      const hasRight = right.count > 0
      const boxWidth = boxRight - boxLeft
      for (let x = boxLeft; x < boxRight; x++) {
        const i = (y * w + x) * 4
        if (hasLeft && hasRight) {
          const t = (x - boxLeft) / Math.max(1, boxWidth - 1)
          data[i] = (left.r / left.count) * (1 - t) + (right.r / right.count) * t
          data[i + 1] = (left.g / left.count) * (1 - t) + (right.g / right.count) * t
          data[i + 2] = (left.b / left.count) * (1 - t) + (right.b / right.count) * t
          data[i + 3] = 255
        } else if (hasLeft) {
          data[i] = left.r / left.count
          data[i + 1] = left.g / left.count
          data[i + 2] = left.b / left.count
          data[i + 3] = 255
        } else if (hasRight) {
          data[i] = right.r / right.count
          data[i + 1] = right.g / right.count
          data[i + 2] = right.b / right.count
          data[i + 3] = 255
        } else {
          // Fall back to vertical neighbours on this column — walk up + down
          // through opaque pixels, average.
          let r = 0, g = 0, bch = 0, count = 0
          for (let yy = y - 1; yy >= Math.max(0, y - SAMPLE_STRIP * 4) && count < SAMPLE_STRIP; yy--) {
            const j = (yy * w + x) * 4
            if (data[j + 3] < OPAQUE_ALPHA) continue
            r += data[j]; g += data[j + 1]; bch += data[j + 2]; count++
          }
          for (let yy = y + 1; yy < Math.min(h, y + SAMPLE_STRIP * 4) && count < SAMPLE_STRIP * 2; yy++) {
            const j = (yy * w + x) * 4
            if (data[j + 3] < OPAQUE_ALPHA) continue
            r += data[j]; g += data[j + 1]; bch += data[j + 2]; count++
          }
          if (count > 0) {
            data[i] = r / count
            data[i + 1] = g / count
            data[i + 2] = bch / count
            data[i + 3] = 255
          } else {
            // No opaque neighbours at all — box was floating in transparent
            // background. Punch it out completely.
            data[i + 3] = 0
          }
        }
      }
    }
  }

  // Post-fill blur: run a 3-pixel box blur over just the painted regions to
  // smooth any residual row-to-row noise in the per-row interpolation.
  // Sampling is stable but the bottle's own local variation carries through
  // and can read as streaks; the blur turns those into a soft gradient
  // without touching a single pixel outside the erase boxes.
  for (const region of paintedRegions) {
    blurRegion(data, w, h, region.left, region.top, region.right, region.bottom, 3)
  }

  ctx.putImageData(imageData, 0, 0)
  ;(image as unknown as { dirty: boolean }).dirty = true
  fabricCanvas.requestRenderAll()
  withHistory(fabricCanvas)?.snapshot()
}

/**
 * Box blur limited to a specified rectangle, running on the passed-in
 * Uint8ClampedArray in place. Uses a separable pass (horizontal then
 * vertical) to keep it O(W*H*radius) rather than O(W*H*radius²).
 * Samples slightly outside the region on the source side so the fill
 * blends into whatever's adjacent, avoiding a hard step at the box edge.
 */
function blurRegion(
  data: Uint8ClampedArray,
  imgW: number,
  imgH: number,
  left: number,
  top: number,
  right: number,
  bottom: number,
  radius: number,
): void {
  const rw = right - left
  const rh = bottom - top
  if (rw <= 0 || rh <= 0) return
  // Copy source region + padding into a working buffer so the two passes
  // don't read from partially-modified data.
  const pad = radius
  const srcW = rw + pad * 2
  const srcH = rh + pad * 2
  const src = new Uint8ClampedArray(srcW * srcH * 4)
  for (let y = 0; y < srcH; y++) {
    const gy = Math.max(0, Math.min(imgH - 1, top - pad + y))
    for (let x = 0; x < srcW; x++) {
      const gx = Math.max(0, Math.min(imgW - 1, left - pad + x))
      const si = (y * srcW + x) * 4
      const gi = (gy * imgW + gx) * 4
      src[si] = data[gi]
      src[si + 1] = data[gi + 1]
      src[si + 2] = data[gi + 2]
      src[si + 3] = data[gi + 3]
    }
  }
  const tmp = new Uint8ClampedArray(src.length)
  // Horizontal pass.
  for (let y = 0; y < srcH; y++) {
    for (let x = 0; x < srcW; x++) {
      let r = 0, g = 0, b = 0, count = 0
      for (let dx = -radius; dx <= radius; dx++) {
        const xx = x + dx
        if (xx < 0 || xx >= srcW) continue
        const i = (y * srcW + xx) * 4
        if (src[i + 3] < 200) continue
        r += src[i]; g += src[i + 1]; b += src[i + 2]; count++
      }
      const ti = (y * srcW + x) * 4
      if (count > 0) {
        tmp[ti] = r / count
        tmp[ti + 1] = g / count
        tmp[ti + 2] = b / count
        tmp[ti + 3] = src[ti + 3]
      } else {
        tmp[ti] = src[ti]
        tmp[ti + 1] = src[ti + 1]
        tmp[ti + 2] = src[ti + 2]
        tmp[ti + 3] = src[ti + 3]
      }
    }
  }
  // Vertical pass, writing back only into the target region of `data`.
  for (let y = 0; y < srcH; y++) {
    const gy = top - pad + y
    if (gy < top || gy >= bottom) continue
    for (let x = 0; x < srcW; x++) {
      const gx = left - pad + x
      if (gx < left || gx >= right) continue
      let r = 0, g = 0, b = 0, count = 0
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= srcH) continue
        const i = (yy * srcW + x) * 4
        if (tmp[i + 3] < 200) continue
        r += tmp[i]; g += tmp[i + 1]; b += tmp[i + 2]; count++
      }
      if (count === 0) continue
      const gi = (gy * imgW + gx) * 4
      data[gi] = r / count
      data[gi + 1] = g / count
      data[gi + 2] = b / count
      data[gi + 3] = 255
    }
  }
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
