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
