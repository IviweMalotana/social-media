import { filters as fabricFilters } from 'fabric'
import type { FabricImage } from 'fabric'

export type AdjustmentKey = 'brightness' | 'contrast' | 'saturation' | 'blur' | 'hue'

const FILTER_TYPE: Record<AdjustmentKey, string> = {
  brightness: 'Brightness',
  contrast: 'Contrast',
  saturation: 'Saturation',
  blur: 'Blur',
  hue: 'HueRotation',
}

function buildFilter(key: AdjustmentKey, value: number) {
  switch (key) {
    case 'brightness':
      return new fabricFilters.Brightness({ brightness: value })
    case 'contrast':
      return new fabricFilters.Contrast({ contrast: value })
    case 'saturation':
      return new fabricFilters.Saturation({ saturation: value })
    case 'blur':
      return new fabricFilters.Blur({ blur: value })
    case 'hue':
      return new fabricFilters.HueRotation({ rotation: value })
  }
}

export function setAdjustment(img: FabricImage, key: AdjustmentKey, value: number) {
  const type = FILTER_TYPE[key]
  const rest = (img.filters ?? []).filter((f) => (f as { type?: string }).type !== type)
  if (value !== 0) rest.push(buildFilter(key, value))
  img.filters = rest
  img.applyFilters()
  img.canvas?.requestRenderAll()
}

const FILTER_PROP: Record<AdjustmentKey, string> = {
  brightness: 'brightness',
  contrast: 'contrast',
  saturation: 'saturation',
  blur: 'blur',
  hue: 'rotation',
}

export function getAdjustment(img: FabricImage, key: AdjustmentKey): number {
  const type = FILTER_TYPE[key]
  const f = (img.filters ?? []).find((f) => (f as { type?: string }).type === type)
  if (!f) return 0
  return (f as unknown as Record<string, number>)[FILTER_PROP[key]] ?? 0
}

export function toggleNamedFilter(img: FabricImage, type: 'Grayscale' | 'Sepia' | 'Invert', on: boolean) {
  const rest = (img.filters ?? []).filter((f) => (f as { type?: string }).type !== type)
  if (on) {
    const ctor = { Grayscale: fabricFilters.Grayscale, Sepia: fabricFilters.Sepia, Invert: fabricFilters.Invert }[type]
    rest.push(new ctor())
  }
  img.filters = rest
  img.applyFilters()
  img.canvas?.requestRenderAll()
}

export function hasNamedFilter(img: FabricImage, type: 'Grayscale' | 'Sepia' | 'Invert'): boolean {
  return (img.filters ?? []).some((f) => (f as { type?: string }).type === type)
}

/**
 * Clear every filter on the image — adjustments (brightness/contrast/etc)
 * AND named effects (grayscale/sepia/invert). Powers the "Original" reset
 * chip in the Beautify section so users can undo everything they've stacked
 * without hunting through the history buffer.
 */
export function resetAllFilters(img: FabricImage) {
  img.filters = []
  img.applyFilters()
  img.canvas?.requestRenderAll()
}
