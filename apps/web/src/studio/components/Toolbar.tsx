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
} from 'lucide-react'
import { useEditorStore } from '../store/editorStore'
import { addImageFromFile, addText, addRectangle, addCircle, exportCanvas } from '../lib/canvasActions'
import { startCrop, confirmCrop, cancelCrop } from '../lib/crop'
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
      </div>

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

      {activeTool === 'eraser' && (
        <div className="toolbar-group toolbar-eraser">
          <label className="toolbar-eraser-label">
            Brush
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
        <button className="btn btn-primary" onClick={() => exportCanvas(canvas, 'png')}>
          <Download size={16} /> Export PNG
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
