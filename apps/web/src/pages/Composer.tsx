import { useEffect, useMemo, useState } from 'react'
import { api, ConnectedAccount, DraftIssue, Platform, PlatformSpec } from '../api'

type ValidationMap = Record<string, { issues: DraftIssue[]; isValid: boolean }>

export default function Composer() {
  const [specs, setSpecs] = useState<PlatformSpec[]>([])
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([])
  const [caption, setCaption] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [selected, setSelected] = useState<Set<Platform>>(new Set())
  const [validation, setValidation] = useState<ValidationMap>({})
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api<PlatformSpec[]>('/api/platforms').then(setSpecs).catch(() => {})
    api<ConnectedAccount[]>('/api/connections').then(setAccounts).catch(() => {})
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
          mediaAssetIds: [],
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
          platforms: [...selected],
        }),
      })
        .then(setValidation)
        .catch(() => {})
    }, 400)
    return () => clearTimeout(handle)
  }, [caption, scheduledAt, selected])

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
          mediaAssetIds: [],
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
          targets,
        }),
      })
      setMessage(scheduledAt ? 'Post scheduled ✓' : 'Draft saved ✓')
      setCaption('')
      setScheduledAt('')
      setSelected(new Set())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the post')
    } finally {
      setBusy(false)
    }
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
        <p className="muted" style={{ marginTop: 14 }}>
          Media upload lands with the media library — captions and scheduling work today.
        </p>
      </div>
    </>
  )
}
