import { FabricImage, Shadow } from 'fabric'
import type { Canvas, FabricObject } from 'fabric'
import type { HistoryManager } from './history'

function withHistory(canvas: Canvas) {
  return (canvas as unknown as { history?: HistoryManager }).history
}

export type PlatformPreset = {
  key: 'ig-post' | 'ig-story' | 'tiktok' | 'pinterest' | 'fb-cover' | 'youtube-thumb'
  label: string
  hint: string
  width: number
  height: number
}

export const DEFAULT_CANVAS_WIDTH = 1200
export const DEFAULT_CANVAS_HEIGHT = 800

export const PLATFORM_PRESETS: PlatformPreset[] = [
  { key: 'ig-post', label: 'Instagram Post', hint: '1080 × 1080', width: 1080, height: 1080 },
  { key: 'ig-story', label: 'Instagram Story', hint: '1080 × 1920', width: 1080, height: 1920 },
  { key: 'tiktok', label: 'TikTok', hint: '1080 × 1920', width: 1080, height: 1920 },
  { key: 'pinterest', label: 'Pinterest', hint: '1000 × 1500', width: 1000, height: 1500 },
  { key: 'fb-cover', label: 'Facebook Cover', hint: '1200 × 630', width: 1200, height: 630 },
  { key: 'youtube-thumb', label: 'YouTube Thumb', hint: '1280 × 720', width: 1280, height: 720 },
]

/**
 * Drop-shadow the selected image with a soft, realistic-looking offset shadow.
 * Approximation of Photoroom's "AI shadow" — the visual read is very close for
 * product shots without needing a model. Scales with the image's on-canvas size.
 */
export function addDropShadow(canvas: Canvas, obj: FabricObject) {
  const size = Math.max(obj.getScaledWidth(), obj.getScaledHeight())
  obj.set(
    'shadow',
    new Shadow({
      color: 'rgba(0, 0, 0, 0.35)',
      blur: Math.round(size * 0.04),
      offsetX: 0,
      offsetY: Math.round(size * 0.03),
    }),
  )
  canvas.requestRenderAll()
  withHistory(canvas)?.snapshot()
}

export function removeDropShadow(canvas: Canvas, obj: FabricObject) {
  obj.set('shadow', null)
  canvas.requestRenderAll()
  withHistory(canvas)?.snapshot()
}

export function hasDropShadow(obj: FabricObject): boolean {
  return Boolean(obj.shadow)
}

/**
 * Set the canvas background color (visible everywhere the objects don't cover).
 * Combined with background removal, this is the "put it on a white/color background"
 * flow — cheap replacement for AI scene generation.
 */
export function setCanvasBackground(canvas: Canvas, color: string | null) {
  canvas.backgroundColor = color ?? ''
  canvas.requestRenderAll()
  withHistory(canvas)?.snapshot()
}

export function flipObject(canvas: Canvas, obj: FabricObject, axis: 'horizontal' | 'vertical') {
  if (axis === 'horizontal') obj.set('flipX', !obj.flipX)
  else obj.set('flipY', !obj.flipY)
  obj.setCoords()
  canvas.requestRenderAll()
  withHistory(canvas)?.snapshot()
}

export function duplicateObject(canvas: Canvas, obj: FabricObject) {
  obj.clone().then((cloned: FabricObject) => {
    Object.assign(cloned, {
      id: crypto.randomUUID(),
      name: (obj as unknown as { name?: string }).name
        ? `${(obj as unknown as { name?: string }).name} copy`
        : 'Copy',
      left: (obj.left ?? 0) + 20,
      top: (obj.top ?? 0) + 20,
    })
    canvas.add(cloned)
    canvas.setActiveObject(cloned)
    canvas.requestRenderAll()
    withHistory(canvas)?.snapshot()
  })
}

/**
 * Resize the canvas to a target size (typically a platform preset). Existing
 * objects are re-fitted so they stay roughly-visible after the resize — we scale
 * everything by the smaller of (newW/oldW, newH/oldH) and recenter, rather than
 * squashing or clipping content off the edge.
 */
export function resizeCanvas(canvas: Canvas, newWidth: number, newHeight: number) {
  const oldW = canvas.width!
  const oldH = canvas.height!
  if (oldW === newWidth && oldH === newHeight) return
  const objectScale = Math.min(newWidth / oldW, newHeight / oldH)
  const objects = canvas.getObjects()
  for (const obj of objects) {
    const relX = (obj.left ?? 0) / oldW
    const relY = (obj.top ?? 0) / oldH
    obj.scaleX = (obj.scaleX ?? 1) * objectScale
    obj.scaleY = (obj.scaleY ?? 1) * objectScale
    obj.left = relX * newWidth
    obj.top = relY * newHeight
    obj.setCoords()
  }
  canvas.setDimensions({ width: newWidth, height: newHeight })
  canvas.requestRenderAll()
  withHistory(canvas)?.snapshot()
}

/**
 * Add an image on TOP of the stack, sized modestly and placed centre-canvas.
 * Used for superimposing a logo/sticker/design onto a product photo. Distinct
 * from `addBackgroundImage`, which sinks a full-bleed image to the back.
 */
export async function addLogoOverlay(canvas: Canvas, file: File) {
  const url = URL.createObjectURL(file)
  const img = await FabricImage.fromURL(url, { crossOrigin: 'anonymous' })
  // Cap the logo at ~30% of the smaller canvas dimension so it's visible but
  // not overwhelming; the user can scale/reposition after placement.
  const targetSize = Math.min(canvas.width!, canvas.height!) * 0.3
  const scale = Math.min(targetSize / img.width!, targetSize / img.height!, 1)
  img.set({
    left: canvas.width! / 2,
    top: canvas.height! / 2,
    originX: 'center',
    originY: 'center',
    scaleX: scale,
    scaleY: scale,
  })
  Object.assign(img, { id: crypto.randomUUID(), name: file.name.replace(/\.[^.]+$/, '') || 'Logo' })
  canvas.add(img)
  canvas.bringObjectToFront(img)
  canvas.setActiveObject(img)
  canvas.requestRenderAll()
  withHistory(canvas)?.snapshot()
  return img
}

/**
 * Add a full-bleed image at the bottom of the stack (used for photo backdrops
 * after background removal — e.g. drop a product cutout onto a lifestyle photo).
 */
export async function addBackgroundImage(canvas: Canvas, file: File) {
  const url = URL.createObjectURL(file)
  const img = await FabricImage.fromURL(url, { crossOrigin: 'anonymous' })
  const scale = Math.max(canvas.width! / img.width!, canvas.height! / img.height!)
  img.set({
    left: canvas.width! / 2,
    top: canvas.height! / 2,
    originX: 'center',
    originY: 'center',
    scaleX: scale,
    scaleY: scale,
    selectable: false,
    evented: false,
  })
  Object.assign(img, { id: crypto.randomUUID(), name: 'Background' })
  canvas.add(img)
  canvas.sendObjectToBack(img)
  canvas.requestRenderAll()
  withHistory(canvas)?.snapshot()
  return img
}
