# Product brief — the Be Different Packaging revenue-ops tool

One page on what this system is, what it costs to run, and the economics
context for designing offers. Owner: Iviwe ("Ivi"). Business:
bedifferentpackaging.com — cosmetic/skincare packaging, South Africa, orders
from 10 units, custom branding from 2,500 units, 4.9★ Etsy seller history.

## What the tool is

Originally "PostDeck", a social scheduler concept; re-scoped into the
company's revenue-operations console. One login, one place for every
non-shop growth activity:

| Module | What it does | State |
|---|---|---|
| Composer + Calendar | Multi-platform posts, per-platform tailoring, AI captions with the jobs system | Live (publishing awaits platform app approvals) |
| Studio | Promo images (3 sizes) + short video, straight to media library | Live |
| Targets | Instrument panel: auto-tracked social/B2B metrics vs 90-day goals, per market | Live |
| Outreach | Cold B2B pipeline: prospects, sequences, stats, kill criteria | Live |
| Campaigns | Sequenced cold email engine: review queue, send windows, caps, suppression | Live, verified end-to-end |
| Announcements | One-off new-product emails to engaged B2B contacts only | Live |
| Articles | SEO article generator + editor + performance tracking | Live |
| Platform connections | OAuth adapters: Meta/IG done, TikTok/Pinterest done, WhatsApp/Google Ads stubs | Built; app-review track paused |

Deployment: API on Railway (project **humble-exploration**, service
`social-media`, Postgres attached, domain
social-media-production-1b66.up.railway.app), web on Vercel, email via
Resend from ivi@bedifferentpackaging.com. Shop (Next.js) is a separate
system; they share only the Resend account/domain.

## Running costs (estimates — check the actual bills monthly)

| Item | Est. monthly | Notes |
|---|---|---|
| Railway (API + Postgres + volume) | ~$5–15 | Usage-based; Hobby plan includes $5. Real number is in Railway → Usage. |
| Vercel (web) | $0 | Hobby tier covers this traffic comfortably. |
| Resend (email) | $0 | Free tier = 3,000/mo, 100/day. Our cap is 15/day ≈ 450/mo — deep inside free. Paid starts $20/mo at 50k. |
| Platform APIs (Meta, TikTok, Pinterest) | $0 | Free; costs start only when running paid ads. |
| Anthropic API (AI features) | ~$1–10 | Usage-based, see below. Requires Anthropic__ApiKey on Railway (not yet set). |
| Domain | already owned | — |
| **Total** | **≈ $6–25/mo** | Order of magnitude: a coffee budget, not a software budget. |

### AI usage math (current API pricing: Opus 4.8 $5 in / $25 out per 1M tokens)

The tool's default model is `claude-opus-4-8` (override with `Anthropic__Model`).

| Action | Rough tokens | Est. cost each |
|---|---|---|
| One article draft | ~2K in / ~2.5K out | ~$0.07 |
| One caption generation (2 variants × platforms) | ~1K in / ~1K out | ~$0.03 |
| One personalized email draft | ~1K in / ~0.5K out | ~$0.02 |

A heavy month (4 articles, 30 caption runs, 100 email drafts) ≈ **$3–5**.
Switching to `claude-haiku-4-5` ($1/$5) cuts that ~5× if quality holds —
worth testing on captions, keep Opus for articles.

## Why this matters for offers

The tool costs ~R150–450/month to run. One B2B account at R1,000/month pays
for the entire growth stack several times over — so the constraint on offers
is **product margin**, never tool cost. What the offer math actually needs
(and this repo does NOT know — lives with the owner/shop):

- Landed cost + margin per format (bottle/jar/dropper/pump) at each tier
- Shipping cost per order (ZA and US)
- Sample-kit cost (drives the free-sample-over-R___ threshold offer)

Rules of thumb for honest offers until real margins are entered:
threshold offers (free shipping / free sample kit over R X) beat percentage
discounts for AOV; bundle discounts should cost less than the margin gained
from the larger basket; never discount custom-branded runs (the 2,500+ lane
is the premium product); the standing repeat order IS the offer for B2B —
convenience, not discount.

## Where "what's working" lives

- **Targets page** — pace vs 90-day goals, per market
- **Outreach stats** — reply rate vs the 2%-by-200-sends kill criterion
- **Articles list** — sessions/month (manual, from shop analytics) + pin
  clicks (auto-attributed from Pinterest UTM links containing the slug)
- **Email logs + Resend webhooks** — delivered/bounced/complained per send
- Shop-side revenue attribution stays in the shop's analytics; this tool
  measures the top of the funnel it controls.
