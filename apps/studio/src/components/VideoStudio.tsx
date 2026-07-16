import { useRef, useState } from 'react'
import { X, ImagePlus, ChevronUp, ChevronDown, Trash2, Film, Loader2, Download } from 'lucide-react'
import { useEditorStore } from '../store/editorStore'
import { loadImage, renderSlideshow, type Slide, type RenderHandle } from '../lib/video'

const DEFAULT_DURATION = 3
const TRANSITION_DURATION = 0.6
const OUTPUT_WIDTH = 1280
const OUTPUT_HEIGHT = 720
const FPS = 30

export function VideoStudio() {
  const isOpen = useEditorStore((s) => s.isVideoStudioOpen)
  const setOpen = useEditorStore((s) => s.setVideoStudioOpen)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const handleRef = useRef<RenderHandle | null>(null)

  const [slides, setSlides] = useState<Slide[]>([])
  const [rendering, setRendering] = useState(false)
  const [progress, setProgress] = useState(0)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const totalDuration = slides.reduce((sum, s) => sum + s.duration, 0)

  const close = () => {
    if (rendering) handleRef.current?.cancel()
    setOpen(false)
  }

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const next: Slide[] = []
    for (const file of Array.from(files)) {
      const url = URL.createObjectURL(file)
      try {
        const image = await loadImage(url)
        next.push({ id: crypto.randomUUID(), url, image, duration: DEFAULT_DURATION })
      } catch {
        URL.revokeObjectURL(url)
      }
    }
    setSlides((prev) => [...prev, ...next])
  }

  const removeSlide = (id: string) => {
    setSlides((prev) => {
      const slide = prev.find((s) => s.id === id)
      if (slide) URL.revokeObjectURL(slide.url)
      return prev.filter((s) => s.id !== id)
    })
  }

  const moveSlide = (id: string, direction: 'up' | 'down') => {
    setSlides((prev) => {
      const index = prev.findIndex((s) => s.id === id)
      const target = direction === 'up' ? index - 1 : index + 1
      if (index < 0 || target < 0 || target >= prev.length) return prev
      const copy = [...prev]
      ;[copy[index], copy[target]] = [copy[target], copy[index]]
      return copy
    })
  }

  const setDuration = (id: string, duration: number) => {
    setSlides((prev) => prev.map((s) => (s.id === id ? { ...s, duration: Math.max(0.5, duration) } : s)))
  }

  const handleRender = () => {
    if (slides.length === 0) return
    setError(null)
    setResultUrl(null)
    setRendering(true)
    setProgress(0)
    const handle = renderSlideshow(
      slides,
      { width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT, fps: FPS, transitionDuration: TRANSITION_DURATION },
      setProgress,
    )
    handleRef.current = handle
    handle.promise
      .then((blob) => {
        setResultUrl(URL.createObjectURL(blob))
      })
      .catch((err: Error) => {
        if (err.message !== 'cancelled') setError('Video rendering failed. Try again with fewer/smaller images.')
      })
      .finally(() => {
        setRendering(false)
        handleRef.current = null
      })
  }

  const handleCancel = () => {
    handleRef.current?.cancel()
  }

  return (
    <div className="modal-overlay" onClick={close}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Image to video</h2>
          <button className="btn btn-icon" onClick={close}>
            <X size={18} />
          </button>
        </div>

        <p className="modal-hint">
          Add photos, set how long each shows, and export a slideshow video (pan/zoom + crossfade) as
          WebM. Rendering happens in your browser in real time — a {totalDuration.toFixed(1)}s video
          takes about {totalDuration.toFixed(1)}s to render.
        </p>

        <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
          <ImagePlus size={14} /> Add images
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            handleFiles(e.target.files)
            e.target.value = ''
          }}
        />

        {slides.length > 0 && (
          <div className="slide-list">
            {slides.map((slide, i) => (
              <div key={slide.id} className="slide-row">
                <img src={slide.url} alt="" className="slide-thumb" />
                <div className="slide-controls">
                  <label>
                    Duration
                    <input
                      type="number"
                      min={0.5}
                      step={0.5}
                      value={slide.duration}
                      onChange={(e) => setDuration(slide.id, Number(e.target.value))}
                    />
                    s
                  </label>
                </div>
                <div className="slide-actions">
                  <button disabled={i === 0} onClick={() => moveSlide(slide.id, 'up')} title="Move earlier">
                    <ChevronUp size={14} />
                  </button>
                  <button
                    disabled={i === slides.length - 1}
                    onClick={() => moveSlide(slide.id, 'down')}
                    title="Move later"
                  >
                    <ChevronDown size={14} />
                  </button>
                  <button onClick={() => removeSlide(slide.id)} title="Remove">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {rendering && (
          <div className="render-status">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <button className="btn btn-cancel" onClick={handleCancel}>
              Cancel
            </button>
          </div>
        )}

        {error && <div className="error-text">{error}</div>}

        {resultUrl && !rendering && (
          <div className="video-result">
            <video src={resultUrl} controls className="video-preview" />
            <a className="btn btn-primary" href={resultUrl} download="bdp-studio-video.webm">
              <Download size={16} /> Download video
            </a>
          </div>
        )}

        <button
          className="btn btn-primary btn-render"
          disabled={slides.length === 0 || rendering}
          onClick={handleRender}
        >
          {rendering ? <Loader2 size={16} className="spin" /> : <Film size={16} />}
          {rendering ? `Rendering… ${Math.round(progress * 100)}%` : 'Render video'}
        </button>
      </div>
    </div>
  )
}
