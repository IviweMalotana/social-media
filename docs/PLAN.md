# Social Media Tool — Concept & Build Plan

A multi-tenant social media scheduling and advertising tool. Businesses connect their own
accounts via OAuth, compose posts once, and schedule them for publishing across
**Facebook, Instagram, TikTok, Pinterest, WhatsApp Business, and Google Ads** — with
insights and UTM tracking back to their storefront.

This is the standalone product repo. It talks to any external shop/catalogue (e.g. the BDP
API) over plain HTTP; it shares no database or deployment with anything else.

---

## 1. Product concept

**One composer, many platforms.** The user writes a post (text + media), picks target
platforms and accounts, and either publishes now or schedules it. The tool validates the
post against each platform's rules *at compose time* (media specs, caption length, rate
budgets) so failures happen in the editor, not at 3am when the job runs.

**Multi-tenant from day one.** A *Workspace* is the tenant. Each workspace has members,
connected social accounts, a media library, a content calendar, and its own rate-limit
budgets. You are workspace #1; other businesses are workspaces #2..n. This is the SaaS.

**Core loops:**
1. Connect — OAuth into each platform, tokens stored encrypted, auto-refreshed.
2. Compose — one draft, per-platform overrides (caption, first comment, pin board, etc.).
3. Schedule — calendar view, queue slots, best-time suggestions (later).
4. Publish — idempotent background jobs with retries and per-platform adapters.
5. Measure — pull insights per post, UTM links for storefront attribution.

## 2. Platform reality checks (verified)

These shape the architecture — don't skip them:

- **WhatsApp is not a feed.** There is no API for posting Status. The right product is
  **broadcast marketing messages** to opted-in customer lists using Meta-approved message
  templates, via the WhatsApp Business Platform (Cloud API). Other businesses connect
  their own WABA through **Embedded Signup**.
- **Every platform has an approval gate measured in weeks.** Meta App Review + business
  verification; TikTok Content Posting API **Direct Post audit** (unaudited apps can only
  post as private/self-visible); Pinterest **Standard access** (Trial tier is
  sandbox-only); Google Ads **developer token** application (Basic access). Submit all
  applications in week one, in parallel with coding.
- **Hard publish limits exist and must be budgeted client-side:** Instagram allows ~25
  API-published posts per rolling 24h per account; TikTok ~15/day per creator after
  audit. The tool tracks these budgets per connected account and warns at compose time.
- **Google Ads is not "posting".** It's campaign/ad-group/ad management. Phase 4 scopes
  it to: create/pause campaigns, budget control, and performance reporting — not a full
  Ads editor.

## 3. Architecture

Stack: **ASP.NET Core 8 API + Hangfire (background jobs) + PostgreSQL** (Railway/Neon),
**React + Vite + TypeScript dashboard** (Vercel). Same stack as the existing BDP apps so
everything stays familiar.

```
apps/
  api/        ASP.NET Core 8 — REST API, OAuth callbacks, Hangfire server
  web/        React + Vite + TS — dashboard, composer, calendar, connections
docs/         this plan, per-platform integration notes
```

### The adapter pattern (the heart of the tool)

Every platform sits behind one interface so the composer, calendar, publish pipeline,
and insights are platform-agnostic:

```csharp
public interface ISocialPlatformAdapter
{
    Platform Platform { get; }
    string GetAuthorizationUrl(ConnectContext ctx);          // start OAuth
    Task<ConnectedAccount> CompleteConnectionAsync(...);     // OAuth callback → tokens
    Task<TokenHealth> ValidateAsync(ConnectedAccount acct);  // token still good?
    ValidationResult ValidateDraft(PostDraft draft);         // compose-time rules
    Task<PublishResult> PublishAsync(PostTarget target);     // idempotent publish
    Task<PostInsights> FetchInsightsAsync(PostTarget target);
}
```

Adapters: `MetaAdapter` (Facebook Pages + Instagram — one OAuth app, two platforms),
`TikTokAdapter`, `PinterestAdapter`, `WhatsAppAdapter` (broadcasts, not posts),
`GoogleAdsAdapter` (campaigns, not posts — slightly different surface, same registry).

### Domain model

- `Workspace` — tenant; `WorkspaceMember` — user↔workspace with role.
- `ConnectedAccount` — platform, external account id/name, **encrypted** access +
  refresh tokens, expiry, scopes, health status.
- `MediaAsset` — uploaded image/video in object storage (Cloudflare R2/S3), with
  derived renditions per platform spec.
- `Post` — the draft: base caption + media refs + schedule time + status
  (`Draft → Scheduled → Publishing → Published / Failed`).
- `PostTarget` — one row per (post × connected account) with per-platform overrides,
  its own status, external post id, error info, and insights snapshot.
- `PublishAttempt` — audit log of every publish try (idempotency + debugging).

### Publish pipeline

Hangfire delayed job per `PostTarget` at schedule time → job re-checks status (idempotent,
safe to retry) → adapter publishes → exponential-backoff retries on transient failures →
terminal failure marks the target `Failed` with a human-readable reason and notifies the
workspace. Token refresh runs as a recurring job that sweeps accounts nearing expiry.

### Token vault

Tokens are AES-256-GCM encrypted at rest with a key from environment/KMS — never stored
plaintext, never logged, never returned by the API. Per-workspace isolation enforced in
every query (workspace id from auth context, not from request body).

## 4. Why direct integrations (not an aggregator)

Aggregators (Ayrshare, etc.) would shortcut the approvals but: per-account pricing kills
resale margin, you inherit their limits and outages, and you can't differentiate. For a
product being sold to other businesses, owning the platform apps and approvals *is* the
moat. The doc-of-record decision: direct integrations.

## 5. Build phases

- **Phase 0 — Foundations (this repo, now):** monorepo scaffold, domain model, adapter
  interface + stub adapters, token vault, Postgres + Hangfire wiring, auth (email +
  password → JWT, workspace switching), dashboard shell, **privacy policy + terms pages**
  (required by every platform app application). Submit all four platform applications.
- **Phase 1 — Meta:** Facebook Pages + Instagram publishing end-to-end. One OAuth, two
  platforms, best docs. Photo/video/reel/carousel, scheduling, insights.
- **Phase 2 — Pinterest + TikTok:** pins with boards + link; TikTok Direct Post
  (private-only until audit passes, then public).
- **Phase 3 — WhatsApp:** Embedded Signup, template management, opted-in contact lists,
  broadcast campaigns with per-message status webhooks.
- **Phase 4 — Google Ads:** developer token, connect customer accounts, campaign
  create/pause/budget + reporting.
- **Phase 5 — SaaS:** team roles + approval workflows, AI caption/variant generation,
  best-time scheduling, billing (Paystack), white-label option.

## 6. Platform application checklist (start week one)

| Platform | What to apply for | Blockers to prepare |
|---|---|---|
| Meta (FB+IG+WA) | App Review: `pages_manage_posts`, `instagram_content_publish`, `whatsapp_business_messaging` + Business Verification | Live domain, privacy policy, terms, demo video |
| TikTok | Content Posting API + Direct Post audit | App details, demo of post flow |
| Pinterest | Standard access tier | Working Trial-tier integration to show |
| Google Ads | Developer token (Basic access) | API design doc, live tool |

Until approvals land: build against test accounts (Meta test users, TikTok sandbox,
Pinterest trial tier) — the adapters don't change, only the audience of the tokens.

## 7. Non-goals (for now)

Inbox/DM management, listening/monitoring, X/Twitter, LinkedIn, YouTube, full Ads
editor. Each can be a later adapter — the architecture already allows it.
