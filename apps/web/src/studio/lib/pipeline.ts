import { FabricImage, Rect } from 'fabric'
import type { Canvas } from 'fabric'
import { addImageFromFile, deleteObject } from './canvasActions'
import { removeImageBackground } from './backgroundRemoval'
import { detectText } from './textErase'
import type { TextCandidate } from './textErase'

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

export type PipelinePhase =
  | 'bg-loading'
  | 'bg-processing'
  | 'bg-refining'
  | 'bg-compositing'
  | 'text-loading'
  | 'text-recognizing'
  | 'idle'

export interface PipelineLoadResult {
  image: FabricImage
  targetId: string | null
  textCandidates: TextCandidate[]
}

/**
 * Clear everything, drop the next file, kick off Remove background, then
 * auto-detect + erase any high-confidence text so the user starts as close
 * to "cleaned up" as we can get without their input. Returns the FabricImage
 * that got placed (or the BG-removed cutout if that succeeded) so the UI
 * can hand off to the studio tools.
 *
 * Both steps report through the same `onPhase` callback so the pipeline
 * action-bar shows a single continuous status readout instead of two
 * unrelated spinners.
 */
export async function loadPipelineImage(
  canvas: Canvas,
  file: File,
  callbacks: {
    onPhase?: (phase: PipelinePhase) => void
    onProgress?: (fraction: number) => void
  } = {},
): Promise<PipelineLoadResult | null> {
  // Wipe anything left over from the previous image.
  const existing = [...canvas.getObjects()]
  for (const obj of existing) deleteObject(canvas, obj)
  canvas.backgroundColor = ''
  canvas.requestRenderAll()

  const image = await addImageFromFile(canvas, file)
  let cutout: FabricImage | null = null
  try {
    cutout = await removeImageBackground(canvas, image, {
      onPhase: (p) =>
        callbacks.onPhase?.(
          p === 'loading' ? 'bg-loading'
          : p === 'processing' ? 'bg-processing'
          : p === 'refining' ? 'bg-refining'
          : p === 'compositing' ? 'bg-compositing'
          : 'idle',
        ),
      onProgress: callbacks.onProgress,
    })
  } catch {
    // BG removal failed (network hiccup, model refused) — leave the
    // original image on the canvas so the user can decide manually.
    // No text review either; there's nothing meaningful to cut.
    return { image, targetId: (image as unknown as { id?: string }).id ?? null, textCandidates: [] }
  }

  // Detect text — but DON'T apply. We return the candidates so the pipeline
  // component can enter the same review mode the manual Detect text tile uses
  // (clickable overlay boxes on the canvas, likelyReal pre-selected). The
  // user confirms + clicks Erase N in the toolbar; that runs eraseTextBoxes
  // with the smart surrounding-colour fill.
  //
  // Rationale: OCR misses stuff. Auto-applying hides misses; showing the
  // boxes lets the user tick the missed one AND untick the false positive
  // in the same interaction.
  const target = cutout ?? image
  let candidates: TextCandidate[] = []
  try {
    candidates = await detectText(target, {
      onPhase: (p) =>
        callbacks.onPhase?.(
          p === 'loading' ? 'text-loading'
          : p === 'recognizing' ? 'text-recognizing'
          : 'idle',
        ),
      onProgress: callbacks.onProgress,
    })
  } catch {
    // OCR failure isn't fatal — user still has the manual Detect text tool.
  }

  callbacks.onPhase?.('idle')
  return {
    image: target,
    targetId: (target as unknown as { id?: string }).id ?? null,
    textCandidates: candidates,
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
