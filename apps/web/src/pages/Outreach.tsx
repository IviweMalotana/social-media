import { useEffect, useState } from 'react'
import { api } from '../api'
import { getSequence, SEGMENTS } from '../outreachTemplates'

interface Prospect {
  id: string
  companyName: string
  contactName: string
  email: string
  segment: string
  city: string
  country: string
  status: string
  emailsSent: number
  hasReplied: boolean
  monthlyValue: number
  lastContactedAt: string | null
  nextFollowUpAt: string | null
  notes: string | null
}

interface Stats {
  total: number
  contacted: number
  replies: number
  replyRatePercent: number
  interested: number
  won: number
  recurringMonthlyRevenue: number
  emailsSent: number
  dueFollowUps: number
}

const STATUSES = ['New', 'Contacted', 'Replied', 'Interested', 'SampleSent', 'Won', 'Lost', 'OptedOut']

export default function Outreach() {
  const [prospects, setProspects] = useState<Prospect[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [filter, setFilter] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [importText, setImportText] = useState('')
  const [importSegment, setImportSegment] = useState('hotel')
  const [showImport, setShowImport] = useState(false)
  const [templateFor, setTemplateFor] = useState<Prospect | null>(null)

  function load() {
    api<Prospect[]>('/api/prospects').then(setProspects).catch(() => {})
    api<Stats>('/api/prospects/stats').then(setStats).catch(() => {})
  }
  useEffect(load, [])

  async function importRows() {
    setError('')
    const rows = importText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [companyName, email, contactName, city, country] = line
          .split(/[,;\t]/)
          .map((cell) => cell?.trim().replace(/^"|"$/g, '') ?? '')
        return { companyName, email, contactName, city, country, segment: importSegment, notes: null }
      })
      .filter((row) => row.companyName && !row.companyName.toLowerCase().startsWith('company'))
    if (rows.length === 0) {
      setError('Nothing to import — one prospect per line: Company, email, contact, city, country')
      return
    }
    try {
      const result = await api<{ created: number; skipped: number }>('/api/prospects/bulk', {
        method: 'POST',
        body: JSON.stringify(rows),
      })
      setNotice(`Imported ${result.created} prospect${result.created === 1 ? '' : 's'}${result.skipped ? ` (${result.skipped} duplicates skipped)` : ''} ✓`)
      setImportText('')
      setShowImport(false)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    }
  }

  async function logEmail(p: Prospect) {
    await api(`/api/prospects/${p.id}/log-email`, { method: 'POST' })
    load()
  }

  async function setStatus(p: Prospect, status: string) {
    let monthlyValue: number | null = null
    if (status === 'Won') {
      const raw = prompt('Expected recurring value per month (R):', '1000')
      if (raw === null) return
      monthlyValue = Number(raw) || 0
    }
    await api(`/api/prospects/${p.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, ...(monthlyValue !== null ? { monthlyValue } : {}) }),
    })
    load()
  }

  async function remove(p: Prospect) {
    if (!confirm(`Delete ${p.companyName}?`)) return
    await api(`/api/prospects/${p.id}`, { method: 'DELETE' })
    load()
  }

  function copyEmail(p: Prospect, index: number) {
    const emails = getSequence(p.segment, p)
    const email = emails[Math.min(index, emails.length - 1)]
    navigator.clipboard.writeText(`Subject: ${email.subject}\n\n${email.body}`)
    setNotice(`Email ${Math.min(index, emails.length - 1) + 1} for ${p.companyName} copied — paste into your sending tool ✓`)
  }

  const now = Date.now()
  const due = prospects.filter(
    (p) =>
      p.nextFollowUpAt &&
      new Date(p.nextFollowUpAt).getTime() <= now &&
      !['Won', 'Lost', 'OptedOut'].includes(p.status),
  )
  const shown = filter ? prospects.filter((p) => p.status === filter) : prospects

  const lowReplyWarning =
    stats && stats.emailsSent >= 200 && stats.replyRatePercent < 2

  return (
    <>
      <h1>Outreach</h1>
      <p className="subtitle">
        Your B2B pipeline — 15 recurring accounts at ~R1,000/month is the whole R15k
        target. Sending happens in your outreach tool; this is the system of record.
      </p>

      {stats && (
        <div className="stat-row">
          <div className="stat"><b>{stats.total}</b><span>prospects</span></div>
          <div className="stat"><b>{stats.emailsSent}</b><span>emails sent</span></div>
          <div className="stat">
            <b className={lowReplyWarning ? 'stat-bad' : ''}>{stats.replyRatePercent}%</b>
            <span>reply rate</span>
          </div>
          <div className="stat"><b>{stats.interested}</b><span>interested</span></div>
          <div className="stat"><b>{stats.won}</b><span>accounts won</span></div>
          <div className="stat">
            <b>R{stats.recurringMonthlyRevenue.toLocaleString()}</b>
            <span>recurring / month</span>
          </div>
        </div>
      )}

      {lowReplyWarning && (
        <div className="issue blocking" style={{ marginBottom: 12 }}>
          Kill criterion: reply rate under 2% after 200+ sends — rewrite Email 1 before
          sending more (try the free sample-box lead: “can I ship you 5 free bottles?”).
        </div>
      )}

      {due.length > 0 && (
        <div className="issue warning" style={{ marginBottom: 12 }}>
          {due.length} follow-up{due.length === 1 ? '' : 's'} due — reply speed doubles
          close rates.
        </div>
      )}

      <div className="row" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
        <button onClick={() => setShowImport((v) => !v)}>
          {showImport ? 'Close import' : '+ Import prospects'}
        </button>
        <select style={{ width: 'auto' }} value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        {notice && <span className="status ok">{notice}</span>}
        {error && <span className="error">{error}</span>}
      </div>

      {showImport && (
        <div className="card">
          <label>Paste one prospect per line: Company, email, contact name, city, country</label>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder={'Mountain View Guesthouse, info@mountainview.co.za, Sarah, Franschhoek, ZA\nProtea Day Spa, bookings@proteaspa.co.za, , Stellenbosch, ZA'}
          />
          <div className="row" style={{ marginTop: 10 }}>
            <select style={{ width: 'auto' }} value={importSegment} onChange={(e) => setImportSegment(e.target.value)}>
              {SEGMENTS.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
            <button onClick={importRows}>Import</button>
          </div>
        </div>
      )}

      <div className="card" style={{ overflowX: 'auto' }}>
        {shown.length === 0 ? (
          <p className="muted">
            No prospects yet. Import your Apollo/Hunter list above — the playbook target
            is 300–500 verified SA contacts in month one.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Company</th>
                <th>Segment</th>
                <th>Status</th>
                <th>Sent</th>
                <th>Next follow-up</th>
                <th>R/mo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => {
                const overdue =
                  p.nextFollowUpAt && new Date(p.nextFollowUpAt).getTime() <= now
                return (
                  <tr key={p.id}>
                    <td>
                      <div>{p.companyName}</div>
                      <div className="muted">{p.contactName || p.email || '—'}{p.city ? ` · ${p.city}` : ''}</div>
                    </td>
                    <td className="muted">{SEGMENTS.find((s) => s.key === p.segment)?.label ?? p.segment}</td>
                    <td>
                      <select
                        style={{ width: 'auto', padding: '4px 8px' }}
                        value={p.status}
                        onChange={(e) => setStatus(p, e.target.value)}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                    <td>{p.emailsSent}/3</td>
                    <td className={overdue ? 'error' : 'muted'}>
                      {p.nextFollowUpAt
                        ? new Date(p.nextFollowUpAt).toLocaleDateString()
                        : '—'}
                    </td>
                    <td>{p.monthlyValue > 0 ? `R${p.monthlyValue.toLocaleString()}` : '—'}</td>
                    <td>
                      <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                        <button
                          className="ghost"
                          title="Copy the next email in the sequence"
                          onClick={() => setTemplateFor(templateFor?.id === p.id ? null : p)}
                        >
                          ✉ {p.emailsSent >= 3 ? '3' : p.emailsSent + 1}
                        </button>
                        <button
                          className="ghost"
                          title="Record that an email was sent"
                          onClick={() => logEmail(p)}
                          disabled={p.emailsSent >= 3}
                        >
                          Log send
                        </button>
                        <button className="ghost" onClick={() => remove(p)} title="Delete">✕</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {templateFor && (
        <div className="card">
          <div className="row between">
            <h2 style={{ margin: 0 }}>
              Sequence for {templateFor.companyName}
            </h2>
            <button className="ghost" onClick={() => setTemplateFor(null)}>Close</button>
          </div>
          <p className="muted" style={{ marginTop: 6 }}>
            Fill the [bracketed] personalization line before sending — real
            personalization roughly doubles reply rates. Your sending tool adds the
            footer address + unsubscribe.
          </p>
          {getSequence(templateFor.segment, templateFor).map((email, i) => (
            <div key={i} style={{ marginTop: 14 }}>
              <div className="row between">
                <strong>
                  Email {i + 1}
                  {i === Math.min(templateFor.emailsSent, 2) ? ' — next up' : ''}
                </strong>
                <button className="ghost" onClick={() => copyEmail(templateFor, i)}>
                  Copy
                </button>
              </div>
              <p className="muted" style={{ margin: '4px 0' }}>Subject: {email.subject}</p>
              <pre className="email-body">{email.body}</pre>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
