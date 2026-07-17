import { useEffect, useState } from 'react'
import { api } from '../api'

interface ArticleSummary {
  id: string
  title: string
  slug: string
  keyword: string
  audience: string
  status: 'draft' | 'ready' | 'published'
  generatedByAi: boolean
  createdAt: string
  updatedAt: string
  words: number
  publishedUrl: string | null
  publishedAt: string | null
  monthlySessions: number
  pinClicks?: number
}

interface Article extends ArticleSummary {
  metaDescription: string
  bodyMarkdown: string
}

const AUDIENCES = [
  'US indie skincare brands',
  'ZA guesthouses & boutique hotels',
  'spas & salons',
  'short-term rental managers',
  'anyone starting a cosmetics brand',
]

const TOPIC_IDEAS = [
  'How MOQs really work when buying cosmetic packaging (and how to start at 10 units)',
  'Dropper vs pump vs disc cap: choosing closures for skincare products',
  'Silk screen vs hot stamp: branding cosmetic packaging from 2,500 units',
  'What guest amenity bottles actually cost a guesthouse per month',
  'How to test packaging for a product launch without overstocking',
]

export default function Articles() {
  const [articles, setArticles] = useState<ArticleSummary[]>([])
  const [current, setCurrent] = useState<Article | null>(null)
  const [topic, setTopic] = useState('')
  const [keyword, setKeyword] = useState('')
  const [audience, setAudience] = useState(AUDIENCES[0])
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  function load() {
    api<ArticleSummary[]>('/api/articles').then(setArticles).catch(showError)
  }
  useEffect(load, [])

  function showError(err: unknown) {
    setError(err instanceof Error ? err.message : 'Request failed')
  }

  async function generate() {
    setError('')
    setNotice('')
    setBusy(true)
    try {
      const article = await api<Article>('/api/articles/generate', {
        method: 'POST',
        body: JSON.stringify({ topic, keyword, audience, notes }),
      })
      setCurrent(article)
      setTopic('')
      setNotes('')
      setNotice(
        article.bodyMarkdown.includes('[')
          ? 'Draft ready. It contains [placeholders] where real facts are needed. Fill them before marking ready.'
          : 'Draft ready. Review, edit, then mark it ready.',
      )
      load()
    } catch (err) {
      showError(err)
    } finally {
      setBusy(false)
    }
  }

  async function save(patch?: Partial<Article> & { status?: string }) {
    if (!current) return
    setError('')
    try {
      const updated = await api<Article>(`/api/articles/${current.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: current.title,
          slug: current.slug,
          keyword: current.keyword,
          metaDescription: current.metaDescription,
          bodyMarkdown: current.bodyMarkdown,
          publishedUrl: current.publishedUrl ?? '',
          monthlySessions: current.monthlySessions,
          ...patch,
        }),
      })
      setCurrent(updated)
      setNotice('Saved ✓')
      load()
    } catch (err) {
      showError(err)
    }
  }

  async function open(id: string) {
    setError('')
    setNotice('')
    try {
      setCurrent(await api<Article>(`/api/articles/${id}`))
    } catch (err) {
      showError(err)
    }
  }

  function copyMarkdown() {
    if (!current) return
    navigator.clipboard
      .writeText(current.bodyMarkdown)
      .then(() => setNotice('Markdown copied. Paste it into the shop blog.'))
      .catch(() => setError('Clipboard blocked. Use Download instead.'))
  }

  const wordCount = current
    ? current.bodyMarkdown.split(/\s+/).filter(Boolean).length
    : 0

  return (
    <>
      <h1>Articles</h1>
      <p className="subtitle">
        The SEO engine: generate genuinely useful articles here, edit them honest, then
        publish on the shop's blog. Every article feeds search traffic and gives Pinterest
        pins a destination.
      </p>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Generate an article</h2>
        <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
          <input
            style={{ flex: '1 1 320px' }}
            placeholder="Topic. What should the article teach?"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
          <input
            style={{ width: 220 }}
            placeholder="primary keyword (optional)"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <select value={audience} onChange={(e) => setAudience(e.target.value)}>
            {AUDIENCES.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </div>
        <textarea
          style={{ width: '100%', marginTop: 8, minHeight: 60 }}
          placeholder="Extra facts the article may use (real prices, lead times, product names). Anything not listed here becomes a [placeholder]"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <div className="row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
          <button disabled={!topic.trim() || busy} onClick={generate}>
            {busy ? 'Writing…' : 'Generate draft'}
          </button>
          {notice && <span className="status ok">{notice}</span>}
          {error && <span className="error">{error}</span>}
        </div>
        <p className="muted" style={{ marginTop: 10 }}>
          Stuck for topics? Try:{' '}
          {TOPIC_IDEAS.map((t, i) => (
            <span key={i}>
              <a href="#" onClick={(e) => (e.preventDefault(), setTopic(t))}>
                {t.split(':')[0].split('(')[0].trim()}
              </a>
              {i < TOPIC_IDEAS.length - 1 ? ' · ' : ''}
            </span>
          ))}
        </p>
      </div>

      {current && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="row between" style={{ flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0 }}>Editing</h2>
            <span className="muted">
              {wordCount} words · {current.status}
              {current.bodyMarkdown.includes('[') ? ' · has [placeholders]' : ''}
            </span>
          </div>
          <label>Title (H1)</label>
          <input
            style={{ width: '100%' }}
            value={current.title}
            onChange={(e) => setCurrent({ ...current, title: e.target.value })}
          />
          <div className="row" style={{ flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
            <div style={{ flex: '1 1 220px' }}>
              <label>Slug</label>
              <input
                style={{ width: '100%' }}
                value={current.slug}
                onChange={(e) => setCurrent({ ...current, slug: e.target.value })}
              />
            </div>
            <div style={{ flex: '1 1 180px' }}>
              <label>Keyword</label>
              <input
                style={{ width: '100%' }}
                value={current.keyword}
                onChange={(e) => setCurrent({ ...current, keyword: e.target.value })}
              />
            </div>
          </div>
          <label style={{ marginTop: 8 }}>
            Meta description ({current.metaDescription.length}/155)
          </label>
          <input
            style={{ width: '100%' }}
            value={current.metaDescription}
            onChange={(e) => setCurrent({ ...current, metaDescription: e.target.value })}
          />
          <div className="row" style={{ flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
            <div style={{ flex: '1 1 280px' }}>
              <label>Published URL (once live on the shop blog)</label>
              <input
                style={{ width: '100%' }}
                placeholder="https://bedifferentpackaging.com/blog/..."
                value={current.publishedUrl ?? ''}
                onChange={(e) => setCurrent({ ...current, publishedUrl: e.target.value })}
              />
            </div>
            <div style={{ flex: '0 1 220px' }}>
              <label>Monthly sessions (from shop analytics)</label>
              <input
                style={{ width: '100%' }}
                inputMode="numeric"
                value={current.monthlySessions}
                onChange={(e) =>
                  setCurrent({ ...current, monthlySessions: Number(e.target.value) || 0 })
                }
              />
            </div>
          </div>
          <label style={{ marginTop: 8 }}>Body (markdown)</label>
          <textarea
            style={{ width: '100%', minHeight: 420, fontFamily: 'monospace', fontSize: 13 }}
            value={current.bodyMarkdown}
            onChange={(e) => setCurrent({ ...current, bodyMarkdown: e.target.value })}
          />
          <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
            <button onClick={() => save()}>Save</button>
            <button
              className="ghost"
              disabled={current.bodyMarkdown.includes('[')}
              title={
                current.bodyMarkdown.includes('[')
                  ? 'Fill the [placeholders] first'
                  : 'Mark as ready to publish'
              }
              onClick={() => save({ status: 'ready' })}
            >
              Mark ready
            </button>
            <button
              className="ghost"
              title="Marks published; fills the standard blog URL from the slug if empty"
              onClick={() => {
                // Articles live on the shop blog. Default the URL from the slug.
                const url =
                  (current.publishedUrl ?? '').includes('/') || !current.slug
                    ? current.publishedUrl ?? ''
                    : `https://www.bedifferentpackaging.com/blog/${current.slug}`
                setCurrent({ ...current, publishedUrl: url })
                save({ status: 'published', publishedUrl: url })
              }}
            >
              Mark published
            </button>
            <button className="ghost" onClick={copyMarkdown}>
              Copy markdown
            </button>
            <a
              className="ghost"
              style={{ padding: '8px 12px' }}
              href={`${import.meta.env.VITE_API_URL ?? ''}/api/articles/${current.id}/export`}
              onClick={(e) => {
                // fetch with auth header instead of plain navigation
                e.preventDefault()
                fetch(
                  `${import.meta.env.VITE_API_URL ?? ''}/api/articles/${current.id}/export`,
                  { headers: { Authorization: `Bearer ${localStorage.getItem('sm.token')}` } },
                )
                  .then((r) => r.blob())
                  .then((blob) => {
                    const url = URL.createObjectURL(blob)
                    const link = document.createElement('a')
                    link.href = url
                    link.download = `${current.slug || 'article'}.md`
                    link.click()
                    URL.revokeObjectURL(url)
                  })
              }}
            >
              Download .md
            </a>
            <button className="ghost" onClick={() => setCurrent(null)}>
              Close
            </button>
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ marginTop: 0 }}>All articles ({articles.length})</h2>
        {articles.length === 0 && (
          <p className="muted">
            Nothing yet. One useful article a week compounds: it ranks on Google, gives
            every Pinterest pin a destination, and answers the questions prospects email
            you anyway.
          </p>
        )}
        {articles.map((a) => (
          <div className="row between" key={a.id} style={{ marginTop: 8, flexWrap: 'wrap' }}>
            <a href="#" onClick={(e) => (e.preventDefault(), open(a.id))}>
              {a.title}
            </a>
            <span className="muted">
              {a.words} words · {a.status}
              {a.status === 'published'
                ? ` · ${a.monthlySessions} sessions/mo · ${a.pinClicks ?? 0} pin clicks`
                : ''}
              {a.generatedByAi ? ' · AI draft' : ''} ·{' '}
              {new Date(a.updatedAt).toLocaleDateString()}
              <button
                className="ghost"
                style={{ marginLeft: 8 }}
                title="Delete"
                onClick={() => {
                  if (!confirm(`Delete "${a.title}"?`)) return
                  api(`/api/articles/${a.id}`, { method: 'DELETE' }).then(() => {
                    if (current?.id === a.id) setCurrent(null)
                    load()
                  })
                }}
              >
                ✕
              </button>
            </span>
          </div>
        ))}
      </div>
    </>
  )
}
