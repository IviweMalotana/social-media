import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import { MARKETS } from '../outreachTemplates'
import { EMAIL_TEMPLATES } from '../emailTemplates'

type Block = Record<string, unknown> & { type: string }

interface Brand {
  accent: string
  bg: string
  card: string
  ink: string
  muted: string
  button: string
  border: string
  wordmark: string
  logoUrl: string
}

interface DesignSummary {
  id: string
  name: string
  subject: string
  updatedAt: string
}

// The real site tokens (globals.css): white paper, warm ink, sand, blush, black CTAs.
const DEFAULT_BRAND: Brand = {
  accent: '#E0BEB1',
  bg: '#EFEDE9',
  card: '#FFFFFF',
  ink: '#2D2929',
  muted: '#6B6664',
  button: '#000000',
  border: '#E4E0DC',
  wordmark: 'bdp',
  logoUrl: '',
}

const STARTER_BLOCKS: Block[] = [
  { type: 'offerBar', text: '10% OFF EVERY ORDER FOR 3 MONTHS' },
  { type: 'logo' },
  {
    type: 'hero',
    headline: 'MEET [PRODUCT NAME].\nBUILT FOR YOUR NEXT RUN.',
    subline: 'From 10 units. Live tiered pricing. Tracked delivery in 5 to 14 business days.',
    imageUrl: '[Hero product image URL. Upload the shot in Studio, paste the link here.]',
    ctaText: 'BE FIRST',
    ctaUrl: 'https://www.bedifferentpackaging.com',
  },
  {
    type: 'text',
    heading: 'The problem isn\'t packaging. It\'s the 500 unit gamble to test one.',
    body: '[Two or three honest sentences on the format you\'re launching. What it holds, what it fits, what job it does that other formats miss. Real specifics, not fluff.]',
  },
  {
    type: 'bullets',
    title: 'What we build in (and what we leave out)',
    items: [
      'From 10 units. No 500 unit MOQ to test a format',
      'Live tiered pricing. No quote round trips or sales calls',
      'Tracked delivery in 5 to 14 business days (Air Express)',
      'Factory direct branding at 2,500+ units, 4 to 6 week lead time',
    ],
  },
  {
    type: 'timeline',
    title: 'What to expect when you order',
    steps: [
      { label: 'TODAY', text: 'Order online. Tiered pricing drops live as your quantity rises. No quote request.' },
      { label: '5-14 DAYS', text: 'Tracked delivery (Air Express). Duties settled at delivery for international orders.' },
      { label: '4 TO 6 WEEKS', text: 'Custom silk screen or hot stamp branding runs from 2,500 units, factory direct.' },
    ],
  },
  {
    type: 'text',
    heading: 'Three formats founders actually reach for.',
    body: 'Pick one to test at 10 units. Reorder what worked at tiered pricing. Move to branded runs when you\'re ready.',
  },
  {
    type: 'card',
    title: '30ML DROPPER',
    body: 'Best for serums, oils, and actives. Glass body, rubber teat, 100 or 500 ml stock in Cape Town.\n\n[One line on the current price tier or MOQ story.]',
    imageUrl: '[Dropper product shot URL. Studio hero on marble or linen.]',
    ctaText: 'BE STOCKED',
    ctaUrl: 'https://www.bedifferentpackaging.com',
  },
  {
    type: 'card',
    title: '50ML PUMP',
    body: 'Best for lotions, moisturisers, and body creams. Airless option available. Locks during transit.\n\n[One line on the current price tier or MOQ story.]',
    imageUrl: '[Pump product shot URL.]',
    ctaText: 'BE STOCKED',
    ctaUrl: 'https://www.bedifferentpackaging.com',
  },
  {
    type: 'card',
    title: '30G AMBER JAR',
    body: 'Best for balms, masks, and solid formulas. UV protection built in. Ships with the matching lid.\n\n[One line on the current price tier or MOQ story.]',
    imageUrl: '[Jar product shot URL.]',
    ctaText: 'BE STOCKED',
    ctaUrl: 'https://www.bedifferentpackaging.com',
  },
  {
    type: 'proof',
    quote: '[Paste a real customer review here. Never invent one.]',
    attribution: '[Real customer first name], [their brand]',
  },
  {
    type: 'bullets',
    title: 'Save 10% on every order for 3 months',
    items: [
      'Same order, same formats, delivered on schedule',
      '3 month minimum commitment. Cancel or change formats after that anytime',
      'One invoice, one contact, no reorder emails',
      'Guaranteed stock even when a format sells out',
    ],
    ctaText: 'BE ON REPEAT',
    ctaUrl: 'https://www.bedifferentpackaging.com',
  },
  {
    type: 'text',
    heading: 'We believe small brands deserve serious packaging.',
    body: 'Started on Etsy at 4.9 stars because small skincare brands kept getting quoted like they didn\'t matter. Every format we stock is one we\'d put our own product in.',
  },
]

const BLOCK_MENU: { type: string; label: string }[] = [
  { type: 'offerBar', label: 'Offer bar' },
  { type: 'marquee', label: 'Marquee strip' },
  { type: 'logo', label: 'Logo' },
  { type: 'hero', label: 'Hero' },
  { type: 'text', label: 'Text section' },
  { type: 'timeline', label: 'Timeline' },
  { type: 'iconRow', label: 'Icon row' },
  { type: 'storyImage', label: 'Story block' },
  { type: 'proof', label: 'Proof quote' },
  { type: 'card', label: 'Product card' },
  { type: 'bullets', label: 'Bullet list' },
  { type: 'comparison', label: 'Comparison table' },
]

const BG_OPTIONS: { key: string; label: string }[] = [
  { key: '', label: 'White (default)' },
  { key: 'sand', label: 'Sand panel' },
  { key: 'blush', label: 'Blush accent' },
]

function str(block: Block, key: string): string {
  return typeof block[key] === 'string' ? (block[key] as string) : ''
}

/** One-line summary for the collapsed block row. */
function blockSummary(block: Block): string {
  switch (block.type) {
    case 'offerBar':
    case 'marquee':
      return str(block, 'text') || '(empty)'
    case 'logo':
      return 'Logo / wordmark'
    case 'hero':
      return (str(block, 'headline').split('\n')[0] || '(no headline)').slice(0, 60)
    case 'text':
    case 'storyImage':
      return str(block, 'heading') || '(no heading)'
    case 'timeline': {
      const n = Array.isArray(block.steps) ? (block.steps as Block[]).length : 0
      return `${str(block, 'title') || 'Timeline'} · ${n} step${n === 1 ? '' : 's'}`
    }
    case 'iconRow': {
      const n = Array.isArray(block.items) ? (block.items as Block[]).length : 0
      return `${str(block, 'title') || 'Icon row'} · ${n} icon${n === 1 ? '' : 's'}`
    }
    case 'proof':
      return `"${(str(block, 'quote') || '').slice(0, 50)}${str(block, 'quote').length > 50 ? '…' : ''}"`
    case 'card':
      return str(block, 'title') || '(untitled card)'
    case 'bullets': {
      const n = Array.isArray(block.items) ? (block.items as string[]).length : 0
      return `${str(block, 'title') || 'Bullets'} · ${n} item${n === 1 ? '' : 's'}`
    }
    case 'comparison': {
      const n = Array.isArray(block.rows) ? (block.rows as Block[]).length : 0
      return `${str(block, 'title') || 'Comparison'} · ${n} row${n === 1 ? '' : 's'}`
    }
    default:
      return block.type
  }
}

export default function Emails() {
  const [designs, setDesigns] = useState<DesignSummary[]>([])
  const [designId, setDesignId] = useState<string | null>(null)
  const [name, setName] = useState('Product launch')
  const [subject, setSubject] = useState('meet [product name].')
  const [preheader, setPreheader] = useState('from 10 units. live pricing. tracked delivery in 5 to 14 business days.')
  const [brand, setBrand] = useState<Brand>(DEFAULT_BRAND)
  const [blocks, setBlocks] = useState<Block[]>(STARTER_BLOCKS)
  const [previewHtml, setPreviewHtml] = useState('')
  const [previewText, setPreviewText] = useState(false)
  const [previewTextContent, setPreviewTextContent] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [testTo, setTestTo] = useState('')
  const [market, setMarket] = useState('')
  const [audience, setAudience] = useState<number | null>(null)
  const [editorOpen, setEditorOpen] = useState(true)
  const [templatePick, setTemplatePick] = useState('')
  const [expandedBlock, setExpandedBlock] = useState<number | null>(null)
  const debounce = useRef<number>(undefined)

  const selectedTemplate = useMemo(
    () => EMAIL_TEMPLATES.find((t) => t.key === templatePick) ?? null,
    [templatePick],
  )

  function loadDesigns() {
    api<DesignSummary[]>('/api/email-designs').then(setDesigns).catch(() => {})
  }
  useEffect(loadDesigns, [])

  useEffect(() => {
    api<{ count: number }>(`/api/announcements/audience${market ? `?country=${market}` : ''}`)
      .then((r) => setAudience(r.count))
      .catch(() => setAudience(null))
  }, [market])

  // Live preview: server-rendered so preview === send, byte for byte.
  useEffect(() => {
    window.clearTimeout(debounce.current)
    debounce.current = window.setTimeout(() => {
      api<{ html: string; text: string }>('/api/email-designs/preview', {
        method: 'POST',
        body: JSON.stringify({
          preheader,
          brandJson: JSON.stringify(brand),
          blocksJson: JSON.stringify(blocks),
        }),
      })
        .then((r) => {
          setPreviewHtml(r.html)
          setPreviewTextContent(r.text)
        })
        .catch(() => {})
    }, 400)
    return () => window.clearTimeout(debounce.current)
  }, [blocks, brand, preheader])

  const hasPlaceholders =
    JSON.stringify(blocks).includes('[') || subject.includes('[') || preheader.includes('[')

  const persist = useCallback(async (): Promise<string> => {
    const payload = {
      name,
      subject,
      preheader,
      brandJson: JSON.stringify(brand),
      blocksJson: JSON.stringify(blocks),
    }
    if (designId) {
      await api(`/api/email-designs/${designId}`, { method: 'PATCH', body: JSON.stringify(payload) })
      return designId
    }
    const created = await api<{ id: string }>('/api/email-designs', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    setDesignId(created.id)
    return created.id
  }, [designId, name, subject, preheader, brand, blocks])

  async function run(fn: () => Promise<void>) {
    setError('')
    setNotice('')
    setBusy(true)
    try {
      await fn()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setBusy(false)
    }
  }

  function loadTemplate(templateKey: string) {
    const tpl = EMAIL_TEMPLATES.find((t) => t.key === templateKey)
    if (!tpl) return
    if (
      designId &&
      !confirm(
        `Load "${tpl.name}"? This replaces the current draft. The saved design "${name}" stays untouched on the server until you re-save.`,
      )
    )
      return
    setDesignId(null)
    setName(tpl.name)
    setSubject(tpl.subject)
    setPreheader(tpl.preheader)
    setBlocks(tpl.blocks as Block[])
    setBrand(tpl.brand ? { ...DEFAULT_BRAND, ...tpl.brand } : DEFAULT_BRAND)
    setExpandedBlock(null)
    setNotice(`Loaded "${tpl.name}". Fill the [brackets], set a real name, then save.`)
  }

  async function open(id: string) {
    const d = await api<{
      id: string
      name: string
      subject: string
      preheader: string
      brandJson: string
      blocksJson: string
    }>(`/api/email-designs/${id}`)
    setDesignId(d.id)
    setName(d.name)
    setSubject(d.subject)
    setPreheader(d.preheader)
    try {
      setBrand({ ...DEFAULT_BRAND, ...JSON.parse(d.brandJson) })
    } catch {
      setBrand(DEFAULT_BRAND)
    }
    try {
      setBlocks(JSON.parse(d.blocksJson))
    } catch {
      setBlocks([])
    }
    setExpandedBlock(null)
  }

  function updateBlock(index: number, patch: Record<string, unknown>) {
    setBlocks((prev) => prev.map((b, i) => (i === index ? { ...b, ...patch } : b)))
  }

  function move(index: number, delta: number) {
    setBlocks((prev) => {
      const next = [...prev]
      const target = index + delta
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
    if (expandedBlock === index) setExpandedBlock(index + delta)
    else if (expandedBlock === index + delta) setExpandedBlock(index)
  }

  function field(
    index: number,
    block: Block,
    key: string,
    label: string,
    multiline = false,
  ) {
    const props = {
      value: str(block, key),
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        updateBlock(index, { [key]: e.target.value }),
    }
    return (
      <div key={key} style={{ marginTop: 6 }}>
        <label style={{ margin: '4px 0 2px' }}>{label}</label>
        {multiline ? (
          <textarea style={{ minHeight: 70 }} {...props} />
        ) : (
          <input {...props} />
        )}
      </div>
    )
  }

  function bgField(index: number, block: Block) {
    return (
      <div style={{ marginTop: 6 }}>
        <label style={{ margin: '4px 0 2px' }}>Section background</label>
        <select
          value={str(block, 'bg')}
          onChange={(e) => updateBlock(index, { bg: e.target.value })}
        >
          {BG_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    )
  }

  function blockEditor(block: Block, index: number) {
    switch (block.type) {
      case 'offerBar':
        return field(index, block, 'text', 'Offer text (top bar. Real offers only)')
      case 'marquee':
        return field(index, block, 'text', 'Marquee text (repeats visually. e.g. "+ NEW LAUNCH + NEW LAUNCH +")')
      case 'logo':
        return <p className="muted">Shows your logo (set the URL in Brand) or the brand name.</p>
      case 'hero':
        return (
          <>
            {field(index, block, 'headline', 'Headline (one line per row. The benefit trio)', true)}
            {field(index, block, 'subline', 'Subline')}
            {field(index, block, 'imageUrl', 'Hero image URL (optional. Product hero on marble, linen, etc.)')}
            {field(index, block, 'ctaText', 'Button text')}
            {field(index, block, 'ctaUrl', 'Button URL')}
          </>
        )
      case 'text':
        return (
          <>
            {field(index, block, 'heading', 'Heading')}
            {field(index, block, 'body', 'Body', true)}
            {bgField(index, block)}
          </>
        )
      case 'iconRow': {
        const items = Array.isArray(block.items) ? (block.items as Block[]) : []
        return (
          <>
            {field(index, block, 'title', 'Title (optional)')}
            {items.map((item, ii) => (
              <div className="row" key={ii} style={{ marginTop: 6, alignItems: 'flex-start' }}>
                <input
                  style={{ width: 60 }}
                  placeholder="icon"
                  value={str(item, 'icon')}
                  onChange={(e) =>
                    updateBlock(index, {
                      items: items.map((s, j) => (j === ii ? { ...s, icon: e.target.value } : s)),
                    })
                  }
                />
                <input
                  placeholder="LABEL"
                  value={str(item, 'label')}
                  onChange={(e) =>
                    updateBlock(index, {
                      items: items.map((s, j) => (j === ii ? { ...s, label: e.target.value } : s)),
                    })
                  }
                />
              </div>
            ))}
            <button
              className="ghost"
              style={{ marginTop: 6 }}
              onClick={() => updateBlock(index, { items: [...items, { icon: '', label: '' }] })}
            >
              + icon
            </button>
            {bgField(index, block)}
          </>
        )
      }
      case 'storyImage':
        return (
          <>
            {field(index, block, 'imageUrl', 'Image URL (lifestyle or product, sits above the heading)')}
            {field(index, block, 'heading', 'Heading')}
            {field(index, block, 'body', 'Body', true)}
            {field(index, block, 'ctaText', 'Button text (optional)')}
            {field(index, block, 'ctaUrl', 'Button URL')}
            {bgField(index, block)}
          </>
        )
      case 'timeline': {
        const steps = Array.isArray(block.steps) ? (block.steps as Block[]) : []
        return (
          <>
            {field(index, block, 'title', 'Title')}
            {steps.map((step, si) => (
              <div className="row" key={si} style={{ marginTop: 6, alignItems: 'flex-start' }}>
                <input
                  style={{ width: 110 }}
                  placeholder="label"
                  value={str(step, 'label')}
                  onChange={(e) =>
                    updateBlock(index, {
                      steps: steps.map((s, j) => (j === si ? { ...s, label: e.target.value } : s)),
                    })
                  }
                />
                <input
                  placeholder="what happens"
                  value={str(step, 'text')}
                  onChange={(e) =>
                    updateBlock(index, {
                      steps: steps.map((s, j) => (j === si ? { ...s, text: e.target.value } : s)),
                    })
                  }
                />
              </div>
            ))}
            <button
              className="ghost"
              style={{ marginTop: 6 }}
              onClick={() => updateBlock(index, { steps: [...steps, { label: '', text: '' }] })}
            >
              + step
            </button>
          </>
        )
      }
      case 'proof':
        return (
          <>
            {field(index, block, 'quote', 'Quote (a REAL review. Never invented)', true)}
            {field(index, block, 'attribution', 'Attribution')}
          </>
        )
      case 'card':
        return (
          <>
            {field(index, block, 'title', 'Title')}
            {field(index, block, 'body', 'Body', true)}
            {field(index, block, 'imageUrl', 'Image URL (from the media library or site)')}
            {field(index, block, 'ctaText', 'Button text')}
            {field(index, block, 'ctaUrl', 'Button URL')}
          </>
        )
      case 'bullets': {
        const items = Array.isArray(block.items) ? (block.items as string[]) : []
        return (
          <>
            {field(index, block, 'title', 'Title')}
            {items.map((item, ii) => (
              <input
                key={ii}
                style={{ marginTop: 6 }}
                value={item}
                onChange={(e) =>
                  updateBlock(index, {
                    items: items.map((s, j) => (j === ii ? e.target.value : s)),
                  })
                }
              />
            ))}
            <button
              className="ghost"
              style={{ marginTop: 6 }}
              onClick={() => updateBlock(index, { items: [...items, ''] })}
            >
              + bullet
            </button>
            {field(index, block, 'ctaText', 'Button text (optional)')}
            {field(index, block, 'ctaUrl', 'Button URL')}
            {bgField(index, block)}
          </>
        )
      }
      case 'comparison': {
        const rows = Array.isArray(block.rows) ? (block.rows as Block[]) : []
        return (
          <>
            {field(index, block, 'title', 'Title (optional)')}
            {field(index, block, 'ourLabel', 'Our column label (defaults to your wordmark)')}
            {field(index, block, 'theirLabel', 'Their column label (defaults to "Typical supplier")')}
            {rows.map((row, ri) => (
              <div className="row" key={ri} style={{ marginTop: 6, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <input
                  style={{ width: 130 }}
                  placeholder="metric (e.g. MOQ)"
                  value={str(row, 'metric')}
                  onChange={(e) =>
                    updateBlock(index, {
                      rows: rows.map((r, j) => (j === ri ? { ...r, metric: e.target.value } : r)),
                    })
                  }
                />
                <input
                  style={{ width: 140 }}
                  placeholder="us"
                  value={str(row, 'ours')}
                  onChange={(e) =>
                    updateBlock(index, {
                      rows: rows.map((r, j) => (j === ri ? { ...r, ours: e.target.value } : r)),
                    })
                  }
                />
                <input
                  style={{ width: 140 }}
                  placeholder="them"
                  value={str(row, 'theirs')}
                  onChange={(e) =>
                    updateBlock(index, {
                      rows: rows.map((r, j) => (j === ri ? { ...r, theirs: e.target.value } : r)),
                    })
                  }
                />
              </div>
            ))}
            <button
              className="ghost"
              style={{ marginTop: 6 }}
              onClick={() => updateBlock(index, { rows: [...rows, { metric: '', ours: '', theirs: '' }] })}
            >
              + row
            </button>
            {bgField(index, block)}
          </>
        )
      }
      default:
        return null
    }
  }

  return (
    <>
      <h1>Emails</h1>
      <p className="subtitle">
        Designed marketing emails. The Lemme structure with your brand. Preview is the
        exact HTML that sends. Goes to engaged contacts only, under all the usual rails;
        the compliance footer and unsubscribe link are always added and can't be removed.
      </p>

      {/* Sticky toolbar: template picker, design meta, view toggles */}
      <div
        className="card"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          marginBottom: 12,
          background: 'var(--paper, #fff)',
          borderRadius: 0,
        }}
      >
        <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 }}>
          <div style={{ flex: '1 1 260px', minWidth: 220 }}>
            <label style={{ margin: '0 0 4px' }}>Start from a template</label>
            <div className="row" style={{ gap: 6 }}>
              <select
                style={{ flex: 1 }}
                value={templatePick}
                onChange={(e) => setTemplatePick(e.target.value)}
              >
                <option value="">— pick one —</option>
                {EMAIL_TEMPLATES.map((tpl) => (
                  <option key={tpl.key} value={tpl.key}>
                    {tpl.name}
                  </option>
                ))}
              </select>
              <button
                className="ghost"
                disabled={!templatePick}
                onClick={() => loadTemplate(templatePick)}
              >
                Load
              </button>
            </div>
            {selectedTemplate && (
              <p className="muted" style={{ margin: '6px 0 0', fontSize: 12 }}>
                {selectedTemplate.description}
              </p>
            )}
          </div>

          <div style={{ flex: '1 1 220px', minWidth: 200 }}>
            <label style={{ margin: '0 0 4px' }}>Design name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div style={{ flex: '0 1 200px', minWidth: 180 }}>
            <label style={{ margin: '0 0 4px' }}>Open saved</label>
            <select value="" onChange={(e) => e.target.value && open(e.target.value)}>
              <option value="">— saved designs —</option>
              {designs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div className="row" style={{ gap: 6, flex: '0 0 auto' }}>
            <button
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await persist()
                  loadDesigns()
                  setNotice('Saved ✓')
                })
              }
            >
              Save
            </button>
            <button
              className="ghost"
              onClick={() => {
                setDesignId(null)
                setName('New design')
                setBlocks(STARTER_BLOCKS)
                setSubject('new: [product name]. From 10 units')
                setPreheader('[One-line benefit with a timeframe]')
                setExpandedBlock(null)
              }}
            >
              New
            </button>
            <button className="ghost" onClick={() => setPreviewText((v) => !v)}>
              {previewText ? 'HTML' : 'Text'}
            </button>
            <button className="ghost" onClick={() => setEditorOpen((v) => !v)}>
              {editorOpen ? 'Hide editor' : 'Edit'}
            </button>
          </div>
        </div>

        {notice && <p className="status ok" style={{ marginTop: 8 }}>{notice}</p>}
        {error && <p className="error" style={{ marginTop: 8 }}>{error}</p>}
      </div>

      <div className="row" style={{ alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        {/* Preview: main stage */}
        <div style={{ flex: editorOpen ? '1 1 500px' : '1 1 100%', minWidth: 320 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              background: 'var(--sand, #efede9)',
              padding: 20,
              border: '1px solid var(--border, #e4e0dc)',
            }}
          >
            {previewText ? (
              <pre
                className="email-body"
                style={{
                  width: '100%',
                  maxWidth: 640,
                  height: '80vh',
                  overflow: 'auto',
                  background: '#fff',
                  padding: 20,
                  margin: 0,
                }}
              >
                {previewTextContent}
              </pre>
            ) : (
              <iframe
                title="email preview"
                srcDoc={previewHtml}
                style={{
                  width: '100%',
                  maxWidth: 680,
                  height: '82vh',
                  border: '1px solid var(--border, #e4e0dc)',
                  background: '#fff',
                }}
              />
            )}
          </div>
        </div>

        {/* Editor: side drawer */}
        {editorOpen && (
          <div style={{ flex: '1 1 500px', minWidth: 340 }}>
            <div className="card">
              <label style={{ marginTop: 0 }}>Subject</label>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} />
              <label>Preheader (inbox preview line)</label>
              <input value={preheader} onChange={(e) => setPreheader(e.target.value)} />
              <p className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                Subject + preheader are one two-line ad in the inbox.
              </p>
            </div>

            <details className="card">
              <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Brand</summary>
              <div className="row" style={{ flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
                {(
                  [
                    ['accent', 'Accent'],
                    ['bg', 'Background'],
                    ['card', 'Panel'],
                    ['ink', 'Text'],
                    ['muted', 'Muted'],
                    ['button', 'CTA'],
                    ['border', 'Borders'],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key}>
                    <label style={{ margin: '0 0 4px', fontSize: 11 }}>{label}</label>
                    <input
                      type="color"
                      value={brand[key]}
                      onChange={(e) => setBrand({ ...brand, [key]: e.target.value })}
                    />
                  </div>
                ))}
              </div>
              <div className="row" style={{ flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
                <div style={{ flex: '0 1 140px' }}>
                  <label>Wordmark</label>
                  <input
                    value={brand.wordmark}
                    onChange={(e) => setBrand({ ...brand, wordmark: e.target.value })}
                  />
                </div>
                <div style={{ flex: '1 1 220px' }}>
                  <label>Logo URL (overrides wordmark)</label>
                  <input
                    value={brand.logoUrl}
                    onChange={(e) => setBrand({ ...brand, logoUrl: e.target.value })}
                    placeholder="https://…/logo.png"
                  />
                </div>
              </div>
            </details>

            <div className="card" style={{ padding: 12 }}>
              <div className="row between" style={{ marginBottom: 8 }}>
                <strong>Blocks ({blocks.length})</strong>
                <span className="muted" style={{ fontSize: 12 }}>Click to edit</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {blocks.map((block, i) => {
                  const isOpen = expandedBlock === i
                  const label = BLOCK_MENU.find((b) => b.type === block.type)?.label ?? block.type
                  return (
                    <div
                      key={i}
                      style={{
                        border: '1px solid var(--border, #e4e0dc)',
                        background: isOpen ? 'var(--sand, #efede9)' : 'transparent',
                      }}
                    >
                      <div
                        className="row between"
                        style={{
                          padding: '8px 10px',
                          cursor: 'pointer',
                          alignItems: 'center',
                        }}
                        onClick={() => setExpandedBlock(isOpen ? null : i)}
                      >
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--muted, #6b6664)' }}>
                            {label}
                          </div>
                          <div
                            style={{
                              fontSize: 13,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {blockSummary(block)}
                          </div>
                        </div>
                        <span style={{ display: 'flex', gap: 4 }}>
                          <button
                            className="ghost"
                            title="Move up"
                            onClick={(e) => {
                              e.stopPropagation()
                              move(i, -1)
                            }}
                          >
                            ↑
                          </button>
                          <button
                            className="ghost"
                            title="Move down"
                            onClick={(e) => {
                              e.stopPropagation()
                              move(i, 1)
                            }}
                          >
                            ↓
                          </button>
                          <button
                            className="ghost"
                            title="Remove block"
                            onClick={(e) => {
                              e.stopPropagation()
                              setBlocks((prev) => prev.filter((_, j) => j !== i))
                              if (expandedBlock === i) setExpandedBlock(null)
                            }}
                          >
                            ✕
                          </button>
                        </span>
                      </div>
                      {isOpen && (
                        <div style={{ padding: '4px 10px 12px' }}>{blockEditor(block, i)}</div>
                      )}
                    </div>
                  )
                })}
              </div>

              <div style={{ marginTop: 12, borderTop: '1px solid var(--border, #e4e0dc)', paddingTop: 10 }}>
                <label style={{ marginTop: 0 }}>Add a block</label>
                <select
                  value=""
                  onChange={(e) => {
                    const type = e.target.value
                    if (!type) return
                    const newBlock: Block =
                      type === 'timeline'
                        ? { type, title: '', steps: [{ label: '', text: '' }] }
                        : type === 'bullets'
                          ? { type, title: '', items: [''] }
                          : type === 'iconRow'
                            ? { type, title: '', items: [{ icon: '', label: '' }] }
                            : type === 'comparison'
                              ? { type, title: '', rows: [{ metric: '', ours: '', theirs: '' }] }
                              : { type }
                    setBlocks((prev) => {
                      const next = [...prev, newBlock]
                      setExpandedBlock(next.length - 1)
                      return next
                    })
                  }}
                >
                  <option value="">+ add a block…</option>
                  {BLOCK_MENU.map((b) => (
                    <option key={b.type} value={b.type}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="card">
              <h2 style={{ marginTop: 0 }}>Send</h2>
              {hasPlaceholders && (
                <p className="muted">
                  Contains [placeholders]. Sending is blocked until every bracket is
                  replaced with real facts.
                </p>
              )}
              <div className="row" style={{ flexWrap: 'wrap' }}>
                <input
                  style={{ flex: '1 1 200px' }}
                  placeholder="your email for a test"
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                />
                <button
                  className="ghost"
                  disabled={busy || !testTo.includes('@')}
                  onClick={() =>
                    run(async () => {
                      const id = await persist()
                      await api('/api/announcements/test', {
                        method: 'POST',
                        body: JSON.stringify({ toEmail: testTo, designId: id }),
                      })
                      setNotice(`Test sent to ${testTo} ✓. Check it in a real inbox.`)
                    })
                  }
                >
                  Send test
                </button>
              </div>
              <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
                <select style={{ width: 'auto' }} value={market} onChange={(e) => setMarket(e.target.value)}>
                  {MARKETS.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <span className="muted">
                  {audience === null ? '…' : `${audience} engaged contact${audience === 1 ? '' : 's'}`}
                </span>
                <button
                  disabled={busy || hasPlaceholders || audience === 0}
                  onClick={() => {
                    if (!confirm(`Send "${subject}" to ${audience ?? '?'} engaged contact(s)?`)) return
                    run(async () => {
                      const id = await persist()
                      const r = await api<{ sent: number; skippedAlreadySent: number; note: string | null }>(
                        '/api/announcements',
                        {
                          method: 'POST',
                          body: JSON.stringify({ designId: id, country: market || null }),
                        },
                      )
                      setNotice(
                        `Sent ${r.sent}` +
                          (r.skippedAlreadySent ? ` · ${r.skippedAlreadySent} already had it` : '') +
                          (r.note ? ` · ${r.note}` : ''),
                      )
                    })
                  }}
                >
                  Send to engaged contacts
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
