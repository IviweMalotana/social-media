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

const SAMPLE_STRIP = 8
// Number of the first opaque pixels to SKIP when walking outward. The
// pixels adjacent to a Tesseract bbox aren't clean bottle — they're the
// anti-aliased halo (and often a subtle drop shadow) of the removed glyph.
// A too-low skip pulls those dark pixels into the fill and the erased region
// reads as a dark smear. 6 gets us past even generous glyph AA on typical
// product-photo resolutions.
const SAMPLE_SKIP = 6
const SAMPLE_V_WINDOW = 2
const OPAQUE_ALPHA = 200
// Luminance-outlier rejection threshold (out of 255). When the sample walk
// runs across a very different-tone region — the black dropper cap on an
// amber bottle, a shadow rim, the neighbour of a second removed glyph — those
// pixels bias the average and read as a dark patch. We compute the median
// luminance of the raw samples, drop pixels whose luminance differs by more
// than this, and average only what's left. 45 keeps the natural lighting
// gradient (highlight → shadow across a bottle body is ~30-40 in luminance)
// while cutting the truly out-of-family blacks.
const SAMPLE_OUTLIER_LUM = 45

/**
 * Erase a fixed list of rectangles and repaint them with the surrounding
 * colour, so a label removed off a coloured bottle becomes that colour
 * instead of a transparent (or "canvas background" white) hole.
 *
 * How the fill works (bilinear interpolation from all four edges)
 * ---------------------------------------------------------------
 * Sampling only the left/right edges per row captures a bottle's vertical
 * lighting gradient by luck of the draw — whatever shade each row of the
 * L/R sample happens to hit gets carried across the fill on that row. On
 * strong-gradient product photos that produces visible horizontal banding
 * ("streaks") where consecutive rows of samples land in different tones.
 *
 * Instead, for every box:
 *   1. Sample all four EDGES of the box (with an SAMPLE_SKIP offset to
 *      dodge the anti-aliased halo left by the removed text):
 *        - leftPerRow[y]     — colour of pixels just left of the box at Y
 *        - rightPerRow[y]    — mirror on the right
 *        - topPerCol[x]      — colour of pixels just above the box at X
 *        - bottomPerCol[x]   — mirror below
 *      Each sample averages a 5-row (or 5-col) window so row-to-row noise
 *      doesn't leak into the fill.
 *   2. For each interior pixel (X, Y), compute the horizontal blend
 *      H = L·(1-tx) + R·tx and the vertical blend V = T·(1-ty) + B·ty,
 *      then combine with weights that fall off with distance from the
 *      nearer horizontal / vertical edge. Near the top row we lean on V
 *      (which reads the top edge); mid-height we split evenly; near the
 *      bottom we lean on V again. This carries the bottle's vertical
 *      gradient THROUGH the fill instead of guessing it row-by-row, so
 *      the horizontal streaks disappear.
 *   3. Pixels with no valid sample on any edge fall back to a nearest-
 *      opaque-neighbour scan, then transparent as a last resort.
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

    interface Side { r: number; g: number; b: number; count: number }
    const boxWidth = boxRight - boxLeft
    const boxHeight = boxBottom - boxTop
    const leftByRow: Side[] = new Array(boxHeight)
    const rightByRow: Side[] = new Array(boxHeight)
    const topByCol: Side[] = new Array(boxWidth)
    const bottomByCol: Side[] = new Array(boxWidth)

    // Robust averager: raw samples in [r,g,b,r,g,b,...] flat form. Compute
    // median luminance, reject samples further than SAMPLE_OUTLIER_LUM from
    // it, average the survivors. Falls back to a straight average when there
    // are too few samples to trust the median.
    const robustAverage = (rgb: number[]): Side => {
      if (rgb.length === 0) return { r: 0, g: 0, b: 0, count: 0 }
      const n = rgb.length / 3
      if (n <= 2) {
        let r = 0, g = 0, b = 0
        for (let i = 0; i < n; i++) {
          r += rgb[i * 3]; g += rgb[i * 3 + 1]; b += rgb[i * 3 + 2]
        }
        return { r, g, b, count: n }
      }
      const lums = new Array<number>(n)
      for (let i = 0; i < n; i++) {
        lums[i] = 0.2126 * rgb[i * 3] + 0.7152 * rgb[i * 3 + 1] + 0.0722 * rgb[i * 3 + 2]
      }
      const sorted = lums.slice().sort((a, b) => a - b)
      const median = sorted[Math.floor(n / 2)]
      let r = 0, g = 0, b = 0, count = 0
      for (let i = 0; i < n; i++) {
        if (Math.abs(lums[i] - median) > SAMPLE_OUTLIER_LUM) continue
        r += rgb[i * 3]; g += rgb[i * 3 + 1]; b += rgb[i * 3 + 2]
        count++
      }
      if (count === 0) {
        // Median-only fallback (all samples got rejected somehow).
        const midIdx = Math.floor(n / 2)
        return { r: rgb[midIdx * 3], g: rgb[midIdx * 3 + 1], b: rgb[midIdx * 3 + 2], count: 1 }
      }
      return { r, g, b, count }
    }

    // Per-row LEFT/RIGHT edge samples. Pool from a small vertical window so
    // row-to-row sample noise (a single row hitting a highlight vs a shadow)
    // doesn't leak into the fill.
    for (let y = boxTop; y < boxBottom; y++) {
      const leftRaw: number[] = []
      const rightRaw: number[] = []
      for (let dy = -SAMPLE_V_WINDOW; dy <= SAMPLE_V_WINDOW; dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= h) continue
        let leftSeen = 0, leftHits = 0
        for (
          let x = boxLeft - 1;
          x >= Math.max(0, boxLeft - (SAMPLE_STRIP + SAMPLE_SKIP) * 4) && leftHits < SAMPLE_STRIP;
          x--
        ) {
          const i = (yy * w + x) * 4
          if (data[i + 3] < OPAQUE_ALPHA) continue
          if (leftSeen++ < SAMPLE_SKIP) continue
          leftRaw.push(data[i], data[i + 1], data[i + 2])
          leftHits++
        }
        let rightSeen = 0, rightHits = 0
        for (
          let x = boxRight;
          x < Math.min(w, boxRight + (SAMPLE_STRIP + SAMPLE_SKIP) * 4) && rightHits < SAMPLE_STRIP;
          x++
        ) {
          const i = (yy * w + x) * 4
          if (data[i + 3] < OPAQUE_ALPHA) continue
          if (rightSeen++ < SAMPLE_SKIP) continue
          rightRaw.push(data[i], data[i + 1], data[i + 2])
          rightHits++
        }
      }
      leftByRow[y - boxTop] = robustAverage(leftRaw)
      rightByRow[y - boxTop] = robustAverage(rightRaw)
    }

    // Per-column TOP/BOTTOM edge samples. Same window trick, transposed.
    for (let x = boxLeft; x < boxRight; x++) {
      const topRaw: number[] = []
      const bottomRaw: number[] = []
      for (let dx = -SAMPLE_V_WINDOW; dx <= SAMPLE_V_WINDOW; dx++) {
        const xx = x + dx
        if (xx < 0 || xx >= w) continue
        let topSeen = 0, topHits = 0
        for (
          let y = boxTop - 1;
          y >= Math.max(0, boxTop - (SAMPLE_STRIP + SAMPLE_SKIP) * 4) && topHits < SAMPLE_STRIP;
          y--
        ) {
          const i = (y * w + xx) * 4
          if (data[i + 3] < OPAQUE_ALPHA) continue
          if (topSeen++ < SAMPLE_SKIP) continue
          topRaw.push(data[i], data[i + 1], data[i + 2])
          topHits++
        }
        let bottomSeen = 0, bottomHits = 0
        for (
          let y = boxBottom;
          y < Math.min(h, boxBottom + (SAMPLE_STRIP + SAMPLE_SKIP) * 4) && bottomHits < SAMPLE_STRIP;
          y++
        ) {
          const i = (y * w + xx) * 4
          if (data[i + 3] < OPAQUE_ALPHA) continue
          if (bottomSeen++ < SAMPLE_SKIP) continue
          bottomRaw.push(data[i], data[i + 1], data[i + 2])
          bottomHits++
        }
      }
      topByCol[x - boxLeft] = robustAverage(topRaw)
      bottomByCol[x - boxLeft] = robustAverage(bottomRaw)
    }

    // Side-trust filter: even after per-sample median reject, one whole edge
    // can still be dominated by an out-of-family feature — e.g. a black
    // dropper cap sitting directly above the label. That side's median then
    // diverges from the other three, and averaging it into the fill produces
    // the dark bar the user has been seeing. Detect an outlier side by
    // comparing each edge's median luminance to the overall median across all
    // four edges' medians; any edge more than 40 luminance away gets dropped
    // from the blend entirely.
    const edgeLum = (sides: Side[]): number => {
      const lums: number[] = []
      for (const s of sides) {
        if (s.count === 0) continue
        lums.push(0.2126 * (s.r / s.count) + 0.7152 * (s.g / s.count) + 0.0722 * (s.b / s.count))
      }
      if (lums.length === 0) return NaN
      lums.sort((a, bb) => a - bb)
      return lums[Math.floor(lums.length / 2)]
    }
    const lumL = edgeLum(leftByRow)
    const lumR = edgeLum(rightByRow)
    const lumT = edgeLum(topByCol)
    const lumB = edgeLum(bottomByCol)
    const validLums = [lumL, lumR, lumT, lumB].filter((l) => !isNaN(l))
    validLums.sort((a, bb) => a - bb)
    const anchor = validLums.length > 0 ? validLums[Math.floor(validLums.length / 2)] : NaN
    const SIDE_TRUST = 40
    const trustL = !isNaN(lumL) && (isNaN(anchor) || Math.abs(lumL - anchor) <= SIDE_TRUST)
    const trustR = !isNaN(lumR) && (isNaN(anchor) || Math.abs(lumR - anchor) <= SIDE_TRUST)
    const trustT = !isNaN(lumT) && (isNaN(anchor) || Math.abs(lumT - anchor) <= SIDE_TRUST)
    const trustB = !isNaN(lumB) && (isNaN(anchor) || Math.abs(lumB - anchor) <= SIDE_TRUST)

    for (let y = boxTop; y < boxBottom; y++) {
      const rowIdx = y - boxTop
      const left = leftByRow[rowIdx]
      const right = rightByRow[rowIdx]
      const ty = boxHeight > 1 ? rowIdx / (boxHeight - 1) : 0.5
      for (let x = boxLeft; x < boxRight; x++) {
        const colIdx = x - boxLeft
        const top = topByCol[colIdx]
        const bottom = bottomByCol[colIdx]
        const tx = boxWidth > 1 ? colIdx / (boxWidth - 1) : 0.5
        const i = (y * w + x) * 4

        // Horizontal blend from L/R edge samples (only trusted sides).
        let hR = 0, hG = 0, hB = 0, hWeight = 0
        if (trustL && left.count > 0) {
          const wL = 1 - tx
          hR += (left.r / left.count) * wL
          hG += (left.g / left.count) * wL
          hB += (left.b / left.count) * wL
          hWeight += wL
        }
        if (trustR && right.count > 0) {
          const wR = tx
          hR += (right.r / right.count) * wR
          hG += (right.g / right.count) * wR
          hB += (right.b / right.count) * wR
          hWeight += wR
        }

        // Vertical blend from T/B edge samples (only trusted sides).
        let vR = 0, vG = 0, vB = 0, vWeight = 0
        if (trustT && top.count > 0) {
          const wT = 1 - ty
          vR += (top.r / top.count) * wT
          vG += (top.g / top.count) * wT
          vB += (top.b / top.count) * wT
          vWeight += wT
        }
        if (trustB && bottom.count > 0) {
          const wB = ty
          vR += (bottom.r / bottom.count) * wB
          vG += (bottom.g / bottom.count) * wB
          vB += (bottom.b / bottom.count) * wB
          vWeight += wB
        }

        if (hWeight > 0 && vWeight > 0) {
          // Blend H and V. Weight by proximity to the nearer axis pair so
          // pixels close to a horizontal edge (top/bottom) lean on V and
          // pixels close to a vertical edge (left/right) lean on H. That
          // preserves whichever gradient dominates on that side and pulls
          // vertical structure THROUGH the fill.
          const distH = Math.min(tx, 1 - tx)  // distance to nearer L/R edge
          const distV = Math.min(ty, 1 - ty)  // distance to nearer T/B edge
          const wH = distV / Math.max(1e-6, distH + distV)
          const wV = distH / Math.max(1e-6, distH + distV)
          data[i] = (hR / hWeight) * wH + (vR / vWeight) * wV
          data[i + 1] = (hG / hWeight) * wH + (vG / vWeight) * wV
          data[i + 2] = (hB / hWeight) * wH + (vB / vWeight) * wV
          data[i + 3] = 255
        } else if (hWeight > 0) {
          data[i] = hR / hWeight
          data[i + 1] = hG / hWeight
          data[i + 2] = hB / hWeight
          data[i + 3] = 255
        } else if (vWeight > 0) {
          data[i] = vR / vWeight
          data[i + 1] = vG / vWeight
          data[i + 2] = vB / vWeight
          data[i + 3] = 255
        } else {
          // No opaque neighbours on any edge — box was floating in
          // transparent background. Punch it out completely.
          data[i + 3] = 0
        }
      }
    }
  }

  // Post-fill blur: bilinear already yields a smooth surface, but a small
  // final blur washes any residual sample discontinuities into a soft
  // gradient without touching a single pixel outside the erase boxes.
  for (const region of paintedRegions) {
    blurRegion(data, w, h, region.left, region.top, region.right, region.bottom, 5)
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
