import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ConnectedAccount, Post } from '../api'

export default function Dashboard() {
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([])
  const [posts, setPosts] = useState<Post[]>([])

  useEffect(() => {
    api<ConnectedAccount[]>('/api/connections').then(setAccounts).catch(() => {})
    api<Post[]>('/api/posts').then(setPosts).catch(() => {})
  }, [])

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
