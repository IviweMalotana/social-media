import { FabricImage, Rect } from 'fabric'
import type { Canvas } from 'fabric'
import { addImageFromFile, deleteObject } from './canvasActions'
import { removeImageBackground } from './backgroundRemoval'

/**
 * "Process supplier images" pipeline. Sequential (one image at a time,
 * driven by the user clicking Save + Next), NOT parallel batch —
 * matches the actual workflow: quality-check each output before it moves
 * on, so weird crops / missed labels / extra bottles get caught while
 * you're looking at that specific image.
 *
 * Data flow per image
 * -------------------
 *   1. loadNext() clears the canvas and drops the queued file onto it,
 *      then auto-runs Remove background so the user starts halfway
 *      through the job.
 *   2. Studio tools work exactly as normal — the pipeline just adds a
 *      progress bar + Save-and-next control on top.
 *   3. exportCurrent() renders two versions of the current canvas:
 *        - transparent PNG (whatever's on the canvas + alpha)
 *        - white-background PNG (same subject on solid white)
 *      and returns them as blobs to be zipped and downloaded at the end.
 *
 * State lives in editorStore.pipeline; helpers here are just the doers.
 */

export interface PipelineOutput {
  filename: string
  transparent: Blob
  white: Blob
}

/**
 * Clear everything, drop the next file, kick off Remove background.
 * Returns the FabricImage that got placed so callers can wire progress
 * callbacks to it. `onBgPhase` is forwarded to removeImageBackground so
 * the pipeline UI can show the same fp16-model progress messages as the
 * sidebar's Remove background tile.
 */
export async function loadPipelineImage(
  canvas: Canvas,
  file: File,
  bgCallbacks: Parameters<typeof removeImageBackground>[2] = {},
): Promise<FabricImage | null> {
  // Wipe anything left over from the previous image.
  const existing = [...canvas.getObjects()]
  for (const obj of existing) deleteObject(canvas, obj)
  canvas.backgroundColor = ''
  canvas.requestRenderAll()

  const image = await addImageFromFile(canvas, file)
  try {
    return await removeImageBackground(canvas, image, bgCallbacks)
  } catch {
    // If BG removal fails (network hiccup, model refuses), leave the
    // original image on the canvas so the user can decide manually.
    return image
  }
}

/**
 * Render the current canvas to two PNG blobs — one keeping whatever
 * background is set, one forced onto solid white. Uses temporary
 * background-color swaps so we don't leave the canvas in an
 * unexpected state.
 */
export async function exportPipelineOutputs(canvas: Canvas, sourceFilename: string): Promise<PipelineOutput> {
  const stem = sourceFilename.replace(/\.[^.]+$/, '') || 'image'
  const originalBg = canvas.backgroundColor
  // Transparent version — clear any background first.
  canvas.backgroundColor = ''
  canvas.requestRenderAll()
  const transparent = await canvasToBlob(canvas)
  // White version — solid white behind the (already-transparent-outside)
  // subject.
  canvas.backgroundColor = '#ffffff'
  canvas.requestRenderAll()
  const white = await canvasToBlob(canvas)
  canvas.backgroundColor = originalBg
  canvas.requestRenderAll()
  return {
    filename: stem,
    transparent,
    white,
  }
}

async function canvasToBlob(canvas: Canvas): Promise<Blob> {
  const dataUrl = canvas.toDataURL({ format: 'png', multiplier: 1, quality: 1 })
  const res = await fetch(dataUrl)
  return await res.blob()
}

/**
 * Bundle every pipeline output into a single ZIP:
 *   <stem>/transparent.png
 *   <stem>/white.png
 * so a supplier folder can be uploaded to the store or to Drive as-is.
 */
export async function packagePipelineZip(outputs: PipelineOutput[]): Promise<Blob> {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  for (const out of outputs) {
    const folder = zip.folder(out.filename)!
    folder.file('transparent.png', out.transparent)
    folder.file('white.png', out.white)
  }
  return await zip.generateAsync({ type: 'blob' })
}

// Referenced for JSX typing only — keeps eslint quiet about unused imports
// when this file is included in a build that tree-shakes them.
export type { Rect }
