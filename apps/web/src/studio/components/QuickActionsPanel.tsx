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
  RotateCcw,
  Sticker,
  TextCursor,
  PaintBucket,
  Wand,
} from 'lucide-react'
import { useEditorStore } from '../store/editorStore'
import { commitPendingChange } from '../lib/canvasActions'
import { PRESETS, applyPreset } from '../lib/presets'
import { toggleNamedFilter, hasNamedFilter, resetAllFilters } from '../lib/filters'
import { removeImageBackground } from '../lib/backgroundRemoval'
import { eraseAllText } from '../lib/textErase'
import { fillErasedRegions } from '../lib/fillTransparent'
// Type-only import so the runtime ONNX module (+ onnxruntime-web) stays out
// of the initial bundle; loaded via dynamic import() inside the click handler.
import type { MagicFillPhase } from '../lib/magicFill'
import {
  PLATFORM_PRESETS,
  DEFAULT_CANVAS_WIDTH,
  DEFAULT_CANVAS_HEIGHT,
  addDropShadow,
  removeDropShadow,
  hasDropShadow,
  setCanvasBackground,
  flipObject,
  duplicateObject,
  resizeCanvas,
  addBackgroundImage,
  addLogoOverlay,
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
  const logoFileInputRef = useRef<HTMLInputElement>(null)
  const [removingBg, setRemovingBg] = useState(false)
  const [bgError, setBgError] = useState<string | null>(null)
  const [textErasePhase, setTextErasePhase] = useState<'idle' | 'loading' | 'recognizing' | 'painting'>('idle')
  const [textEraseProgress, setTextEraseProgress] = useState(0)
  const [textEraseResult, setTextEraseResult] = useState<string | null>(null)
  const [filling, setFilling] = useState(false)
  const [magicPhase, setMagicPhase] = useState<MagicFillPhase | 'idle'>('idle')
  const [magicDownload, setMagicDownload] = useState(0)
  const [magicError, setMagicError] = useState<string | null>(null)

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
        <button
          className="tile tile-reset"
          disabled={imageDisabled}
          title="Clear beautify presets, adjustments, and effects on this image"
          onClick={() => {
            const target = resolveImage()
            if (!target) return
            resetAllFilters(target)
            commitPendingChange(canvas)
            canvas.setActiveObject(target)
            canvas.requestRenderAll()
          }}
        >
          <RotateCcw size={16} />
          <span className="tile-label">Original</span>
        </button>
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
        <button
          className="tile"
          onClick={() => logoFileInputRef.current?.click()}
          title="Add a logo or graphic on top of the current design"
        >
          <Sticker size={16} />
          <span className="tile-label">Add logo</span>
        </button>
      </div>
      <input
        ref={logoFileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={async (e) => {
          const file = e.target.files?.[0]
          if (file) await addLogoOverlay(canvas, file)
          e.target.value = ''
        }}
      />

      <div className="panel-subtitle">
        <TextCursor size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Cleanup
      </div>
      <div className="tile-row">
        <button
          className="tile"
          disabled={imageDisabled || textErasePhase !== 'idle'}
          title="Detect and erase all text on the image via OCR (Tesseract.js)"
          onClick={async () => {
            const target = resolveImage()
            if (!target) return
            setTextEraseResult(null)
            setTextEraseProgress(0)
            try {
              const result = await eraseAllText(canvas, target, {
                onPhase: (p) => setTextErasePhase(p === 'done' ? 'idle' : p),
                onProgress: (f) => setTextEraseProgress(f),
              })
              setTextEraseResult(
                result.wordsErased > 0
                  ? `Erased ${result.wordsErased} word${result.wordsErased === 1 ? '' : 's'}`
                  : 'No text detected',
              )
            } catch {
              setTextEraseResult('Text detection failed — retry or check your connection.')
            } finally {
              setTextErasePhase('idle')
              setTextEraseProgress(0)
            }
          }}
        >
          {textErasePhase !== 'idle' ? (
            <Loader2 size={16} className="spin" />
          ) : (
            <TextCursor size={16} />
          )}
          <span className="tile-label">
            {textErasePhase === 'loading' && 'Loading OCR…'}
            {textErasePhase === 'recognizing' && `Reading ${Math.round(textEraseProgress * 100)}%`}
            {textErasePhase === 'painting' && 'Erasing…'}
            {textErasePhase === 'idle' && 'Erase all text'}
          </span>
        </button>
        <button
          className="tile"
          disabled={imageDisabled || filling}
          title="Fill erased/transparent areas by sampling surrounding colors (fast, no download)"
          onClick={async () => {
            const target = resolveImage()
            if (!target) return
            setFilling(true)
            try {
              await new Promise((r) => setTimeout(r, 0))
              fillErasedRegions(canvas, target)
            } finally {
              setFilling(false)
            }
          }}
        >
          {filling ? <Loader2 size={16} className="spin" /> : <PaintBucket size={16} />}
          <span className="tile-label">{filling ? 'Filling…' : 'Fill erased'}</span>
        </button>
        <button
          className="tile"
          disabled={imageDisabled || magicPhase !== 'idle'}
          title="AI content-aware fill — regenerates the erased region with realistic pixels (first click downloads ~55 MB, then instant)"
          onClick={async () => {
            const target = resolveImage()
            if (!target) return
            setMagicError(null)
            setMagicDownload(0)
            try {
              const { magicRemove } = await import('../lib/magicFill')
              await magicRemove(canvas, target, {
                onPhase: (p) => setMagicPhase(p),
                onDownloadProgress: (f) => setMagicDownload(f),
              })
            } catch (err) {
              setMagicError(
                err instanceof Error
                  ? `Magic remove failed: ${err.message}`
                  : 'Magic remove failed — check the console.',
              )
            } finally {
              setMagicPhase('idle')
              setMagicDownload(0)
            }
          }}
        >
          {magicPhase !== 'idle' ? <Loader2 size={16} className="spin" /> : <Wand size={16} />}
          <span className="tile-label">
            {magicPhase === 'idle' && 'Magic remove'}
            {magicPhase === 'downloading' &&
              (magicDownload > 0
                ? `Downloading ${Math.round(magicDownload * 100)}%`
                : 'Downloading…')}
            {magicPhase === 'preparing' && 'Preparing…'}
            {magicPhase === 'inferring' && 'Thinking…'}
            {magicPhase === 'painting' && 'Painting…'}
            {magicPhase === 'done' && 'Done'}
          </span>
        </button>
      </div>
      {textEraseResult && <div className="empty-state" style={{ marginBottom: 12 }}>{textEraseResult}</div>}
      {magicError && <div className="error-text">{magicError}</div>}

      <div className="panel-subtitle">
        <Crop size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Resize for platform
      </div>
      <div className="tile-row">
        {(() => {
          const isDefault = canvas.width === DEFAULT_CANVAS_WIDTH && canvas.height === DEFAULT_CANVAS_HEIGHT
          return (
            <button
              className={`tile tile-platform tile-reset ${isDefault ? 'active' : ''}`}
              onClick={() => resizeCanvas(canvas, DEFAULT_CANVAS_WIDTH, DEFAULT_CANVAS_HEIGHT)}
              title={`Back to ${DEFAULT_CANVAS_WIDTH} × ${DEFAULT_CANVAS_HEIGHT}`}
            >
              <span className="tile-label">Default</span>
              <span className="tile-hint">
                {DEFAULT_CANVAS_WIDTH} × {DEFAULT_CANVAS_HEIGHT}
              </span>
            </button>
          )
        })()}
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
