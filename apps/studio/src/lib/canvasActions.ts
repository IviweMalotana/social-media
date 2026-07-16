import { FabricImage, IText, Rect, Circle } from 'fabric'
import type { Canvas, FabricObject } from 'fabric'
import type { HistoryManager } from './history'

function withHistory(canvas: Canvas) {
  return (canvas as unknown as { history?: HistoryManager }).history
}

function tagObject<T extends FabricObject>(obj: T, name: string): T {
  Object.assign(obj, { id: crypto.randomUUID(), name })
  return obj
}

function commit(canvas: Canvas, obj: FabricObject, makeActive = true) {
  canvas.add(obj)
  if (makeActive) canvas.setActiveObject(obj)
  canvas.requestRenderAll()
  withHistory(canvas)?.snapshot()
}

export async function addImageFromFile(canvas: Canvas, file: File) {
  const url = URL.createObjectURL(file)
  const img = await FabricImage.fromURL(url, { crossOrigin: 'anonymous' })
  const maxW = canvas.width! * 0.8
  const maxH = canvas.height! * 0.8
  const scale = Math.min(maxW / img.width!, maxH / img.height!, 1)
  img.set({
    left: canvas.width! / 2,
    top: canvas.height! / 2,
    originX: 'center',
    originY: 'center',
    scaleX: scale,
    scaleY: scale,
  })
  tagObject(img, file.name.replace(/\.[^.]+$/, ''))
  commit(canvas, img)
  return img
}

export function addText(canvas: Canvas, text = 'Double-click to edit') {
  const t = new IText(text, {
    left: canvas.width! / 2,
    top: canvas.height! / 2,
    originX: 'center',
    originY: 'center',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 48,
    fill: '#111111',
  })
  tagObject(t, 'Text')
  commit(canvas, t)
  return t
}

export function addRectangle(canvas: Canvas) {
  const r = new Rect({
    left: canvas.width! / 2,
    top: canvas.height! / 2,
    originX: 'center',
    originY: 'center',
    width: 240,
    height: 160,
    fill: '#4f7cff',
    rx: 8,
    ry: 8,
  })
  tagObject(r, 'Rectangle')
  commit(canvas, r)
  return r
}

export function addCircle(canvas: Canvas) {
  const c = new Circle({
    left: canvas.width! / 2,
    top: canvas.height! / 2,
    originX: 'center',
    originY: 'center',
    radius: 100,
    fill: '#ff6b4f',
  })
  tagObject(c, 'Circle')
  commit(canvas, c)
  return c
}

export function deleteObject(canvas: Canvas, obj: FabricObject) {
  canvas.remove(obj)
  canvas.discardActiveObject()
  canvas.requestRenderAll()
  withHistory(canvas)?.snapshot()
}

export function reorderLayer(canvas: Canvas, obj: FabricObject, direction: 'up' | 'down' | 'top' | 'bottom') {
  if (direction === 'up') canvas.bringObjectForward(obj)
  if (direction === 'down') canvas.sendObjectBackwards(obj)
  if (direction === 'top') canvas.bringObjectToFront(obj)
  if (direction === 'bottom') canvas.sendObjectToBack(obj)
  canvas.requestRenderAll()
  withHistory(canvas)?.snapshot()
}

export function setObjectVisible(canvas: Canvas, obj: FabricObject, visible: boolean) {
  obj.set('visible', visible)
  canvas.requestRenderAll()
  withHistory(canvas)?.snapshot()
}

export function setObjectOpacity(canvas: Canvas, obj: FabricObject, opacity: number) {
  obj.set('opacity', opacity)
  canvas.requestRenderAll()
}

export function commitPendingChange(canvas: Canvas) {
  withHistory(canvas)?.snapshot()
}

export function exportCanvas(canvas: Canvas, format: 'png' | 'jpeg' = 'png', multiplier = 2) {
  const dataUrl = canvas.toDataURL({ format, quality: 0.92, multiplier })
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = `bdp-studio-export.${format === 'jpeg' ? 'jpg' : 'png'}`
  link.click()
}
