import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  api,
  apiUpload,
  ConnectedAccount,
  DraftIssue,
  MediaAsset,
  Platform,
  PlatformSpec,
} from '../api'

type ValidationMap = Record<string, { issues: DraftIssue[]; isValid: boolean }>

export default function Composer() {
  const [specs, setSpecs] = useState<PlatformSpec[]>([])
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([])
  const [library, setLibrary] = useState<MediaAsset[]>([])
  const [caption, setCaption] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [selected, setSelected] = useState<Set<Platform>>(new Set())
  const [attached, setAttached] = useState<Set<string>>(new Set())
  const [validation, setValidation] = useState<ValidationMap>({})
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const [aiTopic, setAiTopic] = useState('')
  const [aiTone, setAiTone] = useState('friendly and confident')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState('')
  const [aiVariants, setAiVariants] = useState<
    { platform: string; caption: string; hashtags: string[] }[]
  >([])

  useEffect(() => {
    api<PlatformSpec[]>('/api/platforms').then(setSpecs).catch(() => {})
    api<ConnectedAccount[]>('/api/connections').then(setAccounts).catch(() => {})
    api<MediaAsset[]>('/api/media').then(setLibrary).catch(() => {})
  }, [])

  const specByPlatform = useMemo(
    () => Object.fromEntries(specs.map((s) => [s.platform, s])),
    [specs],
  )

  function toggle(platform: Platform) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(platform)) next.delete(platform)
      else next.add(platform)
      return next
    })
  }

  function toggleAsset(id: string) {
    setAttached((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setError('')
    setUploading(true)
    try {
      const asset = await apiUpload<MediaAsset>('/api/media', file)
      setLibrary((prev) => [asset, ...prev])
      setAttached((prev) => new Set(prev).add(asset.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  useEffect(() => {
    if (selected.size === 0) {
      setValidation({})
      return
    }
    const handle = setTimeout(() => {
      api<ValidationMap>('/api/posts/validate', {
        method: 'POST',
        body: JSON.stringify({
          caption,
          mediaAssetIds: [...attached],
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
          platforms: [...selected],
        }),
      })
        .then(setValidation)
        .catch(() => {})
    }, 400)
    return () => clearTimeout(handle)
  }, [caption, scheduledAt, selected, attached])

  async function schedule() {
    setError('')
    setMessage('')
    const targets = accounts
      .filter((a) => selected.has(a.platform))
      .map((a) => ({ connectedAccountId: a.id, captionOverride: null }))
    if (targets.length === 0) {
      setError(
        'None of the selected platforms have a connected account yet — connect one first.',
      )
      return
    }
    setBusy(true)
    try {
      await api('/api/posts', {
        method: 'POST',
        body: JSON.stringify({
          caption,
          mediaAssetIds: [...attached],
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
          targets,
        }),
      })
      setMessage(scheduledAt ? 'Post scheduled ✓' : 'Draft saved ✓')
      setCaption('')
      setScheduledAt('')
      setSelected(new Set())
      setAttached(new Set())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the post')
    } finally {
      setBusy(false)
    }
  }

  async function generateCaptions() {
    setAiError('')
    setAiVariants([])
    if (!aiTopic.trim()) {
      setAiError('Tell the generator what the post is about.')
      return
    }
    if (selected.size === 0) {
      setAiError('Pick at least one platform above first.')
      return
    }
    setAiBusy(true)
    try {
      const result = await api<{
        variants: { platform: string; caption: string; hashtags: string[] }[]
      }>('/api/content/generate', {
        method: 'POST',
        body: JSON.stringify({
          topic: aiTopic,
          tone: aiTone,
          platforms: [...selected],
          variantsPerPlatform: 2,
        }),
      })
      setAiVariants(result.variants)
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setAiBusy(false)
    }
  }

  function applyVariant(variant: { caption: string; hashtags: string[] }) {
    const tags = variant.hashtags.map((h) => `#${h}`).join(' ')
    setCaption(tags ? `${variant.caption}\n\n${tags}` : variant.caption)
  }

  return (
    <>
      <h1>Composer</h1>
      <p className="subtitle">Write once. We validate against every platform before it counts.</p>

      <div className="card">
        <label>Platforms</label>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {specs.map((spec) => (
            <button
              key={spec.platform}
              type="button"
              className={`pill ${selected.has(spec.platform) ? 'on' : ''}`}
              onClick={() => toggle(spec.platform)}
            >
              {spec.name}
            </button>
          ))}
        </div>

        <label>✨ Generate with AI (optional)</label>
        <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
          <input
            style={{ flex: '1 1 240px' }}
            value={aiTopic}
            onChange={(e) => setAiTopic(e.target.value)}
            placeholder="What's the post about? e.g. Winter jacket sale, 20% off this weekend"
          />
          <select
            style={{ width: 'auto' }}
            value={aiTone}
            onChange={(e) => setAiTone(e.target.value)}
          >
            <option value="friendly and confident">Friendly</option>
            <option value="playful and fun">Playful</option>
            <option value="professional and polished">Professional</option>
            <option value="urgent, creating FOMO">Urgent</option>
            <option value="premium and luxurious">Luxury</option>
          </select>
          <button type="button" className="ghost" onClick={generateCaptions} disabled={aiBusy}>
            {aiBusy ? 'Writing…' : 'Generate'}
          </button>
        </div>
        {aiError && <div className="issue warning">{aiError}</div>}
        {aiVariants.length > 0 && (
          <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
            {aiVariants.map((variant, i) => (
              <button
                key={i}
                type="button"
                className="variant"
                onClick={() => applyVariant(variant)}
                title="Click to use this caption"
              >
                <span className="count">{variant.platform}</span>
                <div>{variant.caption}</div>
                {variant.hashtags.length > 0 && (
                  <div className="muted">{variant.hashtags.map((h) => `#${h}`).join(' ')}</div>
                )}
              </button>
            ))}
          </div>
        )}

        <label>Caption</label>
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="What are we posting?"
        />
        <div className="row" style={{ flexWrap: 'wrap', marginTop: 6 }}>
          {[...selected].map((platform) => {
            const spec = specByPlatform[platform]
            if (!spec) return null
            const over = caption.length > spec.maxCaptionLength
            return (
              <span key={platform} className={`count ${over ? 'over' : ''}`}>
                {spec.name}: {caption.length.toLocaleString()}/
                {spec.maxCaptionLength.toLocaleString()}
              </span>
            )
          })}
        </div>

        <label>Media</label>
        <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
          <button
            type="button"
            className="ghost"
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
          >
            {uploading ? 'Uploading…' : '+ Upload'}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime"
            style={{ display: 'none' }}
            onChange={upload}
          />
          {library.map((asset) => (
            <button
              key={asset.id}
              type="button"
              className={`media-thumb ${attached.has(asset.id) ? 'on' : ''}`}
              onClick={() => toggleAsset(asset.id)}
              title={asset.fileName}
            >
              {asset.contentType.startsWith('image/') ? (
                <img src={asset.url} alt={asset.fileName} />
              ) : (
                <span className="muted">▶ {asset.fileName.slice(0, 12)}</span>
              )}
            </button>
          ))}
        </div>

        <label>Schedule for (leave empty to save as draft)</label>
        <input
          type="datetime-local"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
        />

        {Object.entries(validation).flatMap(([platform, result]) =>
          result.issues.map((issue) => (
            <div
              key={`${platform}-${issue.code}`}
              className={`issue ${issue.isBlocking ? 'blocking' : 'warning'}`}
            >
              {platform}: {issue.message}
            </div>
          )),
        )}

        <div className="row" style={{ marginTop: 20 }}>
          <button onClick={schedule} disabled={busy || selected.size === 0 || !caption}>
            {scheduledAt ? 'Schedule post' : 'Save draft'}
          </button>
          {message && <span className="status ok">{message}</span>}
          {error && <span className="error">{error}</span>}
        </div>
      </div>
    </>
  )
}
