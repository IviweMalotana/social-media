import { Eye, EyeOff, Trash2, ChevronUp, ChevronDown, Image as ImageIcon, Type, Square, Circle } from 'lucide-react'
import { useEditorStore } from '../store/editorStore'
import { deleteObject, reorderLayer, setObjectVisible } from '../lib/canvasActions'
import type { FabricObject } from 'fabric'

type TaggedObject = FabricObject & { id?: string; name?: string }

function iconFor(obj: TaggedObject) {
  switch (obj.type) {
    case 'image':
      return <ImageIcon size={14} />
    case 'i-text':
    case 'text':
      return <Type size={14} />
    case 'circle':
      return <Circle size={14} />
    default:
      return <Square size={14} />
  }
}

export function LayerPanel() {
  const canvas = useEditorStore((s) => s.canvas)
  const selectedId = useEditorStore((s) => s.selectedId)
  // subscribed so the panel re-renders whenever the canvas contents change
  useEditorStore((s) => s.layersVersion)

  if (!canvas) return null

  const objects = (canvas.getObjects() as TaggedObject[]).slice().reverse()

  const select = (obj: TaggedObject) => {
    canvas.setActiveObject(obj)
    canvas.requestRenderAll()
  }

  if (objects.length === 0) {
    return (
      <div className="panel-section">
        <div className="panel-title">Layers</div>
        <div className="empty-state">Add an image, text, or shape to get started.</div>
      </div>
    )
  }

  return (
    <div className="panel-section">
      <div className="panel-title">Layers</div>
      <div className="layer-list">
        {objects.map((obj) => (
          <div
            key={obj.id}
            className={`layer-row ${selectedId === obj.id ? 'active' : ''}`}
            onClick={() => select(obj)}
          >
            <span className="layer-icon">{iconFor(obj)}</span>
            <span className="layer-name">{obj.name ?? obj.type}</span>
            <span className="layer-actions">
              <button
                title="Move up"
                onClick={(e) => {
                  e.stopPropagation()
                  reorderLayer(canvas, obj, 'up')
                }}
              >
                <ChevronUp size={14} />
              </button>
              <button
                title="Move down"
                onClick={(e) => {
                  e.stopPropagation()
                  reorderLayer(canvas, obj, 'down')
                }}
              >
                <ChevronDown size={14} />
              </button>
              <button
                title={obj.visible === false ? 'Show' : 'Hide'}
                onClick={(e) => {
                  e.stopPropagation()
                  setObjectVisible(canvas, obj, obj.visible === false)
                }}
              >
                {obj.visible === false ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              <button
                title="Delete"
                onClick={(e) => {
                  e.stopPropagation()
                  deleteObject(canvas, obj)
                }}
              >
                <Trash2 size={14} />
              </button>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
