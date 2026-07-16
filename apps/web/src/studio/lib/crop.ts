import { Rect } from 'fabric'
import type { Canvas, FabricImage } from 'fabric'
import { commitPendingChange } from './canvasActions'

let cropRect: Rect | null = null
let cropTarget: FabricImage | null = null

export function startCrop(canvas: Canvas, image: FabricImage) {
  const bounds = image.getBoundingRect()
  cropTarget = image
  cropRect = new Rect({
    left: bounds.left,
    top: bounds.top,
    originX: 'left',
    originY: 'top',
    width: bounds.width,
    height: bounds.height,
    fill: 'rgba(79,124,255,0.15)',
    stroke: '#4f7cff',
    strokeWidth: 2,
    strokeDashArray: [6, 4],
    cornerColor: '#4f7cff',
    cornerStyle: 'circle',
    transparentCorners: false,
  })
  image.selectable = false
  image.evented = false
  canvas.add(cropRect)
  canvas.setActiveObject(cropRect)
  canvas.requestRenderAll()
}

export function confirmCrop(canvas: Canvas) {
  if (!cropRect || !cropTarget) return
  const image = cropTarget
  const clip = new Rect({
    left: cropRect.left,
    top: cropRect.top,
    originX: 'left',
    originY: 'top',
    width: cropRect.getScaledWidth(),
    height: cropRect.getScaledHeight(),
    absolutePositioned: true,
  })
  image.clipPath = clip
  image.selectable = true
  image.evented = true
  canvas.remove(cropRect)
  cropRect = null
  cropTarget = null
  canvas.setActiveObject(image)
  canvas.requestRenderAll()
  commitPendingChange(canvas)
}

export function cancelCrop(canvas: Canvas) {
  if (cropRect) canvas.remove(cropRect)
  if (cropTarget) {
    cropTarget.selectable = true
    cropTarget.evented = true
  }
  cropRect = null
  cropTarget = null
  canvas.requestRenderAll()
}

export function clearCrop(canvas: Canvas, image: FabricImage) {
  image.clipPath = undefined
  canvas.requestRenderAll()
  commitPendingChange(canvas)
}
