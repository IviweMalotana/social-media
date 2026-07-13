import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import {
  MARKETS,
  SEGMENTS,
  getSequenceTemplate,
  type CampaignStepTemplate,
} from '../outreachTemplates'

interface CampaignSummary {
  id: string
  name: string
  segment: string
  country: string
  status: 'Draft' | 'Active' | 'Paused' | 'Completed'
  sendWindow: string
  stepCount: number
  enrolled: number
  activeEnrollments: number
  draftedCount: number
  approvedCount: number
  sentCount: number
}

interface QueueMessage {
  id: string
  campaignId: string
  campaign: string
  stepNumber: number
  subject: string
  body: string
  status: string
  draftedByAi: boolean
  error: string | null
  company: string
  contact: string
  email: string
  needsEdit: boolean
}

interface Suppression {
  id: string
  email: string
  reason: string
  createdAt: string
}

const SEGMENT_LABEL = Object.fromEntries(SEGMENTS.map((s) => [s.key, s.label]))
const MARKET_LABEL = Object.fromEntries(MARKETS.map((m) => [m.key, m.label]))

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([])
  const [queue, setQueue] = useState<QueueMessage[]>([])
  const [suppressions, setSuppressions] = useState<Suppression[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState('')

  // Create form
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [segment, setSegment] = useState('hotel')
  const [market, setMarket] = useState('ZA')
  const [steps, setSteps] = useState<CampaignStepTemplate[]>(() =>
    getSequenceTemplate('hotel', 'ZA'),
  )
  const [useAi, setUseAi] = useState(false)
  const [suppressEmail, setSuppressEmail] = useState('')
  const [edits, setEdits] = useState<Record<string, { subject: string; body: string }>>({})

  const load = useCallback(() => {
    api<CampaignSummary[]>('/api/campaigns').then(setCampaigns).catch(showError)
    api<QueueMessage[]>('/api/campaigns/messages?status=Drafted').then(setQueue).catch(showError)
    api<Suppression[]>('/api/suppressions').then(setSuppressions).catch(showError)
  }, [])
  useEffect(load, [load])

  function showError(err: unknown) {
    setError(err instanceof Error ? err.message : 'Request failed')
  }

  function prefillSteps(nextSegment: string, nextMarket: string) {
    setSteps(getSequenceTemplate(nextSegment, nextMarket))
  }

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label)
    setError('')
    setNotice('')
    try {
      await fn()
      load()
    } catch (err) {
      showError(err)
    } finally {
      setBusy('')
    }
  }

  async function createCampaign() {
    await run('create', async () => {
      await api('/api/campaigns', {
        method: 'POST',
        body: JSON.stringify({ name, segment, country: market, steps }),
      })
      setNotice('Campaign created as Draft — enroll prospects, generate drafts, review, then activate.')
      setShowCreate(false)
      setName('')
    })
  }

  const patchMessage = (id: string, payload: object) =>
    api(`/api/campaigns/messages/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })

  return (
    <>
      <h1>Campaigns</h1>
      <p className="subtitle">
        Sequenced outreach with a human in the loop: enroll prospects, review every
        drafted email, approve — the engine sends inside each market's window, under the
        daily cap, and stops the moment someone replies or unsubscribes.
      </p>

      <div className="row" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
        <button onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? 'Close' : 'New campaign'}
        </button>
        <label className="row" style={{ gap: 6 }}>
          <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />
          Personalize drafts with AI (facts-only)
        </label>
        {notice && <span className="status ok">{notice}</span>}
        {error && <span className="error">{error}</span>}
      </div>

      {showCreate && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h2 style={{ marginTop: 0 }}>New campaign</h2>
          <div className="row" style={{ flexWrap: 'wrap', gap: 12 }}>
            <div>
              <label>Name</label>
              <input
                style={{ width: 220 }}
                value={name}
                placeholder="US skincare brands · July"
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label>Segment</label>
              <select
                value={segment}
                onChange={(e) => {
                  setSegment(e.target.value)
                  prefillSteps(e.target.value, market)
                }}
              >
                {SEGMENTS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Market</label>
              <select
                value={market}
                onChange={(e) => {
                  setMarket(e.target.value)
                  prefillSteps(segment, e.target.value)
                }}
              >
                {MARKETS.filter((m) => m.key !== '').map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="muted" style={{ marginTop: 10 }}>
            Steps are pre-filled from the playbook for this segment + market. Merge
            fields <code>{'{{firstName}}'}</code>, <code>{'{{companyName}}'}</code>,{' '}
            <code>{'{{city}}'}</code> fill per prospect at draft time.
          </p>
          {steps.map((step, i) => (
            <div key={i} className="card" style={{ marginTop: 10 }}>
              <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
                <strong>Step {i + 1}</strong>
                <label className="row" style={{ gap: 6 }}>
                  after
                  <input
                    style={{ width: 50 }}
                    inputMode="numeric"
                    value={step.delayDays}
                    onChange={(e) =>
                      setSteps((prev) =>
                        prev.map((s, j) =>
                          j === i ? { ...s, delayDays: Number(e.target.value) || 0 } : s,
                        ),
                      )
                    }
                  />
                  days
                </label>
              </div>
              <input
                style={{ width: '100%', marginTop: 8 }}
                value={step.subject}
                onChange={(e) =>
                  setSteps((prev) =>
                    prev.map((s, j) => (j === i ? { ...s, subject: e.target.value } : s)),
                  )
                }
              />
              <textarea
                style={{ width: '100%', marginTop: 8, minHeight: 140 }}
                value={step.body}
                onChange={(e) =>
                  setSteps((prev) =>
                    prev.map((s, j) => (j === i ? { ...s, body: e.target.value } : s)),
                  )
                }
              />
            </div>
          ))}
          <div className="row" style={{ marginTop: 12 }}>
            <button disabled={!name.trim() || busy !== ''} onClick={createCampaign}>
              Create campaign
            </button>
          </div>
        </div>
      )}

      {campaigns.length === 0 && !showCreate && (
        <div className="card">
          <p className="muted">
            No campaigns yet. A campaign takes one segment in one market through the
            3-email playbook sequence — every email passes your review before it sends.
          </p>
        </div>
      )}

      <div className="grid">
        {campaigns.map((c) => (
          <div className="card" key={c.id}>
            <div className="row between">
              <h2 style={{ margin: 0, fontSize: 15 }}>{c.name}</h2>
              <span className={`status ${c.status === 'Active' ? 'ok' : 'warn'}`}>
                {c.status}
              </span>
            </div>
            <p className="muted" style={{ marginTop: 6 }}>
              {SEGMENT_LABEL[c.segment] ?? c.segment} · {MARKET_LABEL[c.country] ?? c.country}
              <br />
              Window: {c.sendWindow}
            </p>
            <p style={{ marginTop: 8 }}>
              {c.enrolled} enrolled ({c.activeEnrollments} active) · {c.draftedCount} in
              review · {c.approvedCount} approved · {c.sentCount} sent
            </p>
            <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
              {c.status !== 'Active' ? (
                <button
                  disabled={busy !== ''}
                  onClick={() =>
                    run('activate', async () => {
                      await api(`/api/campaigns/${c.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ status: 'Active' }),
                      })
                      setNotice('Campaign active — approved emails send in the next window.')
                    })
                  }
                >
                  Activate
                </button>
              ) : (
                <button
                  className="ghost"
                  disabled={busy !== ''}
                  onClick={() =>
                    run('pause', async () => {
                      await api(`/api/campaigns/${c.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ status: 'Paused' }),
                      })
                    })
                  }
                >
                  Pause
                </button>
              )}
              <button
                className="ghost"
                disabled={busy !== ''}
                onClick={() =>
                  run('enroll', async () => {
                    const r = await api<{ enrolled: number }>(`/api/campaigns/${c.id}/enroll`, {
                      method: 'POST',
                      body: JSON.stringify({}),
                    })
                    setNotice(
                      r.enrolled > 0
                        ? `Enrolled ${r.enrolled} matching prospect${r.enrolled === 1 ? '' : 's'} ✓`
                        : 'No new matching prospects (segment + market, fresh, with email, not suppressed).',
                    )
                  })
                }
              >
                Enroll matching
              </button>
              <button
                className="ghost"
                disabled={busy !== ''}
                onClick={() =>
                  run('draft', async () => {
                    const r = await api<{ drafted: number; aiFailures: number }>(
                      `/api/campaigns/${c.id}/generate-drafts`,
                      { method: 'POST', body: JSON.stringify({ useAi }) },
                    )
                    setNotice(
                      r.drafted > 0
                        ? `${r.drafted} draft${r.drafted === 1 ? '' : 's'} added to the review queue ✓`
                        : 'Nothing to draft — everyone active already has their next email queued.',
                    )
                  })
                }
              >
                Generate drafts
              </button>
              <button
                className="ghost"
                title="Delete campaign"
                disabled={busy !== ''}
                onClick={() => {
                  if (!confirm(`Delete campaign "${c.name}" and its queue?`)) return
                  run('delete', async () => {
                    await api(`/api/campaigns/${c.id}`, { method: 'DELETE' })
                  })
                }}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ marginTop: 0 }}>Review queue ({queue.length})</h2>
        <p className="muted">
          Nothing sends without your approval. Anything with an unfilled [bracket] can't
          be approved until you edit it — that's the honesty guardrail, not a bug.
        </p>
        {queue.length === 0 && <p className="muted">Queue is empty.</p>}
        {queue.map((m) => {
          const edit = edits[m.id] ?? { subject: m.subject, body: m.body }
          return (
            <div className="card" key={m.id} style={{ marginTop: 10 }}>
              <div className="row between" style={{ flexWrap: 'wrap' }}>
                <strong>
                  {m.company}
                  {m.contact ? ` · ${m.contact}` : ''}
                </strong>
                <span className="muted">
                  {m.campaign} · step {m.stepNumber} · to {m.email}
                  {m.draftedByAi ? ' · AI-polished' : ''}
                </span>
              </div>
              {m.needsEdit && (
                <p className="error" style={{ marginTop: 6 }}>
                  Contains an unfilled [placeholder] — edit before approving.
                </p>
              )}
              <input
                style={{ width: '100%', marginTop: 8 }}
                value={edit.subject}
                onChange={(e) =>
                  setEdits((prev) => ({ ...prev, [m.id]: { ...edit, subject: e.target.value } }))
                }
              />
              <textarea
                style={{ width: '100%', marginTop: 8, minHeight: 160 }}
                value={edit.body}
                onChange={(e) =>
                  setEdits((prev) => ({ ...prev, [m.id]: { ...edit, body: e.target.value } }))
                }
              />
              <div className="row" style={{ marginTop: 8 }}>
                <button
                  disabled={busy !== ''}
                  onClick={() =>
                    run('approve', async () => {
                      await patchMessage(m.id, {
                        subject: edit.subject,
                        body: edit.body,
                        action: 'approve',
                      })
                      setEdits((prev) => {
                        const next = { ...prev }
                        delete next[m.id]
                        return next
                      })
                    })
                  }
                >
                  Approve
                </button>
                <button
                  className="ghost"
                  disabled={busy !== ''}
                  onClick={() =>
                    run('reject', async () => {
                      await patchMessage(m.id, { action: 'reject' })
                    })
                  }
                >
                  Reject
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ marginTop: 0 }}>Suppression list ({suppressions.length})</h2>
        <p className="muted">
          Checked on every send, no exceptions — unsubscribes, bounces, and complaints
          land here automatically; add anyone else by hand.
        </p>
        <div className="row" style={{ marginTop: 8 }}>
          <input
            style={{ width: 260 }}
            placeholder="email to suppress"
            value={suppressEmail}
            onChange={(e) => setSuppressEmail(e.target.value)}
          />
          <button
            className="ghost"
            disabled={!suppressEmail.includes('@') || busy !== ''}
            onClick={() =>
              run('suppress', async () => {
                await api('/api/suppressions', {
                  method: 'POST',
                  body: JSON.stringify({ email: suppressEmail }),
                })
                setSuppressEmail('')
              })
            }
          >
            Suppress
          </button>
        </div>
        {suppressions.slice(0, 20).map((s) => (
          <div key={s.id} className="row" style={{ marginTop: 6, gap: 8 }}>
            <span className="muted">
              {s.email} · {s.reason} · {new Date(s.createdAt).toLocaleDateString()}
            </span>
            <button
              className="ghost"
              title="Remove from suppression list"
              disabled={busy !== ''}
              onClick={() => {
                if (
                  !confirm(
                    `Remove ${s.email} from the suppression list? Only do this if they explicitly asked to hear from you again.`,
                  )
                )
                  return
                run('unsuppress', async () => {
                  await api(`/api/suppressions/${s.id}`, { method: 'DELETE' })
                })
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </>
  )
}
