import { useMemo, useState, useEffect } from 'react'
import { useEditorStore } from '../store/editorStore'
import { setAdjustment, getAdjustment, toggleNamedFilter, hasNamedFilter } from '../lib/filters'
import { commitPendingChange } from '../lib/canvasActions'
import { PRESETS, applyPreset } from '../lib/presets'
import type { FabricImage, FabricObject } from 'fabric'

type TaggedObject = FabricObject & { id?: string; name?: string }

function AdjustSlider({
  label,
  min,
  max,
  step,
  value,
  onChange,
  onCommit,
}: {
  label: string
  min: number
  max: number
  step: number
  value: number
  onChange: (v: number) => void
  onCommit: () => void
}) {
  return (
    <label className="adjust-row">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onMouseUp={onCommit}
        onTouchEnd={onCommit}
      />
      <span className="adjust-value">{value.toFixed(2)}</span>
    </label>
  )
}

export function PropertiesPanel() {
  const canvas = useEditorStore((s) => s.canvas)
  const selectedId = useEditorStore((s) => s.selectedId)
  const bumpLayers = useEditorStore((s) => s.bumpLayers)
  const [, forceTick] = useState(0)

  const obj = useMemo<TaggedObject | undefined>(() => {
    if (!canvas || !selectedId) return undefined
    return (canvas.getObjects() as TaggedObject[]).find((o) => o.id === selectedId)
  }, [canvas, selectedId])

  useEffect(() => {
    forceTick((n) => n + 1)
  }, [selectedId])

  if (!canvas) return null

  if (!obj) {
    return (
      <div className="panel-section">
        <div className="panel-title">Properties</div>
        <div className="empty-state">Select a layer to edit its properties.</div>
      </div>
    )
  }

  const isImage = obj.type === 'image'

  const setOpacity = (v: number) => {
    obj.set('opacity', v)
    canvas.requestRenderAll()
  }

  const setFill = (color: string) => {
    obj.set('fill', color)
    canvas.requestRenderAll()
    commitPendingChange(canvas)
    forceTick((n) => n + 1)
  }

  const img = isImage ? (obj as unknown as FabricImage) : undefined

  return (
    <div className="panel-section">
      <div className="panel-title">Properties</div>

      <label className="adjust-row">
        <span>Opacity</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={obj.opacity ?? 1}
          onChange={(e) => setOpacity(Number(e.target.value))}
          onMouseUp={() => commitPendingChange(canvas)}
          onTouchEnd={() => commitPendingChange(canvas)}
        />
        <span className="adjust-value">{(obj.opacity ?? 1).toFixed(2)}</span>
      </label>

      <div className="panel-subtitle">Skew (mockup placement)</div>
      <label className="adjust-row">
        <span>Skew X</span>
        <input
          type="range"
          min={-60}
          max={60}
          step={1}
          value={obj.skewX ?? 0}
          onChange={(e) => {
            obj.set('skewX', Number(e.target.value))
            canvas.requestRenderAll()
          }}
          onMouseUp={() => commitPendingChange(canvas)}
          onTouchEnd={() => commitPendingChange(canvas)}
        />
        <span className="adjust-value">{(obj.skewX ?? 0).toFixed(0)}</span>
      </label>
      <label className="adjust-row">
        <span>Skew Y</span>
        <input
          type="range"
          min={-60}
          max={60}
          step={1}
          value={obj.skewY ?? 0}
          onChange={(e) => {
            obj.set('skewY', Number(e.target.value))
            canvas.requestRenderAll()
          }}
          onMouseUp={() => commitPendingChange(canvas)}
          onTouchEnd={() => commitPendingChange(canvas)}
        />
        <span className="adjust-value">{(obj.skewY ?? 0).toFixed(0)}</span>
      </label>

      {'fill' in obj && !isImage && (
        <label className="adjust-row">
          <span>Fill</span>
          <input
            type="color"
            value={typeof obj.fill === 'string' ? obj.fill : '#000000'}
            onChange={(e) => setFill(e.target.value)}
          />
        </label>
      )}

      {isImage && img && (
        <>
          <div className="panel-subtitle">Beautify presets</div>
          <div className="chip-row">
            {PRESETS.map((preset) => (
              <button
                key={preset.key}
                className="chip"
                onClick={() => {
                  applyPreset(img, preset)
                  commitPendingChange(canvas)
                  forceTick((n) => n + 1)
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="panel-subtitle">Adjust</div>
          <AdjustSlider
            label="Brightness"
            min={-1}
            max={1}
            step={0.01}
            value={getAdjustment(img, 'brightness')}
            onChange={(v) => setAdjustment(img, 'brightness', v)}
            onCommit={() => commitPendingChange(canvas)}
          />
          <AdjustSlider
            label="Contrast"
            min={-1}
            max={1}
            step={0.01}
            value={getAdjustment(img, 'contrast')}
            onChange={(v) => setAdjustment(img, 'contrast', v)}
            onCommit={() => commitPendingChange(canvas)}
          />
          <AdjustSlider
            label="Saturation"
            min={-1}
            max={1}
            step={0.01}
            value={getAdjustment(img, 'saturation')}
            onChange={(v) => setAdjustment(img, 'saturation', v)}
            onCommit={() => commitPendingChange(canvas)}
          />
          <AdjustSlider
            label="Blur"
            min={0}
            max={1}
            step={0.01}
            value={getAdjustment(img, 'blur')}
            onChange={(v) => setAdjustment(img, 'blur', v)}
            onCommit={() => commitPendingChange(canvas)}
          />
          <AdjustSlider
            label="Hue"
            min={-1}
            max={1}
            step={0.01}
            value={getAdjustment(img, 'hue')}
            onChange={(v) => setAdjustment(img, 'hue', v)}
            onCommit={() => commitPendingChange(canvas)}
          />

          <div className="panel-subtitle">Effects</div>
          <div className="chip-row">
            <button
              className={`chip ${hasNamedFilter(img, 'Grayscale') ? 'active' : ''}`}
              onClick={() => {
                toggleNamedFilter(img, 'Grayscale', !hasNamedFilter(img, 'Grayscale'))
                commitPendingChange(canvas)
                forceTick((n) => n + 1)
              }}
            >
              Grayscale
            </button>
            <button
              className={`chip ${hasNamedFilter(img, 'Sepia') ? 'active' : ''}`}
              onClick={() => {
                toggleNamedFilter(img, 'Sepia', !hasNamedFilter(img, 'Sepia'))
                commitPendingChange(canvas)
                forceTick((n) => n + 1)
              }}
            >
              Sepia
            </button>
            <button
              className={`chip ${hasNamedFilter(img, 'Invert') ? 'active' : ''}`}
              onClick={() => {
                toggleNamedFilter(img, 'Invert', !hasNamedFilter(img, 'Invert'))
                commitPendingChange(canvas)
                forceTick((n) => n + 1)
              }}
            >
              Invert
            </button>
          </div>
        </>
      )}

      <button
        className="btn btn-danger-outline"
        onClick={() => {
          canvas.remove(obj)
          canvas.discardActiveObject()
          canvas.requestRenderAll()
          commitPendingChange(canvas)
          bumpLayers()
        }}
      >
        Delete layer
      </button>
    </div>
  )
}
