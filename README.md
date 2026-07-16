# Social Media Scheduler

Multi-tenant social media scheduling and advertising tool. Businesses connect their own
accounts via OAuth, compose once, and schedule posts across **Facebook, Instagram,
TikTok, Pinterest, WhatsApp Business, and Google Ads**.

Read **[docs/PLAN.md](docs/PLAN.md)** first — it holds the full concept, the platform
reality checks (approval gates, rate limits, why WhatsApp is broadcasts not posts), and
the phased build plan.

## Layout

```
apps/api      ASP.NET Core 8 — REST API, OAuth, platform adapters, Hangfire job runner
apps/web      React + Vite + TypeScript — dashboard, composer, calendar, connections,
              and the Studio module (in-browser image editor with background removal,
              marketing templates, image-to-video). Ships as a single Vercel deploy.
docs/         concept & build plan
```

## Run locally (zero setup)

With no connection string configured, the API uses an in-memory database and in-memory
job storage — no Postgres needed to develop.

```bash
# API → http://localhost:5128 (Swagger at /swagger, Hangfire at /hangfire)
cd apps/api && dotnet run

# Web → http://localhost:5173 (proxies /api to the API)
cd apps/web && npm install && npm run dev
```

Register an account in the UI, then explore the composer — platform validation
(caption limits, media requirements, schedule sanity) runs live as you type.

## Run with Postgres

```bash
docker compose up -d postgres
ConnectionStrings__Default="Host=localhost;Database=socialmedia;Username=postgres;Password=postgres" \
  dotnet run --project apps/api
```

## Production configuration

| Setting | Purpose |
|---|---|
| `ConnectionStrings:Default` | Postgres (Railway/Neon) |
| `Jwt:Key` | Signing key — `openssl rand -base64 48` (required outside Development) |
| `TokenVault:Key` | 32-byte AES key for OAuth tokens — `openssl rand -base64 32` (required outside Development) |
| `App:BaseUrl` / `App:WebOrigin` | Public API url / dashboard origin for OAuth redirects + CORS |
| `Platforms:Meta:*`, `Platforms:TikTok:*`, `Platforms:Pinterest:*`, `Platforms:GoogleAds:*` | Per-platform app credentials |

## Where things stand

- ✅ Phase 0: domain model, adapter registry, token vault, publish pipeline (Hangfire),
  JWT auth + workspaces, compose-time validation, dashboard UI, privacy & terms pages.
- ✅ Media library: uploads (images/video) served from `wwwroot/media`, composer picker.
- ✅ OAuth flow: persisted CSRF state, multi-account callback upsert, reconnect handling.
- ✅ Phase 1 code: Meta adapter implemented end-to-end (code exchange → long-lived token
  → Page/IG discovery, Page feed/photo publish, IG container publish, `debug_token`
  health checks, insights). **Blocked only on Meta app credentials + App Review** —
  set `Platforms:Meta:AppId/AppSecret` and it goes live.
- ✅ Phase 2 code: TikTok adapter (OAuth + 24h token auto-refresh + Direct Post via
  PULL_FROM_URL, private-until-audited handled) and Pinterest adapter (OAuth + ~30d
  token refresh + pin creation with destination link). Blocked only on credentials.
- ✅ Insights pipeline: per-target impressions/likes/comments/shares refreshed every 6h
  for 30 days after publish, rolled up on the dashboard.
- ✅ Deploy configs: `apps/api/Dockerfile` (Railway), `apps/web/vercel.json` (Vercel) —
  see [docs/DEPLOY.md](docs/DEPLOY.md).
- ✅ AI content generator: "Generate with AI" in the composer writes per-platform
  caption variants (tone-selectable, platform rules respected, hashtags separated)
  via the Claude API. Enable with `Anthropic__ApiKey`.
- 🧪 In Development, `POST /api/dev/sandbox-accounts` seeds fake connected accounts so
  the composer/calendar/publish pipeline can be exercised without approvals.
- ⏳ Phase 3+: WhatsApp broadcasts, Google Ads.
- 👉 **Your move: [docs/PLATFORM-SETUP.md](docs/PLATFORM-SETUP.md)** — the exact
  checklist of accounts, approvals, and credentials only the business owner can create.
  Prefer hands-off? **[docs/CHROME-PROMPTS.md](docs/CHROME-PROMPTS.md)** has four
  copy-paste prompts that let Claude in Chrome drive the deploys and developer-app
  signups for you.
