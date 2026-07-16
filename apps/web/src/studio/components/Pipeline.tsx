import { useEffect, useRef, useState } from 'react'
import { Loader2, X, ArrowRight, Download, PackageOpen } from 'lucide-react'
import { useEditorStore } from '../store/editorStore'
import { loadPipelineImage, exportPipelineOutputs, packagePipelineZip } from '../lib/pipeline'
import type { BackgroundRemovalPhase } from '../lib/backgroundRemoval'

/**
 * Sequential pipeline UI for processing a batch of supplier images.
 *
 * Renders three things when `pipeline` is active in the store:
 *
 * 1. A top progress bar showing where we are in the queue.
 * 2. A bottom action bar with "Save & next" + "Cancel pipeline".
 *    The main studio (canvas + all sidebar tools) stays fully usable
 *    in between images — the user can eraser, magic-remove, upscale,
 *    text-detect, whatever.
 * 3. A modal at the end offering the ZIP download of every output.
 *
 * Auto-work on image load
 * -----------------------
 * Each new image goes through Remove background automatically on
 * arrival, so the user starts with the subject already cut out and
 * only has to do the parts that need judgement (extra bottles, weird
 * labels, tone). Progress from BG removal shows in the loader row.
 *
 * The Cancel button ends the pipeline but keeps whatever's currently
 * on the canvas — useful if a nasty image should just be edited by
 * hand and skipped from the batch.
 */
export function Pipeline() {
  const canvas = useEditorStore((s) => s.canvas)
  const pipeline = useEditorStore((s) => s.pipeline)
  const setPipelineLoading = useEditorStore((s) => s.setPipelineLoading)
  const advancePipeline = useEditorStore((s) => s.advancePipeline)
  const setPipelineExporting = useEditorStore((s) => s.setPipelineExporting)
  const cancelPipeline = useEditorStore((s) => s.cancelPipeline)

  const [bgPhase, setBgPhase] = useState<BackgroundRemovalPhase | null>(null)
  const [bgProgress, setBgProgress] = useState(0)
  const [zipUrl, setZipUrl] = useState<string | null>(null)

  // Load the current image whenever the queue index advances. Guarded so
  // React StrictMode's double-invoke in dev doesn't kick off two loads
  // for the same slot.
  const loadedForIndex = useRef<number | null>(null)
  useEffect(() => {
    if (!canvas || !pipeline) {
      loadedForIndex.current = null
      return
    }
    if (pipeline.currentIndex >= pipeline.files.length) return
    if (loadedForIndex.current === pipeline.currentIndex) return
    loadedForIndex.current = pipeline.currentIndex
    const file = pipeline.files[pipeline.currentIndex]
    setBgPhase('loading')
    setBgProgress(0)
    loadPipelineImage(canvas, file, {
      onPhase: (p) => setBgPhase(p),
      onProgress: (f) => setBgProgress(f),
    })
      .finally(() => {
        setBgPhase(null)
        setBgProgress(0)
        setPipelineLoading(false)
      })
  }, [canvas, pipeline, setPipelineLoading])

  if (!pipeline) return null

  const total = pipeline.files.length
  const done = pipeline.outputs.length
  const currentFile = pipeline.files[pipeline.currentIndex]
  const isLastImage = pipeline.currentIndex === total - 1
  const allProcessed = pipeline.currentIndex >= total

  const handleSaveAndNext = async () => {
    if (!canvas || !currentFile) return
    setPipelineLoading(true)
    const output = await exportPipelineOutputs(canvas, currentFile.name)
    advancePipeline(output)
    // If that was the last file, kick off the ZIP now so the user gets
    // download-ready feedback instead of a bare summary.
    if (isLastImage) {
      setPipelineExporting(true)
      try {
        const finalOutputs = [...pipeline.outputs, output]
        const blob = await packagePipelineZip(finalOutputs)
        setZipUrl(URL.createObjectURL(blob))
      } finally {
        setPipelineExporting(false)
      }
    }
  }

  return (
    <>
      <div className="pipeline-progress">
        <div className="pipeline-progress-track">
          <div
            className="pipeline-progress-fill"
            style={{ width: `${Math.min(100, (done / Math.max(total, 1)) * 100)}%` }}
          />
        </div>
        <div className="pipeline-progress-label">
          Processing supplier images: {Math.min(done + 1, total)} of {total}
          {currentFile && ` · ${currentFile.name}`}
        </div>
      </div>

      {!allProcessed && (
        <div className="pipeline-action-bar">
          <div className="pipeline-action-status">
            {bgPhase === 'loading' &&
              (bgProgress > 0 ? `Loading model ${Math.round(bgProgress * 100)}%` : 'Loading BG removal model…')}
            {bgPhase === 'processing' &&
              (bgProgress > 0 ? `Cutting out ${Math.round(bgProgress * 100)}%` : 'Cutting out…')}
            {bgPhase === 'refining' && 'Sharpening edges…'}
            {bgPhase === 'compositing' && 'Placing on canvas…'}
            {bgPhase === null && 'Clean up, then click Save & next when this image is ready.'}
          </div>
          <button className="btn btn-cancel" onClick={cancelPipeline}>
            <X size={16} /> Cancel pipeline
          </button>
          <button
            className="btn btn-primary"
            disabled={bgPhase !== null || pipeline.loading}
            onClick={handleSaveAndNext}
          >
            {isLastImage ? <PackageOpen size={16} /> : <ArrowRight size={16} />}
            {isLastImage ? 'Save & finish' : 'Save & next'}
          </button>
        </div>
      )}

      {allProcessed && (
        <div className="modal-overlay">
          <div className="modal modal-wide">
            <div className="modal-header">
              <h2>Batch done — {pipeline.outputs.length} images processed</h2>
              <button className="btn btn-icon" onClick={() => { cancelPipeline(); setZipUrl(null) }}>
                <X size={18} />
              </button>
            </div>
            <p className="modal-hint">
              Each image is saved twice: <strong>transparent.png</strong> for
              overlay work + <strong>white.png</strong> for shop listings.
              Download the ZIP; drop the folders straight into your Drive or
              storefront.
            </p>
            {pipeline.exporting && (
              <div className="render-status">
                <Loader2 size={16} className="spin" /> Packaging ZIP…
              </div>
            )}
            {zipUrl && !pipeline.exporting && (
              <a
                className="btn btn-primary"
                href={zipUrl}
                download="supplier-images-processed.zip"
              >
                <Download size={16} /> Download ZIP ({pipeline.outputs.length} × 2 files)
              </a>
            )}
          </div>
        </div>
      )}
    </>
  )
}
