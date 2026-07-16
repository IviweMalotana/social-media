import { useEffect, useRef, useState } from 'react'
import { Canvas } from 'fabric'
import { useEditorStore } from '../store/editorStore'
import { HistoryManager } from '../lib/history'

export const CANVAS_WIDTH = 1200
export const CANVAS_HEIGHT = 800

const VIEWPORT_PADDING = 48

export function CanvasStage() {
  const canvasElRef = useRef<HTMLCanvasElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const setCanvas = useEditorStore((s) => s.setCanvas)
  const setSelectedId = useEditorStore((s) => s.setSelectedId)
  const bumpLayers = useEditorStore((s) => s.bumpLayers)

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

  return (
    <div className="canvas-viewport" ref={viewportRef}>
      <div className="canvas-shadow" style={{ width: CANVAS_WIDTH * scale, height: CANVAS_HEIGHT * scale }}>
        <div style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          <canvas ref={canvasElRef} />
        </div>
      </div>
    </div>
  )
}
