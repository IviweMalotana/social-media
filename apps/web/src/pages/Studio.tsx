import { ChangeEvent, useCallback, useEffect, useRef, useState } from 'react'
import { apiUpload, MediaAsset } from '../api'

type SizeKey = 'square' | 'story' | 'pin'
type TemplateKey = 'sale' | 'product' | 'minimal'

const SIZES: Record<SizeKey, { w: number; h: number; label: string; hint: string }> = {
  square: { w: 1080, h: 1080, label: 'Square 1:1', hint: 'Instagram & Facebook feed' },
  story: { w: 1080, h: 1920, label: 'Vertical 9:16', hint: 'TikTok, Reels & Stories' },
  pin: { w: 1000, h: 1500, label: 'Pin 2:3', hint: 'Pinterest' },
}

export interface Design {
  size: SizeKey
  template: TemplateKey
  headline: string
  subtext: string
  badge: string
  brand: string
  color1: string
  color2: string
  textColor: string
  image: HTMLImageElement | null
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const attempt = line ? `${line} ${word}` : word
    if (ctx.measureText(attempt).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = attempt
    }
  }
  if (line) lines.push(line)
  return lines
}

/**
 * Draws one frame of the design. `t` in [0,1] animates it (used for video);
 * t=1 is the finished still.
 */
export function drawDesign(ctx: CanvasRenderingContext2D, design: Design, t = 1) {
  const { w, h } = SIZES[design.size]
  const ease = 1 - Math.pow(1 - Math.min(t, 1), 3)

  // Background: brand gradient, or the product photo with a slow zoom.
  if (design.image) {
    const img = design.image
    const zoom = 1.06 - 0.06 * ease
    const scale = Math.max(w / img.width, h / img.height) * zoom
    const dw = img.width * scale
    const dh = img.height * scale
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh)
    // Scrim so text stays readable
    const scrim = ctx.createLinearGradient(0, h * 0.35, 0, h)
    scrim.addColorStop(0, 'rgba(0,0,0,0)')
    scrim.addColorStop(1, 'rgba(0,0,0,0.72)')
    ctx.fillStyle = scrim
    ctx.fillRect(0, 0, w, h)
  } else {
    const bg = ctx.createLinearGradient(0, 0, w, h)
    bg.addColorStop(0, design.color1)
    bg.addColorStop(1, design.color2)
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, w, h)
    if (design.template !== 'minimal') {
      // Soft accent circles for depth
      ctx.globalAlpha = 0.14
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(w * 0.85, h * 0.12, w * 0.3 * ease, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(w * 0.08, h * 0.9, w * 0.22 * ease, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
    }
  }

  const pad = w * 0.08
  const textAppear = Math.min(1, Math.max(0, (t - 0.15) / 0.5))
  const textEase = 1 - Math.pow(1 - textAppear, 3)
  const rise = (1 - textEase) * h * 0.04

  // Badge (e.g. "-20%") — pops in
  if (design.badge.trim() && design.template !== 'minimal') {
    const badgeT = Math.min(1, Math.max(0, (t - 0.45) / 0.35))
    const pop = badgeT < 1 ? 1.25 - 0.25 * (1 - Math.pow(1 - badgeT, 2)) : 1
    if (badgeT > 0) {
      const r = w * 0.115 * pop
      const bx = w - pad - r
      const by = pad + r
      ctx.fillStyle = '#ffd166'
      ctx.beginPath()
      ctx.arc(bx, by, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#1a1a2e'
      ctx.font = `800 ${r * 0.55}px system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(design.badge.trim().slice(0, 6), bx, by)
    }
  }

  // Headline + subtext anchored to the lower third
  ctx.globalAlpha = textEase
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  const headSize = w * (design.size === 'story' ? 0.085 : 0.095)
  ctx.font = `800 ${headSize}px system-ui, sans-serif`
  const headLines = wrapText(ctx, design.headline || 'Your headline', w - pad * 2)
  const subSize = w * 0.042
  const lineH = headSize * 1.12
  const blockH = headLines.length * lineH + (design.subtext ? subSize * 2.4 : subSize)
  let y = h - pad - blockH + lineH - rise * -1 + rise

  ctx.fillStyle = design.textColor
  for (const line of headLines.slice(0, 4)) {
    ctx.fillText(line, pad, y - rise)
    y += lineH
  }
  if (design.subtext) {
    ctx.font = `500 ${subSize}px system-ui, sans-serif`
    ctx.globalAlpha = textEase * 0.9
    for (const line of wrapText(ctx, design.subtext, w - pad * 2).slice(0, 2)) {
      ctx.fillText(line, pad, y - rise)
      y += subSize * 1.4
    }
  }

  // Brand strip
  if (design.brand.trim()) {
    ctx.globalAlpha = textEase
    ctx.font = `700 ${w * 0.032}px system-ui, sans-serif`
    ctx.fillStyle = design.textColor
    ctx.fillText(design.brand.trim(), pad, pad + w * 0.032)
  }
  ctx.globalAlpha = 1
}

export default function Studio() {
  const [design, setDesign] = useState<Design>({
    size: 'square',
    template: 'sale',
    headline: 'Winter Drop — 20% Off Everything',
    subtext: 'This weekend only. While stock lasts.',
    badge: '-20%',
    brand: '@yourbrand',
    color1: '#6c5ce7',
    color2: '#341f97',
    textColor: '#ffffff',
    image: null,
  })
  const [saving, setSaving] = useState(false)
  const [recording, setRecording] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const photoInput = useRef<HTMLInputElement>(null)

  const set = <K extends keyof Design>(key: K, value: Design[K]) =>
    setDesign((d) => ({ ...d, [key]: value }))

  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const { w, h } = SIZES[design.size]
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    drawDesign(ctx, design, 1)
  }, [design])

  useEffect(render, [render])

  function loadPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const img = new Image()
    img.onload = () => set('image', img)
    img.src = URL.createObjectURL(file)
  }

  async function saveImage() {
    const canvas = canvasRef.current
    if (!canvas) return
    setError('')
    setNotice('')
    setSaving(true)
    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/png'),
      )
      if (!blob) throw new Error('Could not render the image')
      const file = new File([blob], `studio-${design.size}-${design.template}.png`, {
        type: 'image/png',
      })
      await apiUpload<MediaAsset>('/api/media', file)
      setNotice('Saved to your media library ✓ — attach it in the Composer')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  function downloadImage() {
    const canvas = canvasRef.current
    if (!canvas) return
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = `studio-${design.size}.png`
    a.click()
  }

  async function makeVideo() {
    setError('')
    setNotice('')
    setRecording(true)
    try {
      const { w, h } = SIZES[design.size]
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')!

      const stream = canvas.captureStream(30)
      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm'
      const recorder = new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond: 6_000_000,
      })
      const chunks: Blob[] = []
      recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data)
      const done = new Promise<void>((resolve) => (recorder.onstop = () => resolve()))
      recorder.start()

      const durationMs = 6000
      const start = performance.now()
      await new Promise<void>((resolve) => {
        const frame = (now: number) => {
          const elapsed = now - start
          // Two passes of the animation: build up, hold, subtle re-emphasis
          const t = Math.min(elapsed / (durationMs * 0.6), 1)
          drawDesign(ctx, design, t)
          if (elapsed < durationMs) requestAnimationFrame(frame)
          else resolve()
        }
        requestAnimationFrame(frame)
      })
      recorder.stop()
      await done

      const blob = new Blob(chunks, { type: 'video/webm' })
      const file = new File([blob], `studio-${design.size}-promo.webm`, {
        type: 'video/webm',
      })
      await apiUpload<MediaAsset>('/api/media', file)
      setNotice('Promo video saved to your media library ✓ — attach it in the Composer')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Video generation failed')
    } finally {
      setRecording(false)
    }
  }

  const { w, h } = SIZES[design.size]

  return (
    <>
      <h1>Studio</h1>
      <p className="subtitle">
        Generate platform-sized promo images and videos — no design tools needed. Everything
        saves straight into your media library.
      </p>

      <div className="studio-layout">
        <div className="card">
          <label>Format</label>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {(Object.keys(SIZES) as SizeKey[]).map((key) => (
              <button
                key={key}
                type="button"
                className={`pill ${design.size === key ? 'on' : ''}`}
                onClick={() => set('size', key)}
                title={SIZES[key].hint}
              >
                {SIZES[key].label}
              </button>
            ))}
          </div>
          <p className="muted" style={{ marginTop: 6 }}>{SIZES[design.size].hint}</p>

          <label>Style</label>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {(['sale', 'product', 'minimal'] as TemplateKey[]).map((key) => (
              <button
                key={key}
                type="button"
                className={`pill ${design.template === key ? 'on' : ''}`}
                onClick={() => set('template', key)}
              >
                {key === 'sale' ? 'Sale' : key === 'product' ? 'Product' : 'Minimal'}
              </button>
            ))}
          </div>

          <label>Headline</label>
          <input value={design.headline} onChange={(e) => set('headline', e.target.value)} />

          <label>Subtext</label>
          <input value={design.subtext} onChange={(e) => set('subtext', e.target.value)} />

          <div className="row" style={{ gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label>Badge</label>
              <input
                value={design.badge}
                onChange={(e) => set('badge', e.target.value)}
                placeholder="-20%"
              />
            </div>
            <div style={{ flex: 1 }}>
              <label>Brand handle</label>
              <input value={design.brand} onChange={(e) => set('brand', e.target.value)} />
            </div>
          </div>

          <div className="row" style={{ gap: 10 }}>
            <div>
              <label>Color 1</label>
              <input
                type="color"
                value={design.color1}
                onChange={(e) => set('color1', e.target.value)}
              />
            </div>
            <div>
              <label>Color 2</label>
              <input
                type="color"
                value={design.color2}
                onChange={(e) => set('color2', e.target.value)}
              />
            </div>
            <div>
              <label>Text</label>
              <input
                type="color"
                value={design.textColor}
                onChange={(e) => set('textColor', e.target.value)}
              />
            </div>
          </div>

          <label>Product photo (optional background)</label>
          <div className="row">
            <button type="button" className="ghost" onClick={() => photoInput.current?.click()}>
              {design.image ? 'Change photo' : '+ Add photo'}
            </button>
            {design.image && (
              <button type="button" className="ghost" onClick={() => set('image', null)}>
                Remove
              </button>
            )}
            <input
              ref={photoInput}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={loadPhoto}
            />
          </div>

          <div className="row" style={{ marginTop: 22, flexWrap: 'wrap' }}>
            <button onClick={saveImage} disabled={saving}>
              {saving ? 'Saving…' : 'Save image to library'}
            </button>
            <button onClick={makeVideo} disabled={recording} className="ghost">
              {recording ? 'Rendering… (~6s)' : '🎬 Make video'}
            </button>
            <button onClick={downloadImage} className="ghost">
              Download PNG
            </button>
          </div>
          {notice && <div className="issue" style={{ background: 'rgba(76,195,138,.12)', color: '#8fd8b4' }}>{notice}</div>}
          {error && <div className="issue blocking">{error}</div>}
        </div>

        <div className="card studio-preview-wrap">
          <label>Preview — {w}×{h}px</label>
          <canvas
            ref={canvasRef}
            className="studio-canvas"
            style={{ aspectRatio: `${w} / ${h}` }}
          />
        </div>
      </div>
    </>
  )
}
