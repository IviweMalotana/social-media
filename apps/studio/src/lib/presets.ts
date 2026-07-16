import type { FabricImage } from 'fabric'
import { setAdjustment } from './filters'

export interface Preset {
  key: string
  label: string
  values: { brightness: number; contrast: number; saturation: number; hue: number }
}

export const PRESETS: Preset[] = [
  { key: 'original', label: 'Original', values: { brightness: 0, contrast: 0, saturation: 0, hue: 0 } },
  { key: 'vivid', label: 'Vivid', values: { brightness: 0.04, contrast: 0.18, saturation: 0.3, hue: 0 } },
  { key: 'soft', label: 'Soft', values: { brightness: 0.08, contrast: -0.1, saturation: -0.12, hue: 0 } },
  { key: 'studio', label: 'Studio', values: { brightness: 0.1, contrast: 0.12, saturation: -0.05, hue: 0 } },
  { key: 'warm', label: 'Warm', values: { brightness: 0.03, contrast: 0.05, saturation: 0.15, hue: -0.04 } },
  { key: 'cool', label: 'Cool', values: { brightness: 0.02, contrast: 0.05, saturation: 0.05, hue: 0.04 } },
]

export function applyPreset(img: FabricImage, preset: Preset) {
  setAdjustment(img, 'brightness', preset.values.brightness)
  setAdjustment(img, 'contrast', preset.values.contrast)
  setAdjustment(img, 'saturation', preset.values.saturation)
  setAdjustment(img, 'hue', preset.values.hue)
}
