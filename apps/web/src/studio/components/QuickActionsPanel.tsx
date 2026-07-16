import { useMemo, useState, useRef } from 'react'
import {
  Wand2,
  Loader2,
  Sparkles,
  Sun,
  Circle as CircleIcon,
  FlipHorizontal,
  FlipVertical,
  Copy,
  ImageIcon,
  Square,
  Palette,
  Crop,
  Image as ImageFrame,
} from 'lucide-react'
import { useEditorStore } from '../store/editorStore'
import { commitPendingChange } from '../lib/canvasActions'
import { PRESETS, applyPreset } from '../lib/presets'
import { toggleNamedFilter, hasNamedFilter } from '../lib/filters'
import { removeImageBackground } from '../lib/backgroundRemoval'
import {
  PLATFORM_PRESETS,
  addDropShadow,
  removeDropShadow,
  hasDropShadow,
  setCanvasBackground,
  flipObject,
  duplicateObject,
  resizeCanvas,
  addBackgroundImage,
} from '../lib/quickActions'
import type { FabricImage, FabricObject } from 'fabric'

type TaggedObject = FabricObject & { id?: string; name?: string }

/**
 * Fabric v7 exposes object type as a class name — check both lowercase and
 * capitalized forms so we're robust across Fabric versions and serialization
 * round-trips (loadFromJSON can restore objects with slightly different type
 * strings than the live class).
 */
function isFabricImage(obj: FabricObject): boolean {
  const type = (obj as unknown as { type?: string }).type
  return type === 'image' || type === 'Image' || type === 'FabricImage'
}

const BG_COLORS: { label: string; color: string | null }[] = [
  { label: 'White', color: '#ffffff' },
  { label: 'Black', color: '#000000' },
  { label: 'Cream', color: '#f5efe6' },
  { label: 'Sky', color: '#dbeafe' },
  { label: 'Rose', color: '#fce7f3' },
  { label: 'None', color: null },
]

export function QuickActionsPanel() {
  const canvas = useEditorStore((s) => s.canvas)
  const selectedId = useEditorStore((s) => s.selectedId)
  const layersVersion = useEditorStore((s) => s.layersVersion)
  const bgFileInputRef = useRef<HTMLInputElement>(null)
  const [removingBg, setRemovingBg] = useState(false)
  const [bgError, setBgError] = useState<string | null>(null)

  /**
   * Resolve which object the action should target. Prefer the user's active
   * selection; if nothing is selected, fall back to the topmost object on the
   * canvas so tiles still do something after the canvas has been clicked away.
   * (Clicking the tile grid steals focus from Fabric, which was silently
   * clearing selection and leaving actions as no-ops.)
   */
  const resolveTarget = (): TaggedObject | undefined => {
    if (!canvas) return undefined
    const objects = canvas.getObjects() as TaggedObject[]
    if (selectedId) {
      const found = objects.find((o) => o.id === selectedId)
      if (found) return found
    }
    return objects.length > 0 ? objects[objects.length - 1] : undefined
  }
  const resolveImage = (): FabricImage | undefined => {
    if (!canvas) return undefined
    const objects = canvas.getObjects() as TaggedObject[]
    if (selectedId) {
      const found = objects.find((o) => o.id === selectedId)
      if (found && isFabricImage(found)) return found as unknown as FabricImage
    }
    // Newest-first — matches user expectation ("the image I just added").
    for (let i = objects.length - 1; i >= 0; i--) {
      if (isFabricImage(objects[i])) return objects[i] as unknown as FabricImage
    }
    return undefined
  }

  const obj = useMemo<TaggedObject | undefined>(() => {
    if (!canvas || !selectedId) return undefined
    return (canvas.getObjects() as TaggedObject[]).find((o) => o.id === selectedId)
  }, [canvas, selectedId, layersVersion])

  const img = obj && isFabricImage(obj) ? (obj as unknown as FabricImage) : undefined
  void layersVersion

  if (!canvas) return null

  // Disabled state reflects whether *any* usable target exists on the canvas —
  // not just whether one is selected — since actions fall back to the topmost.
  const hasAnyObject = canvas.getObjects().length > 0
  const hasAnyImage = canvas.getObjects().some(isFabricImage)
  const disabled = !hasAnyObject
  const imageDisabled = !hasAnyImage

  return (
    <div className="panel-section quick-actions">
      <div className="panel-title">Quick actions</div>
      {!hasAnyObject && (
        <div className="empty-state" style={{ marginBottom: 12 }}>
          Drop an image on the canvas (or paste one), then pick an action.
        </div>
      )}

      <div className="panel-subtitle">
        <ImageIcon size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Background
      </div>
      <button
        className="btn btn-secondary"
        disabled={imageDisabled || removingBg}
        onClick={async () => {
          const target = resolveImage()
          if (!target) return
          setRemovingBg(true)
          setBgError(null)
          try {
            await removeImageBackground(canvas, target)
          } catch {
            setBgError('Background removal failed — check your connection and try again.')
          } finally {
            setRemovingBg(false)
          }
        }}
      >
        {removingBg ? <Loader2 size={14} className="spin" /> : <Wand2 size={14} />}
        {removingBg ? 'Removing background…' : 'Remove background'}
      </button>
      {bgError && <div className="error-text">{bgError}</div>}

      <div className="tile-row">
        {BG_COLORS.map((c) => (
          <button
            key={c.label}
            className={`tile tile-swatch ${canvas.backgroundColor === c.color ? 'active' : ''}`}
            onClick={() => setCanvasBackground(canvas, c.color)}
            title={c.color === null ? 'Transparent' : `Background: ${c.label}`}
          >
            <span
              className="tile-swatch-chip"
              style={{
                background: c.color ?? 'repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 0 0 / 8px 8px',
              }}
            />
            <span className="tile-label">{c.label}</span>
          </button>
        ))}
      </div>
      <button
        className="btn btn-secondary"
        onClick={() => bgFileInputRef.current?.click()}
      >
        <ImageFrame size={14} /> Add photo as background
      </button>
      <input
        ref={bgFileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={async (e) => {
          const file = e.target.files?.[0]
          if (file) await addBackgroundImage(canvas, file)
          e.target.value = ''
        }}
      />

      <div className="panel-subtitle">
        <Sparkles size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Beautify
      </div>
      <div className="tile-row">
        {PRESETS.filter((p) => p.key !== 'original').map((preset) => (
          <button
            key={preset.key}
            className="tile"
            disabled={imageDisabled}
            onClick={() => {
              const target = resolveImage()
              if (!target) return
              applyPreset(target, preset)
              commitPendingChange(canvas)
              canvas.setActiveObject(target)
              canvas.requestRenderAll()
            }}
          >
            <Sun size={16} />
            <span className="tile-label">{preset.label}</span>
          </button>
        ))}
      </div>

      <div className="panel-subtitle">
        <Palette size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Effects & style
      </div>
      <div className="tile-row">
        <button
          className={`tile ${img && hasNamedFilter(img, 'Grayscale') ? 'active' : ''}`}
          disabled={imageDisabled}
          onClick={() => {
            const target = resolveImage()
            if (!target) return
            toggleNamedFilter(target, 'Grayscale', !hasNamedFilter(target, 'Grayscale'))
            commitPendingChange(canvas)
            canvas.setActiveObject(target)
            canvas.requestRenderAll()
          }}
        >
          <CircleIcon size={16} />
          <span className="tile-label">B & W</span>
        </button>
        <button
          className={`tile ${img && hasNamedFilter(img, 'Sepia') ? 'active' : ''}`}
          disabled={imageDisabled}
          onClick={() => {
            const target = resolveImage()
            if (!target) return
            toggleNamedFilter(target, 'Sepia', !hasNamedFilter(target, 'Sepia'))
            commitPendingChange(canvas)
            canvas.setActiveObject(target)
            canvas.requestRenderAll()
          }}
        >
          <CircleIcon size={16} />
          <span className="tile-label">Sepia</span>
        </button>
        <button
          className={`tile ${obj && hasDropShadow(obj) ? 'active' : ''}`}
          disabled={disabled}
          onClick={() => {
            const target = resolveTarget()
            if (!target) return
            if (hasDropShadow(target)) removeDropShadow(canvas, target)
            else addDropShadow(canvas, target)
            canvas.setActiveObject(target)
            canvas.requestRenderAll()
          }}
        >
          <Square size={16} />
          <span className="tile-label">Shadow</span>
        </button>
        <button
          className="tile"
          disabled={disabled}
          onClick={() => {
            const target = resolveTarget()
            if (target) flipObject(canvas, target, 'horizontal')
          }}
        >
          <FlipHorizontal size={16} />
          <span className="tile-label">Flip H</span>
        </button>
        <button
          className="tile"
          disabled={disabled}
          onClick={() => {
            const target = resolveTarget()
            if (target) flipObject(canvas, target, 'vertical')
          }}
        >
          <FlipVertical size={16} />
          <span className="tile-label">Flip V</span>
        </button>
        <button
          className="tile"
          disabled={disabled}
          onClick={() => {
            const target = resolveTarget()
            if (target) duplicateObject(canvas, target)
          }}
        >
          <Copy size={16} />
          <span className="tile-label">Duplicate</span>
        </button>
      </div>

      <div className="panel-subtitle">
        <Crop size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Resize for platform
      </div>
      <div className="tile-row">
        {PLATFORM_PRESETS.map((p) => {
          const active = canvas.width === p.width && canvas.height === p.height
          return (
            <button
              key={p.key}
              className={`tile tile-platform ${active ? 'active' : ''}`}
              onClick={() => resizeCanvas(canvas, p.width, p.height)}
              title={p.hint}
            >
              <span className="tile-label">{p.label}</span>
              <span className="tile-hint">{p.hint}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
