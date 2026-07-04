# Social Media Scheduler

Multi-tenant social media scheduling and advertising tool. Businesses connect their own
accounts via OAuth, compose once, and schedule posts across **Facebook, Instagram,
TikTok, Pinterest, WhatsApp Business, and Google Ads**.

Read **[docs/PLAN.md](docs/PLAN.md)** first — it holds the full concept, the platform
reality checks (approval gates, rate limits, why WhatsApp is broadcasts not posts), and
the phased build plan.

## Layout

```
apps/api   ASP.NET Core 8 — REST API, OAuth, platform adapters, Hangfire job runner
apps/web   React + Vite + TypeScript — dashboard, composer, calendar, connections
docs/      concept & build plan
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
- ⏳ Phase 1+: real OAuth exchanges and publishing per platform — see the phase list and
  the platform application checklist in [docs/PLAN.md](docs/PLAN.md). **Submit the four
  platform applications first; approvals take weeks and gate everything.**
