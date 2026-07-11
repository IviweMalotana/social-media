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

/** How much caption each platform shows before folding it behind "more". */
const FOLD: Partial<Record<Platform, number>> = {
  Instagram: 125,
  Facebook: 477,
  TikTok: 100,
}

const PLATFORM_HINTS: Partial<Record<Platform, string>> = {
  TikTok: 'Needs a video. Posts stay private (only you see them) until the app passes TikTok’s audit.',
  Instagram: 'Needs at least one image. First ~125 characters show before “more” — put the hook up front.',
  Pinterest: 'Pins are searchable — write keyword-rich copy. The destination link is where clicks go.',
  WhatsApp: 'Broadcast to opted-in contacts (Phase 3). Personal tone, one clear call to action.',
}

function PlatformPreview({
  platform,
  caption,
  mediaUrl,
  title,
}: {
  platform: Platform
  caption: string
  mediaUrl: string | null
  title?: string
}) {
  const fold = FOLD[platform]
  const shown = fold && caption.length > fold ? caption.slice(0, fold) : caption
  const folded = fold !== undefined && caption.length > fold

  if (platform === 'TikTok') {
    return (
      <div className="preview preview-tiktok">
        <div className="preview-tiktok-video">{mediaUrl ? '▶ video' : 'no video yet'}</div>
        <div className="preview-tiktok-caption">
          <strong>@yourbrand</strong> {shown}
          {folded && <span className="preview-more"> more</span>}
        </div>
      </div>
    )
  }
  if (platform === 'Pinterest') {
    return (
      <div className="preview preview-pinterest">
        {mediaUrl ? <img src={mediaUrl} alt="" /> : <div className="preview-img-empty">image</div>}
        <div className="preview-pin-title">{title || caption.split('\n')[0] || 'Pin title'}</div>
      </div>
    )
  }
  if (platform === 'WhatsApp') {
    return (
      <div className="preview preview-whatsapp">
        <div className="preview-bubble">
          {mediaUrl && <img src={mediaUrl} alt="" />}
          <div>{caption || 'Your message…'}</div>
        </div>
      </div>
    )
  }
  // Facebook / Instagram feed-style card
  return (
    <div className="preview preview-feed">
      <div className="preview-head">
        <span className="preview-avatar" />
        <strong>yourbrand</strong>
      </div>
      {platform === 'Facebook' && (
        <div className="preview-caption">
          {shown}
          {folded && <span className="preview-more">… See more</span>}
        </div>
      )}
      {mediaUrl ? <img src={mediaUrl} alt="" /> : <div className="preview-img-empty">image</div>}
      {platform === 'Instagram' && (
        <div className="preview-caption">
          <strong>yourbrand</strong> {shown}
          {folded && <span className="preview-more">… more</span>}
        </div>
      )}
    </div>
  )
}

export default function Composer() {
  const [specs, setSpecs] = useState<PlatformSpec[]>([])
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([])
  const [library, setLibrary] = useState<MediaAsset[]>([])
  const [caption, setCaption] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [selected, setSelected] = useState<Set<Platform>>(new Set())
  const [attached, setAttached] = useState<Set<string>>(new Set())
  const [overrides, setOverrides] = useState<Partial<Record<Platform, string>>>({})
  const [customize, setCustomize] = useState<Set<Platform>>(new Set())
  const [pinTitle, setPinTitle] = useState('')
  const [pinLink, setPinLink] = useState('')
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

  const firstImageUrl = useMemo(() => {
    const asset = library.find(
      (a) => attached.has(a.id) && a.contentType.startsWith('image/'),
    )
    return asset?.url ?? null
  }, [library, attached])

  const effectiveCaption = (platform: Platform) =>
    overrides[platform]?.trim() ? overrides[platform]! : caption

  function toggle(platform: Platform) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(platform)) next.delete(platform)
      else next.add(platform)
      return next
    })
  }

  function toggleCustomize(platform: Platform) {
    setCustomize((prev) => {
      const next = new Set(prev)
      if (next.has(platform)) {
        next.delete(platform)
        setOverrides((o) => ({ ...o, [platform]: '' }))
      } else {
        next.add(platform)
        setOverrides((o) => ({ ...o, [platform]: o[platform] || caption }))
      }
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
      const captionOverrides: Record<string, string> = {}
      for (const p of selected) {
        if (overrides[p]?.trim()) captionOverrides[p] = overrides[p]!
      }
      api<ValidationMap>('/api/posts/validate', {
        method: 'POST',
        body: JSON.stringify({
          caption,
          mediaAssetIds: [...attached],
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
          platforms: [...selected],
          captionOverrides,
        }),
      })
        .then(setValidation)
        .catch(() => {})
    }, 400)
    return () => clearTimeout(handle)
  }, [caption, scheduledAt, selected, attached, overrides])

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

  function applyVariant(variant: { platform: string; caption: string; hashtags: string[] }) {
    const tags = variant.hashtags.map((h) => `#${h}`).join(' ')
    const text = tags ? `${variant.caption}\n\n${tags}` : variant.caption
    const platform = [...selected].find((p) => p === variant.platform)
    if (platform) {
      // Tailor the matching platform rather than clobbering the shared caption.
      setCustomize((prev) => new Set(prev).add(platform))
      setOverrides((o) => ({ ...o, [platform]: text }))
      if (!caption) setCaption(text)
    } else {
      setCaption(text)
    }
  }

  async function schedule() {
    setError('')
    setMessage('')
    const targets = accounts
      .filter((a) => selected.has(a.platform))
      .map((a) => ({
        connectedAccountId: a.id,
        captionOverride: overrides[a.platform]?.trim() || null,
        options:
          a.platform === 'Pinterest' && (pinTitle.trim() || pinLink.trim())
            ? {
                ...(pinTitle.trim() ? { title: pinTitle.trim() } : {}),
                ...(pinLink.trim() ? { link: pinLink.trim() } : {}),
              }
            : null,
      }))
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
      setOverrides({})
      setCustomize(new Set())
      setPinTitle('')
      setPinLink('')
      setAiVariants([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the post')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <h1>Composer</h1>
      <p className="subtitle">
        Write once, then tailor per platform — with a live preview of how each post lands.
      </p>

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
                title={`Click to use for ${variant.platform}`}
              >
                <span className="count">{variant.platform} — click to apply</span>
                <div>{variant.caption}</div>
                {variant.hashtags.length > 0 && (
                  <div className="muted">{variant.hashtags.map((h) => `#${h}`).join(' ')}</div>
                )}
              </button>
            ))}
          </div>
        )}

        <label>Base caption (used everywhere you don't tailor)</label>
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="What are we posting?"
        />

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
      </div>

      {[...selected].map((platform) => {
        const spec = specByPlatform[platform]
        if (!spec) return null
        const text = effectiveCaption(platform)
        const over = text.length > spec.maxCaptionLength
        const issues = validation[platform]?.issues ?? []
        return (
          <div className="card platform-card" key={platform}>
            <div className="row between">
              <h2 style={{ margin: 0 }}>{spec.name}</h2>
              <span className={`count ${over ? 'over' : ''}`}>
                {text.length.toLocaleString()}/{spec.maxCaptionLength.toLocaleString()}
              </span>
            </div>
            {PLATFORM_HINTS[platform] && (
              <p className="muted" style={{ marginTop: 6 }}>
                {PLATFORM_HINTS[platform]}
              </p>
            )}

            <div className="platform-card-body">
              <div>
                <label className="row" style={{ cursor: 'pointer', margin: '10px 0 6px' }}>
                  <input
                    type="checkbox"
                    style={{ width: 'auto' }}
                    checked={customize.has(platform)}
                    onChange={() => toggleCustomize(platform)}
                  />
                  Tailor caption for {spec.name}
                </label>
                {customize.has(platform) && (
                  <textarea
                    value={overrides[platform] ?? ''}
                    onChange={(e) =>
                      setOverrides((o) => ({ ...o, [platform]: e.target.value }))
                    }
                    placeholder={`${spec.name}-specific caption`}
                  />
                )}

                {platform === 'Pinterest' && (
                  <>
                    <label>Pin title</label>
                    <input
                      value={pinTitle}
                      onChange={(e) => setPinTitle(e.target.value)}
                      maxLength={100}
                      placeholder="e.g. Winter Jackets — 20% Off"
                    />
                    <label>Destination link (where a click goes)</label>
                    <input
                      value={pinLink}
                      onChange={(e) => setPinLink(e.target.value)}
                      placeholder="https://your-shop.example/product"
                    />
                  </>
                )}

                {issues.map((issue) => (
                  <div
                    key={issue.code}
                    className={`issue ${issue.isBlocking ? 'blocking' : 'warning'}`}
                  >
                    {issue.message}
                  </div>
                ))}
              </div>

              <PlatformPreview
                platform={platform}
                caption={text}
                mediaUrl={firstImageUrl}
                title={pinTitle}
              />
            </div>
          </div>
        )
      })}

      <div className="card">
        <label>Schedule for (leave empty to save as draft)</label>
        <input
          type="datetime-local"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
        />
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
