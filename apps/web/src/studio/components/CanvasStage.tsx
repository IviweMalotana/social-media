import { useEffect, useRef, useState, useCallback } from 'react'
import { Canvas } from 'fabric'
import type { FabricImage, FabricObject } from 'fabric'
import { ImagePlus } from 'lucide-react'
import { useEditorStore } from '../store/editorStore'
import { HistoryManager } from '../lib/history'
import { addImageFromFile } from '../lib/canvasActions'
import { attachEraser } from '../lib/eraser'
import { attachRestore } from '../lib/restore'

export const CANVAS_WIDTH = 1200
export const CANVAS_HEIGHT = 800

const VIEWPORT_PADDING = 48

export function CanvasStage() {
  const canvasElRef = useRef<HTMLCanvasElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [dragOver, setDragOver] = useState(false)
  /**
   * Track canvas pixel dimensions in React state so the outer wrapper resizes
   * when quick-action "Resize for platform" fires (e.g. IG Post 1080² → IG
   * Story 1080×1920). Without this the wrapper stays pinned to the initial
   * 1200×800 and the resized canvas gets visually clipped.
   */
  const [dims, setDims] = useState({ w: CANVAS_WIDTH, h: CANVAS_HEIGHT })
  const setCanvas = useEditorStore((s) => s.setCanvas)
  const setSelectedId = useEditorStore((s) => s.setSelectedId)
  const bumpLayers = useEditorStore((s) => s.bumpLayers)
  const layersVersion = useEditorStore((s) => s.layersVersion)
  const canvas = useEditorStore((s) => s.canvas)
  const activeTool = useEditorStore((s) => s.activeTool)
  const eraserBrushSize = useEditorStore((s) => s.eraserBrushSize)
  const eraserMode = useEditorStore((s) => s.eraserMode)
  const textReview = useEditorStore((s) => s.textReview)
  const toggleTextCandidate = useEditorStore((s) => s.toggleTextCandidate)
  const eraserBrushSizeRef = useRef(eraserBrushSize)
  useEffect(() => {
    eraserBrushSizeRef.current = eraserBrushSize
  }, [eraserBrushSize])
  // Live cursor + box-drag state, tracked in React so the visible brush
  // ring overlay follows the mouse. `null` = hide overlay.
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)
  const [boxDrag, setBoxDrag] = useState<{ x: number; y: number; w: number; h: number } | null>(null)

  const computeScale = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const availW = viewport.clientWidth - VIEWPORT_PADDING
    const availH = viewport.clientHeight - VIEWPORT_PADDING
    const next = Math.min(availW / dims.w, availH / dims.h, 1)
    setScale(next > 0 ? next : 1)
  }, [dims.w, dims.h])

  useEffect(() => {
    computeScale()
    const viewport = viewportRef.current
    if (!viewport) return
    const observer = new ResizeObserver(computeScale)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [computeScale])

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
    const onAdded = () => {
      bumpLayers()
      // Auto-select newly added objects so quick actions can target them
      // without requiring the user to click the canvas first.
      const objs = canvas.getObjects()
      const last = objs[objs.length - 1]
      if (last && !canvas.getActiveObject()) {
        canvas.setActiveObject(last)
        canvas.requestRenderAll()
        setSelectedId((last as unknown as { id?: string }).id ?? null)
      }
    }
    const onRemoved = () => bumpLayers()
    /**
     * Re-sync the viewport scale + wrapper size when the canvas dimensions
     * change (resizeCanvas mutates them directly on the Fabric instance).
     * We poll after `object:modified` fires post-resize since Fabric doesn't
     * emit a dedicated `canvas:resize` event.
     */
    const syncDims = () => setDims({ w: canvas.width!, h: canvas.height! })

    canvas.on('selection:created', readSelection)
    canvas.on('selection:updated', readSelection)
    canvas.on('selection:cleared', () => setSelectedId(null))
    canvas.on('object:modified', () => {
      onModified()
      syncDims()
    })
    canvas.on('object:added', onAdded)
    canvas.on('object:removed', onRemoved)
    // Some quick actions (resize, background swatches) don't emit
    // object:modified but do mutate canvas.width/height directly. Patch
    // setDimensions to notify React state.
    const originalSetDimensions = canvas.setDimensions.bind(canvas)
    canvas.setDimensions = (...args) => {
      const result = originalSetDimensions(...(args as Parameters<typeof originalSetDimensions>))
      syncDims()
      return result
    }

    setCanvas(canvas)

    return () => {
      canvas.dispose()
      setCanvas(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * Eraser mode wiring. Only active while the "Eraser" tool is selected; picks
   * the currently-selected image (or newest one on the canvas) and hooks into
   * Fabric's own mouse events (not raw DOM listeners — Fabric adds an upper
   * canvas overlay for interaction that would swallow direct DOM events).
   *
   * The pointer coords the eraser lib reports back drive both the actual
   * erasure and the visible brush-ring / box-drag overlays rendered by this
   * component.
   */
  useEffect(() => {
    if (!canvas || activeTool !== 'eraser') return
    const image = pickTargetImage(canvas)
    if (!image) return
    const prevSelection = canvas.selection
    canvas.selection = false
    canvas.forEachObject((o) => {
      ;(o as unknown as { evented: boolean }).evented = false
    })
    canvas.discardActiveObject()
    canvas.requestRenderAll()
    const session = attachEraser(
      canvas,
      image,
      () => eraserBrushSizeRef.current,
      eraserMode,
      {
        onCursorMove: (x, y) => setCursor({ x, y }),
        onCursorLeave: () => setCursor(null),
        onBoxDrag: (rect) => setBoxDrag(rect),
      },
    )
    return () => {
      canvas.selection = prevSelection
      canvas.forEachObject((o) => {
        ;(o as unknown as { evented: boolean }).evented = true
      })
      setCursor(null)
      setBoxDrag(null)
      session.detach()
    }
  }, [canvas, activeTool, eraserMode])

  /**
   * Restore mode wiring — mirror of the eraser effect above. Same box-drag
   * overlay + selection-disabling; the lib copies pixels from the cached
   * original bitmap back into the working canvas at the drawn coordinates.
   */
  useEffect(() => {
    if (!canvas || activeTool !== 'restore') return
    const image = pickTargetImage(canvas)
    if (!image) return
    const prevSelection = canvas.selection
    canvas.selection = false
    canvas.forEachObject((o) => {
      ;(o as unknown as { evented: boolean }).evented = false
    })
    canvas.discardActiveObject()
    canvas.requestRenderAll()
    const session = attachRestore(canvas, image, {
      onCursorMove: (x, y) => setCursor({ x, y }),
      onCursorLeave: () => setCursor(null),
      onBoxDrag: (rect) => setBoxDrag(rect),
    })
    return () => {
      canvas.selection = prevSelection
      canvas.forEachObject((o) => {
        ;(o as unknown as { evented: boolean }).evented = true
      })
      setCursor(null)
      setBoxDrag(null)
      session.detach()
    }
  }, [canvas, activeTool])

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
  void pickTargetImage

  const isErasing = activeTool === 'eraser'
  const isRestoring = activeTool === 'restore'
  const brushDiameterOnScreen = eraserBrushSize * scale

  /**
   * Text-review overlay math. The Tesseract bboxes are in the image's
   * native pixel space (the working canvas), but we render them on a DOM
   * div layered over the Fabric canvas — which is itself CSS-scaled by
   * the viewport-fit `scale`. Convert once per box:
   *
   *   image-local (px)
   *     → Fabric-canvas (px) via image transform
   *     → screen (px) via viewport scale
   */
  const textReviewImage =
    textReview && canvas
      ? (canvas.getObjects().find(
          (o) => (o as unknown as { id?: string }).id === textReview.targetImageId,
        ) as unknown as FabricImage | undefined)
      : undefined
  const textReviewOverlays = (() => {
    if (!textReview || !textReviewImage) return []
    const img = textReviewImage
    const nativeW = img.width ?? 1
    const nativeH = img.height ?? 1
    const scaleX = img.scaleX ?? 1
    const scaleY = img.scaleY ?? 1
    // Fabric defaults origin to 'center' in v7 — every layer we place uses that.
    const leftEdge = (img.left ?? 0) - (nativeW * scaleX) / 2
    const topEdge = (img.top ?? 0) - (nativeH * scaleY) / 2
    return textReview.candidates.map((c) => ({
      id: c.id,
      confidence: c.confidence,
      text: c.text,
      likelyReal: c.likelyReal,
      selected: textReview.selectedIds.has(c.id),
      left: (leftEdge + c.x * scaleX) * scale,
      top: (topEdge + c.y * scaleY) * scale,
      width: c.w * scaleX * scale,
      height: c.h * scaleY * scale,
    }))
  })()

  return (
    <div
      className={`canvas-viewport ${dragOver ? 'is-drag-over' : ''}`}
      ref={viewportRef}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        className={`canvas-shadow ${isErasing || isRestoring ? 'is-erasing' : ''}`}
        style={{ width: dims.w * scale, height: dims.h * scale }}
      >
        <div
          style={{
            width: dims.w,
            height: dims.h,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        >
          <canvas ref={canvasElRef} />
        </div>
        {isEmpty && (
          <div className="canvas-empty-hint" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
            <ImagePlus size={40} strokeWidth={1.5} />
            <div className="canvas-empty-title">Drop an image or paste</div>
            <div className="canvas-empty-sub">Then pick a quick action on the right</div>
          </div>
        )}
        {isErasing && cursor && eraserMode === 'brush' && (
          <div
            className="eraser-brush-ring"
            style={{
              width: brushDiameterOnScreen,
              height: brushDiameterOnScreen,
              left: cursor.x * scale - brushDiameterOnScreen / 2,
              top: cursor.y * scale - brushDiameterOnScreen / 2,
            }}
          />
        )}
        {isErasing && boxDrag && eraserMode === 'box' && (
          <div
            className="eraser-box-drag"
            style={{
              left: boxDrag.x * scale,
              top: boxDrag.y * scale,
              width: boxDrag.w * scale,
              height: boxDrag.h * scale,
            }}
          />
        )}
        {isRestoring && boxDrag && (
          <div
            className="eraser-box-drag restore-box-drag"
            style={{
              left: boxDrag.x * scale,
              top: boxDrag.y * scale,
              width: boxDrag.w * scale,
              height: boxDrag.h * scale,
            }}
          />
        )}
        {textReviewOverlays.map((box) => (
          <button
            key={box.id}
            type="button"
            className={`text-review-box ${box.selected ? 'selected' : ''} ${box.likelyReal ? '' : 'uncertain'}`}
            style={{
              left: box.left,
              top: box.top,
              width: box.width,
              height: box.height,
            }}
            title={`${box.text.trim() || '(no text)'} · ${Math.round(box.confidence)}% confident${box.likelyReal ? '' : ' · low confidence'}`}
            onClick={() => toggleTextCandidate(box.id)}
          />
        ))}
      </div>
    </div>
  )
}

function isFabricImage(obj: FabricObject): boolean {
  const type = (obj as unknown as { type?: string }).type
  return type === 'image' || type === 'Image' || type === 'FabricImage'
}

/**
 * Pick which image the eraser should target — prefer the current selection,
 * else the newest image on the canvas. Matches the QuickActionsPanel fallback
 * so the two entry points feel consistent.
 */
function pickTargetImage(canvas: Canvas): FabricImage | undefined {
  const active = canvas.getActiveObject() as unknown as FabricObject | null
  if (active && isFabricImage(active)) return active as unknown as FabricImage
  const objects = canvas.getObjects()
  for (let i = objects.length - 1; i >= 0; i--) {
    if (isFabricImage(objects[i])) return objects[i] as unknown as FabricImage
  }
  return undefined
}
