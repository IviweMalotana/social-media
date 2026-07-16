import { filters as fabricFilters } from 'fabric'
import type { FabricImage, Canvas } from 'fabric'
import type { HistoryManager } from './history'
import { ensureWorkingCanvas, type EraserImage } from './eraser'

/**
 * Creative image effects — stylistic looks on top of the utilitarian
 * adjustments (brightness/contrast/etc.) already provided by filters.ts.
 *
 * Two groups:
 *
 * (A) Fabric-filter based:
 *     Pixelate, Sharpen, and a Vintage duotone using Fabric's own filter
 *     chain. Cheap, GPU-accelerated when possible, previews live.
 *
 * (B) Working-canvas painted:
 *     Film grain, vignette, halftone, VHS chromatic aberration —
 *     effects that need per-pixel work Fabric doesn't natively expose.
 *     These paint onto the working canvas the same way the eraser/OCR
 *     erase modes do, so they compose with the rest of the pipeline
 *     and go through history.snapshot() for a single undo step.
 *
 * The "Reset creative" tile clears both — for group A it drops the
 * relevant filters, for group B it restores the pre-effect bitmap
 * cached on the FabricImage the first time an effect runs.
 */

type CreativeImage = FabricImage & {
  _preCreativeSrc?: string
  _creativeApplied?: Set<string>
}

function withHistory(canvas: Canvas) {
  return (canvas as unknown as { history?: HistoryManager }).history
}

/**
 * On first destructive effect, stash the current working-canvas contents so
 * the "Reset creative" tile can restore the pixels exactly.
 */
async function ensurePreCreativeCache(image: CreativeImage): Promise<void> {
  if (image._preCreativeSrc) return
  const working = ensureWorkingCanvas(image as EraserImage)
  image._preCreativeSrc = working.toDataURL('image/png')
}

function markApplied(image: CreativeImage, key: string) {
  if (!image._creativeApplied) image._creativeApplied = new Set()
  image._creativeApplied.add(key)
}

// --- Fabric-filter effects ---

const PIXELATE_TYPE = 'Pixelate'
const SHARPEN_TYPE = 'Convolute' // Fabric's convolution matrix filter

export function togglePixelate(img: FabricImage, on: boolean, blocksize = 8) {
  const rest = (img.filters ?? []).filter((f) => (f as { type?: string }).type !== PIXELATE_TYPE)
  if (on) rest.push(new fabricFilters.Pixelate({ blocksize }))
  img.filters = rest
  img.applyFilters()
  img.canvas?.requestRenderAll()
}

export function hasPixelate(img: FabricImage): boolean {
  return (img.filters ?? []).some((f) => (f as { type?: string }).type === PIXELATE_TYPE)
}

/**
 * Simple 3×3 sharpen kernel. Fabric ships `Convolute` for this — cheap and
 * WebGL-accelerated when available.
 */
export function toggleSharpen(img: FabricImage, on: boolean) {
  const rest = (img.filters ?? []).filter((f) => (f as { type?: string }).type !== SHARPEN_TYPE)
  if (on) {
    rest.push(
      new fabricFilters.Convolute({
        matrix: [0, -1, 0, -1, 5, -1, 0, -1, 0],
      }),
    )
  }
  img.filters = rest
  img.applyFilters()
  img.canvas?.requestRenderAll()
}

export function hasSharpen(img: FabricImage): boolean {
  return (img.filters ?? []).some((f) => (f as { type?: string }).type === SHARPEN_TYPE)
}

// --- Working-canvas painted effects ---

const RESET_KEYS = ['grain', 'vignette', 'halftone', 'vhs'] as const
export type PaintedEffect = (typeof RESET_KEYS)[number]

export async function applyFilmGrain(fabricCanvas: Canvas, image: FabricImage, intensity = 30): Promise<void> {
  await ensurePreCreativeCache(image as CreativeImage)
  const working = ensureWorkingCanvas(image as EraserImage)
  const ctx = working.getContext('2d')!
  const data = ctx.getImageData(0, 0, working.width, working.height)
  const buf = data.data
  for (let i = 0; i < buf.length; i += 4) {
    // Fast lightweight noise — deterministic-enough given the eyeball scale.
    const n = (Math.random() - 0.5) * intensity
    buf[i] = clamp(buf[i] + n)
    buf[i + 1] = clamp(buf[i + 1] + n)
    buf[i + 2] = clamp(buf[i + 2] + n)
  }
  ctx.putImageData(data, 0, 0)
  ;(image as unknown as { dirty: boolean }).dirty = true
  fabricCanvas.requestRenderAll()
  markApplied(image as CreativeImage, 'grain')
  withHistory(fabricCanvas)?.snapshot()
}

export async function applyVignette(fabricCanvas: Canvas, image: FabricImage, strength = 0.6): Promise<void> {
  await ensurePreCreativeCache(image as CreativeImage)
  const working = ensureWorkingCanvas(image as EraserImage)
  const ctx = working.getContext('2d')!
  const w = working.width
  const h = working.height
  const cx = w / 2
  const cy = h / 2
  const maxDist = Math.sqrt(cx * cx + cy * cy)
  const data = ctx.getImageData(0, 0, w, h)
  const buf = data.data
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cx
      const dy = y - cy
      const d = Math.sqrt(dx * dx + dy * dy) / maxDist
      // Smooth radial falloff — corners get the darkest hit.
      const dim = 1 - strength * d * d
      const i = (y * w + x) * 4
      buf[i] *= dim
      buf[i + 1] *= dim
      buf[i + 2] *= dim
    }
  }
  ctx.putImageData(data, 0, 0)
  ;(image as unknown as { dirty: boolean }).dirty = true
  fabricCanvas.requestRenderAll()
  markApplied(image as CreativeImage, 'vignette')
  withHistory(fabricCanvas)?.snapshot()
}

/**
 * Halftone — replaces the image with a grid of dots whose size mirrors the
 * local luminance. Big dots = dark, small dots = bright. Classic newsprint
 * / retro look.
 */
export async function applyHalftone(fabricCanvas: Canvas, image: FabricImage, dotSize = 6): Promise<void> {
  await ensurePreCreativeCache(image as CreativeImage)
  const working = ensureWorkingCanvas(image as EraserImage)
  const ctx = working.getContext('2d')!
  const w = working.width
  const h = working.height
  const src = ctx.getImageData(0, 0, w, h).data
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#000000'
  for (let y = 0; y < h; y += dotSize) {
    for (let x = 0; x < w; x += dotSize) {
      // Sample the centre pixel of this cell for luminance.
      const cx = Math.min(w - 1, x + (dotSize >> 1))
      const cy = Math.min(h - 1, y + (dotSize >> 1))
      const i = (cy * w + cx) * 4
      const lum = (src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114) / 255
      // Radius shrinks as luminance rises — bright regions look "empty."
      const r = ((1 - lum) * dotSize) / 2
      if (r > 0.2) {
        ctx.beginPath()
        ctx.arc(x + dotSize / 2, y + dotSize / 2, r, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }
  ;(image as unknown as { dirty: boolean }).dirty = true
  fabricCanvas.requestRenderAll()
  markApplied(image as CreativeImage, 'halftone')
  withHistory(fabricCanvas)?.snapshot()
}

/**
 * VHS chromatic-aberration + scanlines. Splits R/B channels a few pixels
 * horizontally, adds soft horizontal scanlines, adds mild noise.
 */
export async function applyVhs(fabricCanvas: Canvas, image: FabricImage): Promise<void> {
  await ensurePreCreativeCache(image as CreativeImage)
  const working = ensureWorkingCanvas(image as EraserImage)
  const ctx = working.getContext('2d')!
  const w = working.width
  const h = working.height
  const src = ctx.getImageData(0, 0, w, h)
  const buf = src.data
  const out = new Uint8ClampedArray(buf.length)
  const shift = Math.max(2, Math.round(w * 0.005))
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const iRed = (y * w + Math.max(0, x - shift)) * 4
      const iBlue = (y * w + Math.min(w - 1, x + shift)) * 4
      out[i] = buf[iRed]
      out[i + 1] = buf[i + 1]
      out[i + 2] = buf[iBlue + 2]
      out[i + 3] = buf[i + 3]
      // Scanlines every 3rd row + jitter.
      if (y % 3 === 0) {
        out[i] = clamp(out[i] * 0.85)
        out[i + 1] = clamp(out[i + 1] * 0.85)
        out[i + 2] = clamp(out[i + 2] * 0.85)
      }
      const jitter = (Math.random() - 0.5) * 20
      out[i] = clamp(out[i] + jitter)
      out[i + 1] = clamp(out[i + 1] + jitter)
      out[i + 2] = clamp(out[i + 2] + jitter)
    }
  }
  const outData = new ImageData(out, w, h)
  ctx.putImageData(outData, 0, 0)
  ;(image as unknown as { dirty: boolean }).dirty = true
  fabricCanvas.requestRenderAll()
  markApplied(image as CreativeImage, 'vhs')
  withHistory(fabricCanvas)?.snapshot()
}

/**
 * Reset every destructive creative effect + the reversible Fabric filters
 * this module owns. Non-creative filters (brightness/contrast/beautify) are
 * left alone.
 */
export async function resetCreativeEffects(fabricCanvas: Canvas, image: FabricImage): Promise<void> {
  const ci = image as CreativeImage
  // Drop reversible effects first.
  const rest = (image.filters ?? []).filter(
    (f) => {
      const type = (f as { type?: string }).type
      return type !== PIXELATE_TYPE && type !== SHARPEN_TYPE
    },
  )
  image.filters = rest
  image.applyFilters()

  // Restore original pixels if any painted effect fired.
  if (ci._preCreativeSrc && ci._creativeApplied && ci._creativeApplied.size > 0) {
    const cached = ci._preCreativeSrc
    const el = new Image()
    await new Promise<void>((resolve, reject) => {
      el.onload = () => resolve()
      el.onerror = () => reject(new Error('reset creative: cached src load failed'))
      el.src = cached
    })
    const working = ensureWorkingCanvas(image as EraserImage)
    const ctx = working.getContext('2d')!
    ctx.clearRect(0, 0, working.width, working.height)
    ctx.drawImage(el, 0, 0)
    ci._creativeApplied.clear()
  }
  ;(image as unknown as { dirty: boolean }).dirty = true
  fabricCanvas.requestRenderAll()
  withHistory(fabricCanvas)?.snapshot()
}

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v
}

export const CREATIVE_RESET_KEYS = RESET_KEYS
