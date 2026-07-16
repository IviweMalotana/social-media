import { removeBackground } from '@imgly/background-removal'
import { FabricImage } from 'fabric'
import type { Canvas } from 'fabric'
import { commitPendingChange } from './canvasActions'

type TaggedImage = FabricImage & { id?: string; name?: string }

export type BackgroundRemovalPhase = 'loading' | 'processing' | 'refining' | 'compositing' | 'done'

/**
 * Runs entirely client-side via WASM/ONNX (no API key, no server round-trip).
 * The model is fetched from a CDN on first use and cached by the browser.
 *
 * Model choice
 * ------------
 * @imgly/background-removal 1.7 ships three variants of ISNet — the salient
 * object segmentation net from Qin et al. (DIS5K, 2022):
 *
 *   isnet_quint8  — 8-bit quantised, ~40 MB, fastest, weakest
 *   isnet_fp16    — half precision,  ~80 MB, decent
 *   isnet         — full precision, ~160 MB, highest confidence masks
 *
 * We use `isnet` (full precision) because on product photos with warm/light
 * backgrounds (yellow bottle on cream, glass on beige, etc.) the smaller
 * variants return a low-confidence mask that visually reads as "everything
 * is 60% transparent" instead of a clean cut.
 *
 * Alpha refinement (see-through-glass safe)
 * -----------------------------------------
 * A naive global alpha threshold ("anything under 200 = background") fails
 * on translucent subjects — glass bottles, ice, plastic wrap — because the
 * model correctly outputs a low mid-range alpha for those pixels, and the
 * threshold then wipes them out. Result: bottle sits on a transparent
 * canvas but you can see the checker through the glass body.
 *
 * We use a flood fill instead:
 *
 *   1. Start from every pixel on the image's edges. Any pixel with alpha
 *      below FLOOD_THRESHOLD counts as "definitely exterior background."
 *   2. BFS expand: neighbours that are also low-alpha get marked as
 *      background too. This chains through the entire outside region.
 *   3. Every pixel *not* reached by the flood fill is subject — including
 *      translucent interior pixels. Force those to opaque.
 *   4. Pixels that WERE reached: force to fully transparent.
 *   5. For pixels one step from the boundary between the two regions,
 *      keep the model's alpha so anti-aliasing on the outline is preserved.
 *
 * Cost: one linear-time BFS over the image. Trivial vs. the inference pass.
 *
 * Progress
 * --------
 * The library reports (key, current, total) tuples where key is the phase
 * name (e.g. "fetch:onnx-runtime", "compute:mask"). We collapse those into
 * a loading/processing/refining/compositing state for the UI.
 */

const FLOOD_THRESHOLD = 32

export async function removeImageBackground(
  canvas: Canvas,
  image: TaggedImage,
  callbacks: {
    onPhase?: (phase: BackgroundRemovalPhase) => void
    onProgress?: (fraction: number) => void
  } = {},
) {
  callbacks.onPhase?.('loading')
  let sawCompute = false

  const blob = await removeBackground(image.getSrc(), {
    model: 'isnet',
    progress: (key, current, total) => {
      if (total <= 0) return
      if (!sawCompute && key.startsWith('compute')) {
        sawCompute = true
        callbacks.onPhase?.('processing')
      }
      callbacks.onProgress?.(current / total)
    },
  })

  callbacks.onPhase?.('refining')
  const refinedBlob = await refineAlpha(blob)

  callbacks.onPhase?.('compositing')
  const url = URL.createObjectURL(refinedBlob)
  const cutout = (await FabricImage.fromURL(url, { crossOrigin: 'anonymous' })) as TaggedImage

  cutout.set({
    left: image.left,
    top: image.top,
    originX: image.originX,
    originY: image.originY,
    scaleX: image.scaleX,
    scaleY: image.scaleY,
    angle: image.angle,
    opacity: image.opacity,
  })
  cutout.id = crypto.randomUUID()
  cutout.name = `${image.name ?? 'Image'} (no bg)`

  const index = canvas.getObjects().indexOf(image)
  canvas.remove(image)
  canvas.insertAt(index, cutout)
  canvas.setActiveObject(cutout)
  canvas.requestRenderAll()
  commitPendingChange(canvas)

  callbacks.onPhase?.('done')
  return cutout
}

/**
 * Edge-flood-fill alpha refinement. See doc block at top of file for the
 * reasoning — the short version is: translucent interiors (glass bottles,
 * ice, plastic wrap) must not get wiped out just because their alpha
 * happens to be below a threshold.
 */
async function refineAlpha(blob: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = bmp.width
  canvas.height = bmp.height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bmp, 0, 0)
  bmp.close?.()
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data
  const w = canvas.width
  const h = canvas.height
  const total = w * h

  // 1 = flood-reached background, 0 = subject (interior or exterior)
  const isBg = new Uint8Array(total)
  // Ring-buffer BFS queue — pre-allocated for the whole image so `push` and
  // `pop` are O(1) instead of the O(n) hit you'd get from Array.shift.
  const queue = new Int32Array(total)
  let head = 0
  let tail = 0

  const consider = (i: number) => {
    if (isBg[i]) return
    if (data[i * 4 + 3] <= FLOOD_THRESHOLD) {
      isBg[i] = 1
      queue[tail++] = i
    }
  }

  // Seed from every edge pixel.
  for (let x = 0; x < w; x++) {
    consider(x)
    consider((h - 1) * w + x)
  }
  for (let y = 0; y < h; y++) {
    consider(y * w)
    consider(y * w + w - 1)
  }

  // BFS: chain through connected low-alpha pixels.
  while (head < tail) {
    const i = queue[head++]
    const y = (i / w) | 0
    const x = i - y * w
    if (x > 0) consider(i - 1)
    if (x < w - 1) consider(i + 1)
    if (y > 0) consider(i - w)
    if (y < h - 1) consider(i + w)
  }

  // Apply the flood-fill result to alpha.
  //  - Reached by flood → 0
  //  - Not reached, but adjacent to a background pixel → keep model's
  //    alpha so the outline anti-aliases smoothly
  //  - Not reached, deep interior → 255 (fixes translucent glass)
  const isEdge = (i: number, x: number, y: number) =>
    (x > 0 && isBg[i - 1]) ||
    (x < w - 1 && isBg[i + 1]) ||
    (y > 0 && isBg[i - w]) ||
    (y < h - 1 && isBg[i + w])

  for (let i = 0; i < total; i++) {
    if (isBg[i]) {
      data[i * 4 + 3] = 0
      continue
    }
    const y = (i / w) | 0
    const x = i - y * w
    if (isEdge(i, x, y)) {
      // Antialias border — clamp so we don't leave halos when the model
      // itself returned a middling alpha here.
      const a = data[i * 4 + 3]
      data[i * 4 + 3] = a >= 200 ? 255 : Math.min(255, Math.round(a * 1.4))
    } else {
      data[i * 4 + 3] = 255
    }
  }
  ctx.putImageData(imageData, 0, 0)
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('refineAlpha toBlob failed'))), 'image/png')
  })
}
