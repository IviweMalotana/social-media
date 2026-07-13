# Deploying

Two services: the API on Railway (Docker + Postgres), the dashboard on Vercel (static).

## API → Railway

1. New project → **Deploy from GitHub repo** → pick this repo.
2. Service settings → Root Directory: `apps/api` (the Dockerfile there is used
   automatically). Railway injects `PORT`; the Dockerfile honours it.
3. Add a **PostgreSQL** database to the project.
4. Service → Variables:

```
ConnectionStrings__Default   ${{Postgres.DATABASE_URL}}  → convert to keyword form, see below
Jwt__Key                     output of: openssl rand -base64 48
TokenVault__Key              output of: openssl rand -base64 32
App__BaseUrl                 https://<railway-domain-or-custom-domain>
App__WebOrigin               https://<vercel-domain-or-custom-domain>
ASPNETCORE_ENVIRONMENT       Production
```

Npgsql wants keyword form, not a URL. From Railway's parts:
`Host=<PGHOST>;Port=<PGPORT>;Database=<PGDATABASE>;Username=<PGUSER>;Password=<PGPASSWORD>;SSL Mode=Require;Trust Server Certificate=true`

Platform credentials (`Platforms__Meta__AppId`, …) get added as they arrive — see
[PLATFORM-SETUP.md](PLATFORM-SETUP.md).

Optional — direct outreach sending via Resend (HTTPS API; Railway blocks SMTP ports):

```
Resend__ApiKey           re_... key from resend.com → API Keys
Email__FromAddress       e.g. ivy@bdpackaging.co — the DOMAIN must be verified in
                         Resend (Domains → Add Domain → add their SPF/DKIM records
                         at your DNS host, ADD alongside existing records)
Email__FromName          e.g. Be Different Packaging
Email__PhysicalAddress   postal address for the compliance footer
Email__DailyCap          default 50 — raise slowly as the domain warms up
```

Confirm with GET /api/email/status → {"transport":"resend"}; failures land in
GET /api/email/logs with Resend's error body (usually an unverified domain).

Optional — AI caption generation in the composer:

```
Anthropic__ApiKey            API key from console.anthropic.com (Settings → API keys)
Anthropic__Model             optional; defaults to claude-opus-4-8 (use claude-haiku-4-5 to cut cost)
```

5. Add a **volume** mounted at `/app/wwwroot/media` so uploaded media survives
   redeploys. (Object storage — Cloudflare R2 — replaces this before real scale.)

## Dashboard → Vercel

1. Import the repo → Root Directory: `apps/web` (framework: Vite, defaults are right).
2. Environment variable: `VITE_API_URL` = the API's public URL (no trailing slash).
3. Attach your custom domain, then set that domain as `App__WebOrigin` on Railway
   (CORS + OAuth redirects depend on it).

## Schema

First boot on a fresh database: set `Database__AutoCreate=true` and the API creates
the schema on startup. Leave it on until launch; EF migrations take over once the
model stabilises.
