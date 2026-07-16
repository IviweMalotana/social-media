import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ANGLES,
  MARKETS,
  SEGMENTS,
  listAllSequences,
  sendWindow,
  type SequenceRow,
} from '../outreachTemplates'

/**
 * The templates gallery — browse every cold-outreach sequence in the library
 * (market × segment × angle), preview the 3 emails filled with sample data, copy
 * per-email, or jump to New Campaign with the segment/market/angle preselected.
 *
 * These templates are the cold-outreach playbook — never used for owned-list
 * broadcasts (see Emails page for those).
 */

const SAMPLE = {
  companyName: 'Bloom Skincare',
  contactName: 'Sarah Adams',
  city: 'Cape Town',
}

const SEGMENT_LABEL = Object.fromEntries(SEGMENTS.map((s) => [s.key, s.label]))
const ANGLE_META = Object.fromEntries(ANGLES.map((a) => [a.key, a]))

function marketFlag(m: string) {
  if (m === 'ZA') return '🇿🇦'
  if (m === 'US') return '🇺🇸'
  if (m === 'UK') return '🇬🇧'
  return ''
}

function marketLabel(m: string) {
  return MARKETS.find((x) => x.key === m)?.label ?? m
}

export default function Templates() {
  const [market, setMarket] = useState('')
  const [segment, setSegment] = useState('')
  const [angle, setAngle] = useState('')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [copied, setCopied] = useState('')
  const navigate = useNavigate()

  const all = useMemo(() => listAllSequences(SAMPLE), [])

  const rows = useMemo(
    () =>
      all.filter(
        (r) =>
          (!market || r.market === market) &&
          (!segment || r.segment === segment) &&
          (!angle || r.angle === angle),
      ),
    [all, market, segment, angle],
  )

  const rowKey = (r: SequenceRow) => `${r.market}:${r.segment}:${r.angle}`

  async function copyEmail(id: string, subject: string, body: string) {
    try {
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`)
      setCopied(id)
      window.setTimeout(() => setCopied(''), 1400)
    } catch {
      // clipboard may be blocked in some browsers/contexts; silent fallback
    }
  }

  function useInCampaign(r: SequenceRow) {
    const params = new URLSearchParams({
      segment: r.segment,
      market: r.market,
      angle: r.angle,
    })
    navigate(`/campaigns?new=1&${params.toString()}`)
  }

  return (
    <>
      <h1>Templates</h1>
      <p className="subtitle">
        The cold-outreach playbook — one sequence per market × segment × angle,
        3 emails each, spaced 0 / +3 / +4 days. Every template carries one{' '}
        <code>[bracketed]</code> line for real per-prospect research; the send
        engine blocks approval until it's filled. Previewed with sample values
        so you can read them like the recipient will.
      </p>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div>
            <label>Market</label>
            <select value={market} onChange={(e) => setMarket(e.target.value)}>
              {MARKETS.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Segment</label>
            <select value={segment} onChange={(e) => setSegment(e.target.value)}>
              <option value="">All segments</option>
              {SEGMENTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Angle</label>
            <select value={angle} onChange={(e) => setAngle(e.target.value)}>
              <option value="">All angles</option>
              {ANGLES.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <span className="muted">
              {rows.length} sequence{rows.length === 1 ? '' : 's'} · {rows.length * 3} emails
            </span>
          </div>
        </div>
      </div>

      {rows.length === 0 && (
        <div className="card">
          <p className="muted">No sequences match those filters.</p>
        </div>
      )}

      {rows.map((r) => {
        const key = rowKey(r)
        const isOpen = expanded[key] !== false // default open
        const meta = ANGLE_META[r.angle]
        const w = sendWindow(r.market)
        return (
          <div className="card" key={key} style={{ marginTop: 12 }}>
            <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 16 }}>
                  <span style={{ marginRight: 6 }}>{marketFlag(r.market)}</span>
                  {SEGMENT_LABEL[r.segment] ?? r.segment}
                  <span className="muted" style={{ marginLeft: 8, fontWeight: 400 }}>
                    · {meta?.label ?? r.angle}
                  </span>
                </h2>
                <p className="muted" style={{ margin: '4px 0 0' }}>
                  {marketLabel(r.market)} · {meta?.note}
                </p>
                {w && (
                  <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>
                    {w}
                  </p>
                )}
              </div>
              <div className="row" style={{ gap: 8 }}>
                <button className="ghost" onClick={() => useInCampaign(r)}>
                  Use in new campaign
                </button>
                <button
                  className="ghost"
                  onClick={() => setExpanded((p) => ({ ...p, [key]: !isOpen }))}
                >
                  {isOpen ? 'Collapse' : 'Expand'}
                </button>
              </div>
            </div>

            {isOpen && (
              <div style={{ marginTop: 10 }}>
                {r.emails.map((email, i) => {
                  const emailId = `${key}:${i}`
                  const delay = i === 0 ? 'send now' : i === 1 ? '+3 days' : '+4 days'
                  const bracketed = /\[[^\]]+\]/.test(email.body) || /\[[^\]]+\]/.test(email.subject)
                  return (
                    <div className="card" key={i} style={{ marginTop: 8 }}>
                      <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
                        <strong>
                          Email {i + 1}
                          <span className="muted" style={{ marginLeft: 8, fontWeight: 400 }}>
                            · {delay}
                          </span>
                        </strong>
                        <div className="row" style={{ gap: 6 }}>
                          {bracketed && (
                            <span className="status warn" title="Has [bracketed] research placeholder — send is blocked until filled per prospect">
                              needs research
                            </span>
                          )}
                          <button
                            className="ghost"
                            onClick={() => copyEmail(emailId, email.subject, email.body)}
                          >
                            {copied === emailId ? 'Copied ✓' : 'Copy'}
                          </button>
                        </div>
                      </div>
                      <div style={{ marginTop: 6 }}>
                        <div className="muted" style={{ fontSize: 12 }}>
                          Subject
                        </div>
                        <div style={{ marginTop: 2 }}>
                          <strong>{email.subject}</strong>
                        </div>
                      </div>
                      <div style={{ marginTop: 8 }}>
                        <div className="muted" style={{ fontSize: 12 }}>
                          Body (previewed with sample prospect data)
                        </div>
                        <pre
                          style={{
                            marginTop: 4,
                            whiteSpace: 'pre-wrap',
                            fontFamily: 'inherit',
                            fontSize: 14,
                            lineHeight: 1.5,
                          }}
                        >
                          {email.body}
                        </pre>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}
