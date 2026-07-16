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
 * Alpha refinement
 * ----------------
 * Even the full-precision model leaves borderline pixels in the 30-200 alpha
 * range. Left as-is that produces a hazy "not quite removed" background.
 * We apply a hysteresis-style curve to the returned cutout:
 *   alpha <  40  → fully transparent (definitely background)
 *   alpha > 200  → fully opaque      (definitely subject)
 *   40..200      → boosted with a smooth remap so it still anti-aliases the
 *                  edge but no longer looks ghosted
 * Runs on the pixel buffer we already need to build in memory to hand back
 * to Fabric — negligible perf hit.
 *
 * Progress
 * --------
 * The library reports (key, current, total) tuples where key is the phase
 * name (e.g. "fetch:onnx-runtime", "compute:mask"). We collapse those into
 * a loading/processing/refining/compositing state for the UI.
 */

const ALPHA_LOW = 40
const ALPHA_HIGH = 200

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
 * Hysteresis-style alpha remap. Clamps definitely-background pixels to 0,
 * definitely-subject pixels to 255, and smoothly boosts the middle range so
 * anti-aliased edges stay smooth but nothing reads as "ghosted."
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
  for (let i = 3; i < data.length; i += 4) {
    const a = data[i]
    if (a <= ALPHA_LOW) {
      data[i] = 0
    } else if (a >= ALPHA_HIGH) {
      data[i] = 255
    } else {
      // Smooth-step boost so mid-range pixels get a confidence bump but
      // still anti-alias the border.
      const t = (a - ALPHA_LOW) / (ALPHA_HIGH - ALPHA_LOW)
      const smoothed = t * t * (3 - 2 * t)
      data[i] = Math.round(smoothed * 255)
    }
  }
  ctx.putImageData(imageData, 0, 0)
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('refineAlpha toBlob failed'))), 'image/png')
  })
}
