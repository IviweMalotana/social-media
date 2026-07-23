import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ConnectedAccount, Post } from '../api'

interface IntelSummary {
  suggested: boolean
  briefCount: number
  pinned: boolean
  lastResearchedAt: string | null
}

const WEEK_MS = 7 * 86400000

export default function Dashboard() {
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([])
  const [posts, setPosts] = useState<Post[]>([])
  const [intel, setIntel] = useState<IntelSummary[]>([])

  useEffect(() => {
    api<ConnectedAccount[]>('/api/connections').then(setAccounts).catch(() => {})
    api<Post[]>('/api/posts').then(setPosts).catch(() => {})
    api<IntelSummary[]>('/api/intel').then(setIntel).catch(() => {})
  }, [])

  // Weekly intel reminder: research is fully manual, so the app nags instead
  // of auto-spending. Due when nothing has been researched in the last 7 days,
  // or when previously briefed/pinned verticals have gone stale.
  const tracked = intel.filter((v) => !v.suggested)
  const staleBriefed = tracked.filter(
    (v) =>
      (v.briefCount > 0 || v.pinned) &&
      (!v.lastResearchedAt || Date.now() - new Date(v.lastResearchedAt).getTime() > WEEK_MS),
  )
  const lastPull = tracked.reduce<number | null>((latest, v) => {
    if (!v.lastResearchedAt) return latest
    const t = new Date(v.lastResearchedAt).getTime()
    return latest === null || t > latest ? t : latest
  }, null)
  const intelDue =
    tracked.length > 0 && (lastPull === null || Date.now() - lastPull > WEEK_MS)

  const scheduled = posts.filter((p) => p.status === 'Scheduled')
  const perf = posts
    .flatMap((p) => p.targets)
    .reduce(
      (sum, t) => ({
        impressions: sum.impressions + t.impressions,
        likes: sum.likes + t.likes,
        comments: sum.comments + t.comments,
        shares: sum.shares + t.shares,
      }),
      { impressions: 0, likes: 0, comments: 0, shares: 0 },
    )

  return (
    <>
      <h1>Dashboard</h1>
      <p className="subtitle">One composer, every platform.</p>

      {intelDue && (
        <div
          className="card"
          style={{ borderLeft: '3px solid var(--accent, #e0beb1)', marginBottom: 16 }}
        >
          <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
            <div>
              <strong>Weekly intel pull due</strong>
              <p className="muted" style={{ margin: '4px 0 0' }}>
                {lastPull === null
                  ? 'No buyer research has been run yet.'
                  : `Last research pull was ${Math.floor((Date.now() - lastPull) / 86400000)} days ago.`}
                {staleBriefed.length > 0 &&
                  ` ${staleBriefed.length} briefed vertical${staleBriefed.length === 1 ? '' : 's'} going stale.`}{' '}
                Research is manual, so nothing runs (or spends) until you trigger it.
              </p>
            </div>
            <Link to="/intel">
              <button>Open Intel →</button>
            </Link>
          </div>
        </div>
      )}

      <div className="grid">
        <div className="card">
          <div className="row between">
            <h2 style={{ margin: 0 }}>Connected accounts</h2>
            <span className="status ok">{accounts.length}</span>
          </div>
          <p className="muted" style={{ marginTop: 10 }}>
            {accounts.length === 0
              ? 'No accounts connected yet.'
              : accounts.map((a) => a.displayName).join(', ')}
          </p>
          <p style={{ marginTop: 14 }}>
            <Link to="/connections">Manage connections →</Link>
          </p>
        </div>

        <div className="card">
          <div className="row between">
            <h2 style={{ margin: 0 }}>Scheduled posts</h2>
            <span className="status warn">{scheduled.length}</span>
          </div>
          <p className="muted" style={{ marginTop: 10 }}>
            {scheduled.length === 0
              ? 'Nothing in the queue.'
              : `Next: ${new Date(scheduled[0].scheduledAt!).toLocaleString()}`}
          </p>
          <p style={{ marginTop: 14 }}>
            <Link to="/calendar">Open calendar →</Link>
          </p>
        </div>

        <div className="card">
          <h2 style={{ margin: 0 }}>Performance</h2>
          <p className="muted" style={{ marginTop: 10 }}>
            {perf.impressions.toLocaleString()} impressions · {perf.likes.toLocaleString()}{' '}
            likes · {perf.comments.toLocaleString()} comments · {perf.shares.toLocaleString()}{' '}
            shares
          </p>
          <p className="muted" style={{ marginTop: 8 }}>
            Refreshed automatically for posts published in the last 30 days.
          </p>
        </div>

        <div className="card">
          <h2 style={{ margin: 0 }}>Compose</h2>
          <p className="muted" style={{ marginTop: 10 }}>
            Write once, publish to Facebook, Instagram, TikTok, Pinterest and more.
          </p>
          <p style={{ marginTop: 14 }}>
            <Link to="/composer" className="btn">
              New post
            </Link>
          </p>
        </div>
      </div>
    </>
  )
}
