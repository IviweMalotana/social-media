import { useEffect, useRef, useState } from 'react'
import { Loader2, X, ArrowRight, Download, PackageOpen, Cloud, Check, ExternalLink } from 'lucide-react'
import { useEditorStore } from '../store/editorStore'
import { loadPipelineImage, exportPipelineOutputs, packagePipelineZip, type PipelinePhase } from '../lib/pipeline'
import { auth } from '../../api'

/**
 * VITE_STUDIO_DRIVE_ENABLED — set to "true" on Vercel to reveal the Save-to-
 * Drive button on the pipeline summary. Kept as an explicit opt-in so a
 * deploy that hasn't set STUDIO_UPLOAD_API_KEY on the backend doesn't show
 * a button that would just 503.
 */
const DRIVE_ENABLED = import.meta.env.VITE_STUDIO_DRIVE_ENABLED === 'true'
const DRIVE_UPLOAD_ENDPOINT = '/api/studio/drive-upload'

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
  const startTextReview = useEditorStore((s) => s.startTextReview)
  const cancelTextReview = useEditorStore((s) => s.cancelTextReview)

  const [phase, setPhase] = useState<PipelinePhase>('idle')
  const [phaseProgress, setPhaseProgress] = useState(0)
  const [zipUrl, setZipUrl] = useState<string | null>(null)
  const [driveState, setDriveState] = useState<
    | { phase: 'idle' }
    | { phase: 'uploading'; done: number; total: number }
    | { phase: 'done'; uploaded: { name: string; driveUrl: string }[]; failed: { name: string; error: string }[] }
    | { phase: 'error'; error: string }
  >({ phase: 'idle' })

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
    setPhase('bg-loading')
    setPhaseProgress(0)
    // Clear any stale review overlay left over from the previous image.
    cancelTextReview()
    loadPipelineImage(canvas, file, {
      onPhase: (p) => setPhase(p),
      onProgress: (f) => setPhaseProgress(f),
    })
      .then((result) => {
        // Feed detected candidates into the same review UI the manual
        // Detect text tile uses — clickable overlay boxes on the canvas,
        // likelyReal pre-selected. User confirms via toolbar Erase N.
        if (result && result.targetId && result.textCandidates.length > 0) {
          startTextReview(result.targetId, result.textCandidates)
        }
      })
      .finally(() => {
        setPhase('idle')
        setPhaseProgress(0)
        setPipelineLoading(false)
      })
  }, [canvas, pipeline, setPipelineLoading, startTextReview, cancelTextReview])

  if (!pipeline) return null

  const total = pipeline.files.length
  const done = pipeline.outputs.length
  const currentFile = pipeline.files[pipeline.currentIndex]
  const isLastImage = pipeline.currentIndex === total - 1
  const allProcessed = pipeline.currentIndex >= total

  const handleSaveAndNext = async () => {
    if (!canvas || !currentFile) return
    setPipelineLoading(true)
    // Clear text-review overlay so its dashed boxes don't render into the export.
    cancelTextReview()
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
            {phase === 'bg-loading' &&
              (phaseProgress > 0 ? `Loading BG model ${Math.round(phaseProgress * 100)}%` : 'Loading BG removal model…')}
            {phase === 'bg-processing' &&
              (phaseProgress > 0 ? `Removing background ${Math.round(phaseProgress * 100)}%` : 'Removing background…')}
            {phase === 'bg-refining' && 'Sharpening edges…'}
            {phase === 'bg-compositing' && 'Placing on canvas…'}
            {phase === 'text-loading' &&
              (phaseProgress > 0 ? `Loading OCR ${Math.round(phaseProgress * 100)}%` : 'Loading OCR model…')}
            {phase === 'text-recognizing' &&
              (phaseProgress > 0 ? `Detecting text ${Math.round(phaseProgress * 100)}%` : 'Detecting text…')}
            {phase === 'idle' && 'Review the highlighted labels, then click Erase in the toolbar. Clean up anything else, then Save & next.'}
          </div>
          <button className="btn btn-cancel" onClick={cancelPipeline}>
            <X size={16} /> Cancel pipeline
          </button>
          <button
            className="btn btn-primary"
            disabled={phase !== 'idle' || pipeline.loading}
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
            {DRIVE_ENABLED && (
              <button
                className="btn btn-confirm"
                style={{ marginTop: 8 }}
                disabled={driveState.phase === 'uploading'}
                onClick={async () => {
                  const outputs = pipeline.outputs
                  const total = outputs.length * 2
                  setDriveState({ phase: 'uploading', done: 0, total })
                  const form = new FormData()
                  for (const out of outputs) {
                    form.append('files', out.transparent, `${out.filename}__transparent.png`)
                    form.append('files', out.white, `${out.filename}__white.png`)
                  }
                  try {
                    const headers: Record<string, string> = {}
                    if (auth.token) headers.Authorization = `Bearer ${auth.token}`
                    const res = await fetch(DRIVE_UPLOAD_ENDPOINT, {
                      method: 'POST',
                      body: form,
                      headers,
                    })
                    const body = await res.json().catch(() => null) as {
                      uploaded?: { name: string; driveUrl: string }[]
                      failed?: { name: string; error: string }[]
                      message?: string
                    } | null
                    if (!res.ok) {
                      setDriveState({
                        phase: 'error',
                        error: body?.message ?? `Upload failed (${res.status})`,
                      })
                      return
                    }
                    setDriveState({
                      phase: 'done',
                      uploaded: body?.uploaded ?? [],
                      failed: body?.failed ?? [],
                    })
                  } catch (err) {
                    setDriveState({
                      phase: 'error',
                      error: err instanceof Error ? err.message : String(err),
                    })
                  }
                }}
              >
                {driveState.phase === 'uploading' ? (
                  <>
                    <Loader2 size={16} className="spin" /> Uploading {driveState.total} files…
                  </>
                ) : driveState.phase === 'done' ? (
                  <>
                    <Check size={16} /> Saved {driveState.uploaded.length} files
                  </>
                ) : (
                  <>
                    <Cloud size={16} /> Save to Drive
                  </>
                )}
              </button>
            )}
            {driveState.phase === 'error' && (
              <div className="error-text" style={{ marginTop: 8 }}>
                {driveState.error}
              </div>
            )}
            {driveState.phase === 'done' && driveState.uploaded.length > 0 && (
              <ul style={{ marginTop: 12, padding: 0, listStyle: 'none', fontSize: 12 }}>
                {driveState.uploaded.map((f) => (
                  <li key={f.name} style={{ padding: '4px 0' }}>
                    <a
                      href={f.driveUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: 'var(--accent)' }}
                    >
                      {f.name} <ExternalLink size={11} style={{ verticalAlign: 'middle' }} />
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {driveState.phase === 'done' && driveState.failed.length > 0 && (
              <div className="error-text" style={{ marginTop: 8 }}>
                {driveState.failed.length} file(s) failed —{' '}
                {driveState.failed.map((f) => f.name).join(', ')}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
