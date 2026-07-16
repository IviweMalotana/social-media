import type { Canvas, FabricImage } from 'fabric'
import type { HistoryManager } from './history'
import { ensureWorkingCanvas, type EraserImage } from './eraser'

/**
 * Color-match fill for erased regions.
 *
 * After brush/box/text-erase leaves transparent pixels, this samples the
 * ring of opaque pixels immediately surrounding each transparent region
 * and paints the holes with the average of those samples. It's a poor-
 * man's content-aware fill — no ML, no cloud API, no big model download —
 * that works surprisingly well when the erased region sits on a roughly
 * uniform surface (glass bottles, backdrops, plain fabric).
 *
 * How it works
 * 1. Read the whole image's ImageData.
 * 2. For each transparent pixel, look at its immediate opaque neighbours
 *    within a small radius. Average their RGB.
 * 3. Write that average colour (fully opaque) into the transparent pixel.
 * 4. A second pass fills the pixels that had no opaque neighbours in the
 *    first pass, by iteratively expanding inward from the border of the
 *    just-filled region. This bleeds the border color across even large
 *    holes.
 *
 * For photo-realistic label removal ("show me the glass under the label
 * with reflections"), you'd need a real inpainting model — that's a
 * separate, ~200 MB integration. This is the pragmatic 80% version.
 */

const SAMPLE_RADIUS = 4

function withHistory(canvas: Canvas) {
  return (canvas as unknown as { history?: HistoryManager }).history
}

export function fillErasedRegions(fabricCanvas: Canvas, image: FabricImage): { pixelsFilled: number } {
  const working = ensureWorkingCanvas(image as EraserImage)
  const ctx = working.getContext('2d')!
  const width = working.width
  const height = working.height
  const imageData = ctx.getImageData(0, 0, width, height)
  const src = imageData.data
  const dst = new Uint8ClampedArray(src)

  const isTransparent = (i: number) => src[i + 3] === 0

  // Pass 1: for each transparent pixel, sample opaque neighbours within
  // SAMPLE_RADIUS. If any found, average them and paint here.
  let filled = 0
  const stillEmpty: number[] = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      if (!isTransparent(i)) continue
      let rSum = 0, gSum = 0, bSum = 0, count = 0
      for (let dy = -SAMPLE_RADIUS; dy <= SAMPLE_RADIUS; dy++) {
        for (let dx = -SAMPLE_RADIUS; dx <= SAMPLE_RADIUS; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          const j = (ny * width + nx) * 4
          if (src[j + 3] === 0) continue
          rSum += src[j]
          gSum += src[j + 1]
          bSum += src[j + 2]
          count++
        }
      }
      if (count > 0) {
        dst[i] = rSum / count
        dst[i + 1] = gSum / count
        dst[i + 2] = bSum / count
        dst[i + 3] = 255
        filled++
      } else {
        stillEmpty.push(i)
      }
    }
  }

  // Pass 2: interior of large holes. Iteratively expand inward — a pixel
  // that now has opaque neighbours in `dst` gets averaged from those.
  // Cap iterations so we don't loop forever on fully-transparent images.
  const maxPasses = 60
  let empty = stillEmpty
  for (let pass = 0; pass < maxPasses && empty.length > 0; pass++) {
    const next: number[] = []
    for (const i of empty) {
      const y = Math.floor(i / 4 / width)
      const x = (i / 4) % width
      let rSum = 0, gSum = 0, bSum = 0, count = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          const j = (ny * width + nx) * 4
          if (dst[j + 3] === 0) continue
          rSum += dst[j]
          gSum += dst[j + 1]
          bSum += dst[j + 2]
          count++
        }
      }
      if (count > 0) {
        dst[i] = rSum / count
        dst[i + 1] = gSum / count
        dst[i + 2] = bSum / count
        dst[i + 3] = 255
        filled++
      } else {
        next.push(i)
      }
    }
    if (next.length === empty.length) break // converged / isolated
    empty = next
  }

  imageData.data.set(dst)
  ctx.putImageData(imageData, 0, 0)
  ;(image as unknown as { dirty: boolean }).dirty = true
  fabricCanvas.requestRenderAll()
  withHistory(fabricCanvas)?.snapshot()
  return { pixelsFilled: filled }
}
