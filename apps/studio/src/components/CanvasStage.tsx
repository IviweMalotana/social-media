import { useEffect, useRef, useState } from 'react'
import { Canvas } from 'fabric'
import { ImagePlus } from 'lucide-react'
import { useEditorStore } from '../store/editorStore'
import { HistoryManager } from '../lib/history'
import { addImageFromFile } from '../lib/canvasActions'

export const CANVAS_WIDTH = 1200
export const CANVAS_HEIGHT = 800

const VIEWPORT_PADDING = 48

export function CanvasStage() {
  const canvasElRef = useRef<HTMLCanvasElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [dragOver, setDragOver] = useState(false)
  const setCanvas = useEditorStore((s) => s.setCanvas)
  const setSelectedId = useEditorStore((s) => s.setSelectedId)
  const bumpLayers = useEditorStore((s) => s.bumpLayers)
  const layersVersion = useEditorStore((s) => s.layersVersion)
  const canvas = useEditorStore((s) => s.canvas)

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const computeScale = () => {
      const availW = viewport.clientWidth - VIEWPORT_PADDING
      const availH = viewport.clientHeight - VIEWPORT_PADDING
      const next = Math.min(availW / CANVAS_WIDTH, availH / CANVAS_HEIGHT, 1)
      setScale(next > 0 ? next : 1)
    }
    computeScale()
    const observer = new ResizeObserver(computeScale)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!canvasElRef.current) return

    const canvas = new Canvas(canvasElRef.current, {
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      backgroundColor: '#ffffff',
      preserveObjectStacking: true,
    })

    const history = new HistoryManager(canvas, () => {
      bumpLayers()
      setSelectedId(null)
    })
    Object.assign(canvas, { history })
    history.snapshot()

    const readSelection = () => {
      const active = canvas.getActiveObject() as unknown as { id?: string } | undefined
      setSelectedId(active?.id ?? null)
    }
    const onModified = () => {
      history.snapshot()
      bumpLayers()
    }
    const onAdded = () => bumpLayers()
    const onRemoved = () => bumpLayers()

    canvas.on('selection:created', readSelection)
    canvas.on('selection:updated', readSelection)
    canvas.on('selection:cleared', () => setSelectedId(null))
    canvas.on('object:modified', onModified)
    canvas.on('object:added', onAdded)
    canvas.on('object:removed', onRemoved)

    setCanvas(canvas)

    return () => {
      canvas.dispose()
      setCanvas(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!canvas) return
    const onPaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of Array.from(items)) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) {
            e.preventDefault()
            await addImageFromFile(canvas, file)
            return
          }
        }
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [canvas])

  const handleDragEnter = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault()
      setDragOver(true)
    }
  }
  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }
  const handleDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget === e.target) setDragOver(false)
  }
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (!canvas) return
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'))
    for (const file of files) await addImageFromFile(canvas, file)
  }

  const isEmpty = canvas ? canvas.getObjects().length === 0 : true
  // layersVersion invalidates the isEmpty read whenever the canvas changes.
  void layersVersion

  return (
    <div
      className={`canvas-viewport ${dragOver ? 'is-drag-over' : ''}`}
      ref={viewportRef}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="canvas-shadow" style={{ width: CANVAS_WIDTH * scale, height: CANVAS_HEIGHT * scale }}>
        <div style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          <canvas ref={canvasElRef} />
        </div>
        {isEmpty && (
          <div className="canvas-empty-hint" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
            <ImagePlus size={40} strokeWidth={1.5} />
            <div className="canvas-empty-title">Drop an image or paste</div>
            <div className="canvas-empty-sub">Then pick a quick action on the right</div>
          </div>
        )}
      </div>
    </div>
  )
}
