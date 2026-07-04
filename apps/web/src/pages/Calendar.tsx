import { useEffect, useState } from 'react'
import { api, Post } from '../api'

export default function Calendar() {
  const [posts, setPosts] = useState<Post[]>([])
  const [error, setError] = useState('')

  function load() {
    api<Post[]>('/api/posts')
      .then(setPosts)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
  }

  useEffect(load, [])

  async function cancel(id: string) {
    try {
      await api(`/api/posts/${id}/cancel`, { method: 'POST' })
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not cancel')
    }
  }

  const statusClass = (status: string) =>
    status === 'Published'
      ? 'ok'
      : status === 'Failed' || status === 'PartiallyPublished'
        ? 'bad'
        : 'warn'

  return (
    <>
      <h1>Calendar</h1>
      <p className="subtitle">Everything queued, published, or failed — in one place.</p>
      {error && <div className="issue blocking">{error}</div>}

      <div className="card">
        {posts.length === 0 ? (
          <p className="muted">No posts yet. Head to the composer to create your first one.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Caption</th>
                <th>Targets</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {posts.map((post) => (
                <tr key={post.id}>
                  <td>
                    {post.scheduledAt ? new Date(post.scheduledAt).toLocaleString() : 'Draft'}
                  </td>
                  <td>
                    {post.caption.length > 60 ? `${post.caption.slice(0, 60)}…` : post.caption}
                  </td>
                  <td className="muted">
                    {post.targets.map((t) => t.platform).join(', ') || '—'}
                  </td>
                  <td>
                    <span className={`status ${statusClass(post.status)}`}>{post.status}</span>
                  </td>
                  <td>
                    {post.status === 'Scheduled' && (
                      <button className="ghost" onClick={() => cancel(post.id)}>
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
