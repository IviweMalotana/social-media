import { X } from 'lucide-react'
import { useEditorStore } from '../store/editorStore'
import { TEMPLATES, applyTemplate, type Template } from '../lib/templates'

export function TemplateGallery() {
  const canvas = useEditorStore((s) => s.canvas)
  const isOpen = useEditorStore((s) => s.isTemplateGalleryOpen)
  const setOpen = useEditorStore((s) => s.setTemplateGalleryOpen)
  const bumpLayers = useEditorStore((s) => s.bumpLayers)
  const setSelectedId = useEditorStore((s) => s.setSelectedId)

  if (!isOpen || !canvas) return null

  const handlePick = (template: Template) => {
    const hasContent = canvas.getObjects().length > 0
    if (hasContent && !window.confirm(`Load "${template.label}"? This replaces everything currently on the canvas.`)) {
      return
    }
    applyTemplate(canvas, template)
    setSelectedId(null)
    bumpLayers()
    setOpen(false)
  }

  return (
    <div className="modal-overlay" onClick={() => setOpen(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Templates</h2>
          <button className="btn btn-icon" onClick={() => setOpen(false)}>
            <X size={18} />
          </button>
        </div>
        <div className="template-grid">
          {TEMPLATES.map((template) => (
            <button key={template.key} className="template-card" onClick={() => handlePick(template)}>
              <div className="template-swatch" style={{ background: template.swatch }} />
              <div className="template-info">
                <div className="template-label">{template.label}</div>
                <div className="template-description">{template.description}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
