import { useRef } from 'react'
import {
  MousePointer2,
  Type,
  Square,
  Circle as CircleIcon,
  Crop,
  ImagePlus,
  Undo2,
  Redo2,
  Download,
  Check,
  X,
  LayoutTemplate,
  Film,
  Eraser,
  Boxes,
  Undo,
} from 'lucide-react'
import { useEditorStore } from '../store/editorStore'
import { addImageFromFile, addText, addRectangle, addCircle, exportCanvas } from '../lib/canvasActions'
import { startCrop, confirmCrop, cancelCrop } from '../lib/crop'
import { eraseTextBoxes } from '../lib/textErase'
import type { HistoryManager } from '../lib/history'
import type { FabricImage } from 'fabric'

export function Toolbar() {
  const canvas = useEditorStore((s) => s.canvas)
  const activeTool = useEditorStore((s) => s.activeTool)
  const setActiveTool = useEditorStore((s) => s.setActiveTool)
  const isCropping = useEditorStore((s) => s.isCropping)
  const setCropping = useEditorStore((s) => s.setCropping)
  const setTemplateGalleryOpen = useEditorStore((s) => s.setTemplateGalleryOpen)
  const setVideoStudioOpen = useEditorStore((s) => s.setVideoStudioOpen)
  const eraserBrushSize = useEditorStore((s) => s.eraserBrushSize)
  const setEraserBrushSize = useEditorStore((s) => s.setEraserBrushSize)
  const eraserMode = useEditorStore((s) => s.eraserMode)
  const setEraserMode = useEditorStore((s) => s.setEraserMode)
  const textReview = useEditorStore((s) => s.textReview)
  const cancelTextReview = useEditorStore((s) => s.cancelTextReview)
  const pipeline = useEditorStore((s) => s.pipeline)
  const startPipeline = useEditorStore((s) => s.startPipeline)
  const batchInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!canvas) return null

  const history = (canvas as unknown as { history?: HistoryManager }).history

  const handleImagePick = () => fileInputRef.current?.click()

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) await addImageFromFile(canvas, file)
    e.target.value = ''
    setActiveTool('select')
  }

  const handleCrop = () => {
    const active = canvas.getActiveObject() as unknown as { type?: string } | undefined
    if (!active || active.type !== 'image') return
    setCropping(true)
    startCrop(canvas, canvas.getActiveObject() as unknown as FabricImage)
  }

  const handleConfirmCrop = () => {
    confirmCrop(canvas)
    setCropping(false)
    setActiveTool('select')
  }

  const handleCancelCrop = () => {
    cancelCrop(canvas)
    setCropping(false)
    setActiveTool('select')
  }

  return (
    <div className="toolbar">
      <div className="toolbar-brand">BDP Studio</div>

      <div className="toolbar-group">
        <ToolButton
          icon={<MousePointer2 size={18} />}
          label="Select"
          active={activeTool === 'select' && !isCropping}
          onClick={() => setActiveTool('select')}
        />
        <ToolButton
          icon={<ImagePlus size={18} />}
          label="Image"
          active={false}
          onClick={handleImagePick}
        />
        <ToolButton
          icon={<Type size={18} />}
          label="Text"
          active={false}
          onClick={() => {
            addText(canvas)
            setActiveTool('select')
          }}
        />
        <ToolButton
          icon={<Square size={18} />}
          label="Rectangle"
          active={false}
          onClick={() => {
            addRectangle(canvas)
            setActiveTool('select')
          }}
        />
        <ToolButton
          icon={<CircleIcon size={18} />}
          label="Circle"
          active={false}
          onClick={() => {
            addCircle(canvas)
            setActiveTool('select')
          }}
        />
        <ToolButton icon={<Crop size={18} />} label="Crop" active={isCropping} onClick={handleCrop} />
        <ToolButton
          icon={<Eraser size={18} />}
          label="Eraser (drag over the image to remove parts, e.g. labels)"
          active={activeTool === 'eraser'}
          onClick={() => setActiveTool(activeTool === 'eraser' ? 'select' : 'eraser')}
        />
        <ToolButton
          icon={<Undo size={18} />}
          label="Restore (drag a box over a subject BG removal dropped, e.g. a second bottle)"
          active={activeTool === 'restore'}
          onClick={() => setActiveTool(activeTool === 'restore' ? 'select' : 'restore')}
        />
        <ToolButton
          icon={<LayoutTemplate size={18} />}
          label="Templates"
          active={false}
          onClick={() => setTemplateGalleryOpen(true)}
        />
        <ToolButton
          icon={<Film size={18} />}
          label="Video"
          active={false}
          onClick={() => setVideoStudioOpen(true)}
        />
        <ToolButton
          icon={<Boxes size={18} />}
          label="Process supplier images (batch)"
          active={pipeline !== null}
          onClick={() => batchInputRef.current?.click()}
        />
      </div>
      <input
        ref={batchInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith('image/'))
          if (files.length > 0) startPipeline(files)
          e.target.value = ''
        }}
      />

      {isCropping && (
        <div className="toolbar-group">
          <button className="btn btn-confirm" onClick={handleConfirmCrop}>
            <Check size={16} /> Apply crop
          </button>
          <button className="btn btn-cancel" onClick={handleCancelCrop}>
            <X size={16} /> Cancel
          </button>
        </div>
      )}

      {textReview && (
        <div className="toolbar-group toolbar-eraser">
          <span className="toolbar-eraser-hint">
            Review text: click a box to toggle · red = will erase
          </span>
          <button
            className="btn btn-confirm"
            disabled={textReview.selectedIds.size === 0}
            onClick={() => {
              const img = canvas.getObjects().find(
                (o) => (o as unknown as { id?: string }).id === textReview.targetImageId,
              ) as unknown as FabricImage | undefined
              if (!img) {
                cancelTextReview()
                return
              }
              const boxes = textReview.candidates
                .filter((c) => textReview.selectedIds.has(c.id))
                .map((c) => ({ x: c.x, y: c.y, w: c.w, h: c.h }))
              eraseTextBoxes(canvas, img, boxes)
              cancelTextReview()
            }}
          >
            <Check size={16} /> Erase {textReview.selectedIds.size}
          </button>
          <button className="btn btn-cancel" onClick={cancelTextReview}>
            <X size={16} /> Cancel
          </button>
        </div>
      )}

      {activeTool === 'restore' && (
        <div className="toolbar-group toolbar-eraser toolbar-restore">
          <span className="toolbar-eraser-hint">
            Restore: drag a box over a subject BG removal dropped (e.g. a second bottle)
          </span>
          <button className="btn btn-cancel" onClick={() => setActiveTool('select')}>
            <X size={16} /> Done
          </button>
        </div>
      )}

      {activeTool === 'eraser' && (
        <div className="toolbar-group toolbar-eraser">
          <div className="toolbar-eraser-modes">
            <button
              className={`btn ${eraserMode === 'brush' ? 'active' : ''}`}
              onClick={() => setEraserMode('brush')}
            >
              Brush
            </button>
            <button
              className={`btn ${eraserMode === 'box' ? 'active' : ''}`}
              onClick={() => setEraserMode('box')}
            >
              Box
            </button>
            <button
              className={`btn ${eraserMode === 'smart' ? 'active' : ''}`}
              onClick={() => setEraserMode('smart')}
              title="Draw a box over missed text; fills with the surrounding bottle colour instead of leaving a hole"
            >
              Smart
            </button>
          </div>
          {eraserMode === 'brush' && (
            <label className="toolbar-eraser-label">
              Size
              <input
                type="range"
                min={4}
                max={200}
                step={1}
                value={eraserBrushSize}
                onChange={(e) => setEraserBrushSize(Number(e.target.value))}
              />
              <span className="toolbar-eraser-value">{eraserBrushSize}px</span>
            </label>
          )}
          {eraserMode === 'box' && (
            <span className="toolbar-eraser-hint">Drag a box over the label to erase</span>
          )}
          {eraserMode === 'smart' && (
            <span className="toolbar-eraser-hint">Drag a box over missed text; fills with the bottle colour</span>
          )}
          <button className="btn btn-cancel" onClick={() => setActiveTool('select')}>
            <X size={16} /> Done
          </button>
        </div>
      )}

      <div className="toolbar-spacer" />

      <div className="toolbar-group">
        <button className="btn" onClick={() => history?.undo()} title="Undo (Ctrl+Z)">
          <Undo2 size={18} />
        </button>
        <button className="btn" onClick={() => history?.redo()} title="Redo (Ctrl+Shift+Z)">
          <Redo2 size={18} />
        </button>
        <button className="btn btn-primary" onClick={() => exportCanvas(canvas, 'png')} title="Export PNG">
          <Download size={16} /> <span className="btn-primary-label">Export PNG</span>
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
    </div>
  )
}

function ToolButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button className={`btn btn-icon ${active ? 'active' : ''}`} title={label} onClick={onClick}>
      {icon}
    </button>
  )
}
