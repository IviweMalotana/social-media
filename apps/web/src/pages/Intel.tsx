import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'

interface Vertical {
  id: string
  name: string
  category: string
  notes: string
  cadence: string
  pinned: boolean
  lastResearchedAt: string | null
  researchStatus: string
  lastError: string | null
  briefCount: number
  latestBriefId: string | null
}

interface BriefDetail {
  id: string
  briefJson: string
  sourcesJson: string
  model: string
  createdAt: string
}

interface SourcedItem {
  source?: string | null
  [key: string]: unknown
}

interface Brief {
  identity?: { selfLabels?: string[]; avoidLabels?: string[]; voiceNotes?: string }
  struggles?: SourcedItem[]
  desires?: SourcedItem[]
  objections?: SourcedItem[]
  contentAngles?: SourcedItem[]
  adPatterns?: SourcedItem[]
  poppingBrands?: SourcedItem[]
  bdpPlay?: { formats?: string[]; hook?: string; educationAngle?: string; outreachOpener?: string }
  sources?: { title?: string; url?: string }[]
}

function ago(iso: string | null): string {
  if (!iso) return 'never'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days} days ago`
}

/** Freshness signal: green under 8 days, amber under 15, red beyond. */
function freshness(iso: string | null): string {
  if (!iso) return 'stale'
  const days = (Date.now() - new Date(iso).getTime()) / 86400000
  return days < 8 ? 'fresh' : days < 15 ? 'aging' : 'stale'
}

export default function Intel() {
  const [verticals, setVerticals] = useState<Vertical[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [brief, setBrief] = useState<BriefDetail | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const pollTimer = useRef<number>(undefined)

  const selected = verticals.find((v) => v.id === selectedId) ?? null
  const anyRunning = verticals.some(
    (v) => v.researchStatus === 'running' || v.researchStatus === 'queued',
  )

  const load = useCallback(async () => {
    try {
      const list = await api<Vertical[]>('/api/intel')
      setVerticals(list)
      return list
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
      return []
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Poll while any research is running so status + new briefs appear live.
  useEffect(() => {
    if (!anyRunning) return
    pollTimer.current = window.setInterval(load, 5000)
    return () => window.clearInterval(pollTimer.current)
  }, [anyRunning, load])

  // Load the selected vertical's latest brief.
  useEffect(() => {
    setBrief(null)
    if (!selectedId) return
    api<{ latestBrief: BriefDetail | null }>(`/api/intel/${selectedId}`)
      .then((r) => setBrief(r.latestBrief))
      .catch(() => {})
  }, [selectedId, verticals])

  async function run(fn: () => Promise<void>) {
    setError('')
    setNotice('')
    try {
      await fn()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
    }
  }

  function parseBrief(): Brief | null {
    if (!brief) return null
    try {
      return JSON.parse(brief.briefJson) as Brief
    } catch {
      return null
    }
  }

  const parsed = parseBrief()

  function itemList(
    title: string,
    items: SourcedItem[] | undefined,
    fields: [string, string][],
  ) {
    if (!items?.length) return null
    return (
      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 15 }}>{title}</h2>
        {items.map((item, i) => (
          <div
            key={i}
            style={{
              padding: '10px 0',
              borderTop: i > 0 ? '1px solid var(--border, #e4e0dc)' : 'none',
            }}
          >
            {fields.map(([key, label]) => {
              const value = item[key]
              if (typeof value !== 'string' || !value) return null
              return (
                <p key={key} style={{ margin: '2px 0' }}>
                  {label && (
                    <strong style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {label}:{' '}
                    </strong>
                  )}
                  {value}
                </p>
              )
            })}
            {typeof item.source === 'string' && item.source && (
              <a
                href={item.source}
                target="_blank"
                rel="noreferrer"
                className="muted"
                style={{ fontSize: 12, wordBreak: 'break-all' }}
              >
                {item.source}
              </a>
            )}
            {!item.source && (
              <span className="muted" style={{ fontSize: 12 }}>
                no source — treat as hypothesis
              </span>
            )}
          </div>
        ))}
      </div>
    )
  }

  return (
    <>
      <h1>Buyer Intel</h1>
      <p className="subtitle">
        Who each buyer type is, what they struggle with, and how to talk to them —
        researched from real web sources on a schedule (weekly by default, daily for
        pinned verticals). Every claim carries its source; unsourced lines are marked
        as hypotheses. Feed the good angles into Outreach, Emails, and social content.
      </p>

      {notice && <p className="status ok">{notice}</p>}
      {error && <p className="error">{error}</p>}

      <div className="row" style={{ alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        {/* Vertical list */}
        <div style={{ flex: '0 1 340px', minWidth: 280 }}>
          <div className="row" style={{ marginBottom: 8, gap: 6 }}>
            <button onClick={() => setAdding((v) => !v)}>
              {adding ? 'Cancel' : '+ Vertical'}
            </button>
            {verticals.length === 0 && (
              <button
                className="ghost"
                onClick={() =>
                  run(async () => {
                    const r = await api<{ added: number }>('/api/intel/seed', { method: 'POST' })
                    setNotice(`Seeded ${r.added} starter verticals from the buyer map.`)
                    load()
                  })
                }
              >
                Seed from buyer map
              </button>
            )}
          </div>

          {adding && (
            <div className="card">
              <label style={{ marginTop: 0 }}>Vertical (how we describe the buyer)</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Founders starting a perfume brand"
              />
              <label>Category</label>
              <input
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="Fragrance"
              />
              <label>Notes (trusted facts fed into research)</label>
              <textarea
                style={{ minHeight: 60 }}
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="Formats to lead with, margin plays, known objections…"
              />
              <button
                style={{ marginTop: 8 }}
                disabled={!newName.trim()}
                onClick={() =>
                  run(async () => {
                    await api('/api/intel', {
                      method: 'POST',
                      body: JSON.stringify({
                        name: newName,
                        category: newCategory,
                        notes: newNotes,
                      }),
                    })
                    setNewName('')
                    setNewCategory('')
                    setNewNotes('')
                    setAdding(false)
                    load()
                  })
                }
              >
                Add
              </button>
            </div>
          )}

          {verticals.map((v) => {
            const f = freshness(v.lastResearchedAt)
            const running = v.researchStatus === 'running' || v.researchStatus === 'queued'
            return (
              <div
                key={v.id}
                className="card"
                onClick={() => setSelectedId(v.id)}
                style={{
                  cursor: 'pointer',
                  padding: 12,
                  borderLeft:
                    selectedId === v.id
                      ? '3px solid var(--accent, #e0beb1)'
                      : '3px solid transparent',
                }}
              >
                <div className="row between" style={{ alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }} className="muted">
                      {v.category || 'Uncategorised'} {v.pinned && '· pinned'}
                    </div>
                    <strong style={{ fontSize: 14 }}>{v.name}</strong>
                  </div>
                  <span
                    title={running ? 'researching…' : `last researched ${ago(v.lastResearchedAt)}`}
                    style={{
                      flexShrink: 0,
                      width: 10,
                      height: 10,
                      marginTop: 4,
                      borderRadius: '50%',
                      background: running
                        ? 'var(--accent, #e0beb1)'
                        : f === 'fresh'
                          ? '#7bb274'
                          : f === 'aging'
                            ? '#e0b04b'
                            : '#c96f5e',
                      animation: running ? 'pulse 1.2s infinite' : undefined,
                    }}
                  />
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  {running
                    ? v.researchStatus === 'queued' ? 'queued…' : 'researching…'
                    : `${v.briefCount} brief${v.briefCount === 1 ? '' : 's'} · ${ago(v.lastResearchedAt)}`}
                  {v.researchStatus === 'failed' && (
                    <span className="error"> · last pull failed</span>
                  )}
                </div>
              </div>
            )
          })}

          {verticals.length === 0 && !adding && (
            <p className="muted">
              No verticals yet. Seed the starter set from the buyer map, or add one.
            </p>
          )}
        </div>

        {/* Brief reader */}
        <div style={{ flex: '1 1 480px', minWidth: 340 }}>
          {!selected && (
            <p className="muted">Pick a vertical to read its latest brief.</p>
          )}

          {selected && (
            <>
              <div className="card">
                <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <h2 style={{ margin: 0 }}>{selected.name}</h2>
                    <p className="muted" style={{ margin: '4px 0 0' }}>
                      {selected.category}
                      {brief && ` · brief from ${new Date(brief.createdAt).toLocaleDateString()}`}
                    </p>
                  </div>
                  <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                    <select
                      style={{ width: 'auto' }}
                      value={selected.cadence}
                      onChange={(e) =>
                        run(async () => {
                          await api(`/api/intel/${selected.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ cadence: e.target.value }),
                          })
                          load()
                        })
                      }
                    >
                      <option value="weekly">Weekly refresh</option>
                      <option value="daily">Daily refresh</option>
                      <option value="manual">Manual only</option>
                    </select>
                    <button
                      className="ghost"
                      onClick={() =>
                        run(async () => {
                          await api(`/api/intel/${selected.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ pinned: !selected.pinned }),
                          })
                          load()
                        })
                      }
                    >
                      {selected.pinned ? 'Unpin' : 'Pin'}
                    </button>
                    <button
                      disabled={
                        selected.researchStatus === 'running' ||
                        selected.researchStatus === 'queued'
                      }
                      onClick={() =>
                        run(async () => {
                          await api(`/api/intel/${selected.id}/research`, { method: 'POST' })
                          setNotice('Research queued — takes a few minutes. This page updates itself.')
                          load()
                        })
                      }
                    >
                      {selected.researchStatus === 'running' || selected.researchStatus === 'queued'
                        ? 'Researching…'
                        : 'Refresh now'}
                    </button>
                  </div>
                </div>
                {selected.lastError && (
                  <p className="error" style={{ marginTop: 8 }}>
                    Last pull failed: {selected.lastError}
                  </p>
                )}
                {selected.notes && (
                  <p className="muted" style={{ marginTop: 8 }}>
                    <strong>Owner notes:</strong> {selected.notes}
                  </p>
                )}
              </div>

              {!brief && selected.briefCount === 0 && (
                <p className="muted">
                  No brief yet — hit "Refresh now" to run the first research pull.
                </p>
              )}

              {parsed?.identity && (
                <div className="card">
                  <h2 style={{ marginTop: 0, fontSize: 15 }}>How they talk about themselves</h2>
                  {parsed.identity.selfLabels?.length ? (
                    <p>
                      <strong>They say:</strong> {parsed.identity.selfLabels.join(' · ')}
                    </p>
                  ) : null}
                  {parsed.identity.avoidLabels?.length ? (
                    <p>
                      <strong>Never call them:</strong> {parsed.identity.avoidLabels.join(' · ')}
                    </p>
                  ) : null}
                  {parsed.identity.voiceNotes && <p>{parsed.identity.voiceNotes}</p>}
                </div>
              )}

              {itemList('What they struggle with', parsed?.struggles, [
                ['pain', ''],
                ['detail', ''],
              ])}
              {itemList('What they want', parsed?.desires, [
                ['want', ''],
                ['detail', ''],
              ])}
              {itemList('Objections and honest answers', parsed?.objections, [
                ['objection', 'Objection'],
                ['answer', 'Answer'],
              ])}
              {itemList('Content angles that work', parsed?.contentAngles, [
                ['angle', 'Angle'],
                ['why', 'Why'],
                ['example', 'Hook'],
              ])}
              {itemList('Ad patterns in this space', parsed?.adPatterns, [
                ['pattern', 'Pattern'],
                ['detail', ''],
              ])}
              {itemList('Brands popping right now', parsed?.poppingBrands, [
                ['brand', 'Brand'],
                ['whatTheyDo', 'What they do'],
                ['lessonForCustomers', 'Lesson for our customers'],
              ])}

              {parsed?.bdpPlay && (
                <div className="card" style={{ borderLeft: '3px solid var(--accent, #e0beb1)' }}>
                  <h2 style={{ marginTop: 0, fontSize: 15 }}>The BDP play</h2>
                  {parsed.bdpPlay.formats?.length ? (
                    <p>
                      <strong>Lead with:</strong> {parsed.bdpPlay.formats.join(' · ')}
                    </p>
                  ) : null}
                  {parsed.bdpPlay.hook && (
                    <p>
                      <strong>Hook:</strong> {parsed.bdpPlay.hook}
                    </p>
                  )}
                  {parsed.bdpPlay.educationAngle && (
                    <p>
                      <strong>Education angle:</strong> {parsed.bdpPlay.educationAngle}
                    </p>
                  )}
                  {parsed.bdpPlay.outreachOpener && (
                    <p>
                      <strong>Cold-email opener:</strong> "{parsed.bdpPlay.outreachOpener}"
                    </p>
                  )}
                </div>
              )}

              {parsed?.sources?.length ? (
                <div className="card">
                  <h2 style={{ marginTop: 0, fontSize: 15 }}>Sources ({parsed.sources.length})</h2>
                  {parsed.sources.map((s, i) => (
                    <p key={i} style={{ margin: '4px 0', fontSize: 13 }}>
                      <a href={s.url} target="_blank" rel="noreferrer">
                        {s.title || s.url}
                      </a>
                    </p>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </>
  )
}
