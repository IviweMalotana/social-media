import { useEffect, useState } from 'react'
import { api } from '../api'

interface Target {
  id: string
  name: string
  metricKey: string
  unit: string
  targetValue: number
  current: number
  isAuto: boolean
  lowerIsBetter: boolean
  startDate: string
  endDate: string
  expectedByNow: number
  onTrack: boolean
  notes: string | null
}

function daysLeft(end: string) {
  return Math.max(0, Math.ceil((new Date(end).getTime() - Date.now()) / 86_400_000))
}

export default function Targets() {
  const [targets, setTargets] = useState<Target[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState<Record<string, string>>({})
  // Visits-needed calculator
  const [calcRevenue, setCalcRevenue] = useState('5000')
  const [calcAov, setCalcAov] = useState('400')
  const [calcConv, setCalcConv] = useState('0.4')

  function load() {
    api<Target[]>('/api/targets')
      .then(setTargets)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
  }
  useEffect(load, [])

  async function seedStarter() {
    setError('')
    try {
      const result = await api<{ created: number }>('/api/targets/seed-starter', {
        method: 'POST',
      })
      setNotice(
        result.created > 0
          ? `Added ${result.created} starter target${result.created === 1 ? '' : 's'} ✓`
          : 'Starter targets already exist.',
      )
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Seeding failed')
    }
  }

  async function saveActual(target: Target) {
    const raw = editing[target.id]
    if (raw === undefined || raw === '') return
    const value = Number(raw)
    if (Number.isNaN(value)) return
    try {
      await api(`/api/targets/${target.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ manualValue: value }),
      })
      setEditing((e) => ({ ...e, [target.id]: '' }))
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    }
  }

  async function remove(target: Target) {
    if (!confirm(`Delete target "${target.name}"?`)) return
    await api(`/api/targets/${target.id}`, { method: 'DELETE' })
    load()
  }

  const orders =
    Number(calcRevenue) > 0 && Number(calcAov) > 0
      ? Number(calcRevenue) / Number(calcAov)
      : 0
  const visits = orders > 0 && Number(calcConv) > 0 ? orders / (Number(calcConv) / 100) : 0

  return (
    <>
      <h1>Targets</h1>
      <p className="subtitle">
        Your instrument panel: what the business needs to hit, what the app measures for
        you, and whether you're on pace.
      </p>

      <div className="row" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
        <button onClick={seedStarter}>Load 90-day starter targets</button>
        <button
          className="ghost"
          onClick={async () => {
            try {
              const r = await api<{ created: number }>('/api/targets/seed-b2b', { method: 'POST' })
              setNotice(r.created > 0 ? `Added ${r.created} B2B targets ✓` : 'B2B targets already exist.')
              load()
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Seeding failed')
            }
          }}
        >
          Load B2B outreach targets
        </button>
        <button
          className="ghost"
          onClick={async () => {
            try {
              const r = await api<{ created: number }>('/api/targets/seed-us', { method: 'POST' })
              setNotice(r.created > 0 ? `Added ${r.created} US-market targets ✓` : 'US targets already exist.')
              load()
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Seeding failed')
            }
          }}
        >
          Load US market targets
        </button>
        {notice && <span className="status ok">{notice}</span>}
        {error && <span className="error">{error}</span>}
      </div>

      {targets.length === 0 && (
        <div className="card">
          <p className="muted">
            No targets yet. The starter set gives you the baseline-finding plan: 1,000
            sessions, first 10–15 orders, measured AOV, cart-recovery live in 14 days,
            one paid-channel cost-per-visit test, plus auto-tracked social clicks and
            posting consistency.
          </p>
        </div>
      )}

      <div className="grid">
        {targets.map((t) => {
          const progress =
            t.targetValue > 0 ? Math.min(1, t.current / t.targetValue) : 0
          const barClass = t.lowerIsBetter
            ? t.onTrack
              ? 'ok'
              : 'bad'
            : t.onTrack
              ? 'ok'
              : 'warn'
          return (
            <div className="card" key={t.id}>
              <div className="row between">
                <h2 style={{ margin: 0, fontSize: 15 }}>{t.name}</h2>
                <span className={`status ${t.onTrack ? 'ok' : 'warn'}`}>
                  {t.onTrack ? 'on track' : 'behind'}
                </span>
              </div>
              <div style={{ margin: '12px 0 4px', fontSize: 22, fontWeight: 700 }}>
                {t.current.toLocaleString()}
                <span className="muted" style={{ fontSize: 14, fontWeight: 400 }}>
                  {' '}/ {t.targetValue.toLocaleString()} {t.unit}
                </span>
              </div>
              {!t.lowerIsBetter && (
                <div className="progress">
                  <div
                    className={`progress-fill ${barClass}`}
                    style={{ width: `${progress * 100}%` }}
                  />
                  <div
                    className="progress-pace"
                    style={{
                      left: `${Math.min(100, (t.expectedByNow / Math.max(t.targetValue, 1)) * 100)}%`,
                    }}
                    title={`Pace: should be at ${t.expectedByNow.toLocaleString()} by today`}
                  />
                </div>
              )}
              <p className="muted" style={{ marginTop: 8 }}>
                {t.isAuto ? 'Auto-tracked from your posts. ' : ''}
                {daysLeft(t.endDate)} days left
                {!t.lowerIsBetter && t.expectedByNow > 0
                  ? ` · pace says ~${t.expectedByNow.toLocaleString()} by today`
                  : ''}
              </p>
              {t.notes && (
                <p className="muted" style={{ marginTop: 6, fontStyle: 'italic' }}>
                  {t.notes}
                </p>
              )}
              <div className="row" style={{ marginTop: 12 }}>
                {!t.isAuto && (
                  <>
                    <input
                      style={{ width: 110 }}
                      placeholder="actual"
                      inputMode="decimal"
                      value={editing[t.id] ?? ''}
                      onChange={(e) =>
                        setEditing((prev) => ({ ...prev, [t.id]: e.target.value }))
                      }
                      onKeyDown={(e) => e.key === 'Enter' && saveActual(t)}
                    />
                    <button className="ghost" onClick={() => saveActual(t)}>
                      Update
                    </button>
                  </>
                )}
                <button className="ghost" onClick={() => remove(t)} title="Delete target">
                  ✕
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ marginTop: 0 }}>How many visits do I need?</h2>
        <p className="muted">
          visits = (revenue ÷ average order value) ÷ conversion rate — your Etsy baseline
          was 0.7% conversion; plan on 0.3–0.5% for a new standalone store.
        </p>
        <div className="row" style={{ flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
          <div>
            <label>Monthly revenue goal (R)</label>
            <input
              style={{ width: 140 }}
              inputMode="decimal"
              value={calcRevenue}
              onChange={(e) => setCalcRevenue(e.target.value)}
            />
          </div>
          <div>
            <label>Average order value (R)</label>
            <input
              style={{ width: 140 }}
              inputMode="decimal"
              value={calcAov}
              onChange={(e) => setCalcAov(e.target.value)}
            />
          </div>
          <div>
            <label>Conversion rate (%)</label>
            <input
              style={{ width: 140 }}
              inputMode="decimal"
              value={calcConv}
              onChange={(e) => setCalcConv(e.target.value)}
            />
          </div>
        </div>
        {visits > 0 && (
          <p style={{ marginTop: 14, fontSize: 16 }}>
            ≈ <strong>{Math.ceil(orders).toLocaleString()} orders</strong> →{' '}
            <strong>{Math.ceil(visits).toLocaleString()} visits/month</strong>
            <span className="muted">
              {' '}
              (about {Math.ceil(visits / 30).toLocaleString()} a day)
            </span>
          </p>
        )}
      </div>
    </>
  )
}
