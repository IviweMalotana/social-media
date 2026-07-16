import { removeBackground } from '@imgly/background-removal'
import { FabricImage } from 'fabric'
import type { Canvas } from 'fabric'
import { commitPendingChange } from './canvasActions'

type TaggedImage = FabricImage & { id?: string; name?: string }

/**
 * Runs entirely client-side via WASM/ONNX (no API key, no server round-trip).
 * The model is fetched from a CDN on first use and cached by the browser.
 */
export async function removeImageBackground(canvas: Canvas, image: TaggedImage) {
  const blob = await removeBackground(image.getSrc())
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
  return cutout
}
