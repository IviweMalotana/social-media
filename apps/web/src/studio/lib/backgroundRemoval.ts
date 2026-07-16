import { removeBackground } from '@imgly/background-removal'
import { FabricImage } from 'fabric'
import type { Canvas } from 'fabric'
import { commitPendingChange } from './canvasActions'

type TaggedImage = FabricImage & { id?: string; name?: string }

export type BackgroundRemovalPhase = 'loading' | 'processing' | 'compositing' | 'done'

/**
 * Runs entirely client-side via WASM/ONNX (no API key, no server round-trip).
 * The model is fetched from a CDN on first use and cached by the browser.
 *
 * Default in @imgly/background-removal v1.7 is `isnet_quint8` — the quantized
 * 8-bit model. It's small (~40 MB) and fast, but on product photos with light
 * backgrounds it produces a low-confidence mask that reads as "everything is
 * slightly transparent" rather than clean subject-vs-background separation.
 *
 * We opt into `isnet_fp16` — half-precision ISNet, ~80 MB, meaningfully better
 * confidence on product/salient-object photos. First download is ~2× larger
 * (cached after), inference is only slightly slower.
 *
 * Progress:
 *   The library reports (key, current, total) tuples where key is the phase
 *   name (e.g. "fetch:onnx-runtime", "compute:mask"). We collapse those into
 *   a simple loading / processing / compositing state for the UI, plus a raw
 *   [0,1] fraction for a progress bar.
 */
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
    model: 'isnet_fp16',
    progress: (key, current, total) => {
      if (total <= 0) return
      // Keys look like `fetch:<resource>` while downloading and `compute:*`
      // while running. Flip UI phase the first time we see a compute event.
      if (!sawCompute && key.startsWith('compute')) {
        sawCompute = true
        callbacks.onPhase?.('processing')
      }
      callbacks.onProgress?.(current / total)
    },
  })

  callbacks.onPhase?.('compositing')
  const url = URL.createObjectURL(blob)
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
