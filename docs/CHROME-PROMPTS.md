# Claude-in-Chrome prompts for platform setup

Copy-paste these into Claude for Chrome, **in order** — Prompt 1 produces the two URLs
that Prompts 2–4 need. Each prompt is self-contained. Replace anything in `<ANGLE
BRACKETS>` before sending.

General rules baked into every prompt: Claude pauses and hands control back to you for
logins, 2FA, payments, and document uploads; secrets go straight into Railway variable
fields, never into the chat.

---

## Prompt 1 — Deploy API to Railway + dashboard to Vercel

```
You are helping me deploy a two-part app from my GitHub repo
IviweMalotana/social-media (branch: claude/social-media-scheduler-concept-ffac0d,
or main if it has been merged). Work step by step in the browser. Pause and hand
control back to me whenever a login, 2FA, payment method, or plan selection is
required, then continue.

PART A — Railway (the API):
1. Go to railway.app and open my dashboard (pause for login if needed).
2. New Project → Deploy from GitHub repo → select IviweMalotana/social-media.
   If Railway asks to install its GitHub app on the repo, walk me through granting it.
3. In the new service's Settings: set Root Directory to apps/api and the deploy
   branch to claude/social-media-scheduler-concept-ffac0d. It builds with the
   Dockerfile automatically.
4. In the project, click "+ New" → Database → PostgreSQL.
5. Open the Postgres service → Variables tab, and note the values of PGHOST,
   PGPORT, PGDATABASE, PGUSER, PGPASSWORD (do not read them out loud — just use
   them in the next step).
6. Back in the API service → Variables, add:
   - ConnectionStrings__Default =
     Host=<PGHOST>;Port=<PGPORT>;Database=<PGDATABASE>;Username=<PGUSER>;Password=<PGPASSWORD>;SSL Mode=Require;Trust Server Certificate=true
   - ASPNETCORE_ENVIRONMENT = Production
   - Database__AutoCreate = true
   - Jwt__Key = (pause here: ask me to run `openssl rand -base64 48` in a terminal
     and I will type the result directly into the Railway field myself)
   - TokenVault__Key = (same: I run `openssl rand -base64 32` and type it in myself)
7. Settings → Networking → Generate Domain. Note the public URL — call it API_URL.
8. Add one more variable: App__BaseUrl = API_URL (with https://, no trailing slash).
9. Settings → Volumes: add a volume mounted at /app/wwwroot/media.
10. Wait for the deployment to go green, then open API_URL/api/health in a new tab
    and confirm it returns {"status":"ok"}.

PART B — Vercel (the dashboard):
1. Go to vercel.com (pause for login if needed) → Add New → Project → import
   IviweMalotana/social-media.
2. Set Root Directory to apps/web. Framework preset: Vite. Set the production
   branch to claude/social-media-scheduler-concept-ffac0d if asked.
3. Environment variable: VITE_API_URL = API_URL from Part A (no trailing slash).
4. Deploy, note the public URL — call it WEB_URL.

PART C — tie them together:
1. Back in Railway → API service → Variables: add App__WebOrigin = WEB_URL.
2. Wait for the redeploy, then open WEB_URL, register a test account, and confirm
   the dashboard loads.

When done, give me a summary containing exactly: API_URL and WEB_URL, and confirm
that WEB_URL/privacy and WEB_URL/terms load — I need all of these for the platform
applications.
```

---

## Prompt 2 — Meta developer app (Facebook + Instagram)

```
You are helping me create a Meta developer app for my social media scheduling tool.
My dashboard is at <WEB_URL> and my API is at <API_URL> (from an earlier deploy).
Pause and hand control back to me for any login, 2FA, identity check, or document
upload, then continue.

1. Go to developers.facebook.com (pause for my Facebook login). If I don't have a
   developer account yet, walk through the registration.
2. Create App → use case: Other → app type: Business. Name it after my product
   (ask me what name I want before submitting).
3. In the app: Add Product → Facebook Login for Business → Settings. Under Valid
   OAuth Redirect URIs add exactly:
   - <API_URL>/api/connections/callback/Facebook
   - <API_URL>/api/connections/callback/Instagram
   - <API_URL>/api/connections/callback/WhatsApp
4. App Settings → Basic: set Privacy Policy URL to <WEB_URL>/privacy, Terms of
   Service URL to <WEB_URL>/terms, choose a category (Business and pages), and
   fill in the contact email with my email.
5. Still in Settings → Basic: the App ID is shown and the App Secret is behind a
   Show button (it may ask for my password — pause for me). DO NOT paste these
   values into this chat. Instead, open railway.app in another tab, go to my
   social-media project → the API service → Variables, and add:
   - Platforms__Meta__AppId = (the App ID)
   - Platforms__Meta__AppSecret = (the App Secret)
6. App Roles → Roles: confirm I am listed as Administrator.
7. Under App Review → Permissions and Features, request Advanced Access for:
   pages_show_list, pages_manage_posts, pages_read_engagement, instagram_basic,
   instagram_content_publish, instagram_manage_insights, business_management.
   If the form requires a screencast or written usage description, STOP there and
   list for me exactly what materials it wants — do not submit half-filled.
8. If a "Business verification required" banner appears, open the Business
   settings and start verification; pause for me at any document upload.

When done, summarise: app name, App ID (the ID is fine to say, the secret is not),
which permissions were requested vs. still pending materials, and verification
status. Remind me that with the credentials now in Railway I can already connect
my OWN Facebook Page and Instagram from <WEB_URL>/connections.
```

---

## Prompt 3 — TikTok developer app

```
You are helping me create a TikTok developer app for my social media scheduling
tool. My dashboard is at <WEB_URL> and my API is at <API_URL>. Pause and hand
control back to me for logins and any verification, then continue.

1. Go to developers.tiktok.com (pause for my TikTok login; register a developer
   account if needed).
2. Manage apps → Connect an app / Create app. Name it after my product (ask me
   for the name first). Fill in description: scheduling tool that lets businesses
   plan and publish their own TikTok videos. Set Terms URL <WEB_URL>/terms and
   Privacy Policy URL <WEB_URL>/privacy if asked.
3. Add products: Login Kit and Content Posting API.
4. In Login Kit settings, set the Redirect URI to exactly:
   <API_URL>/api/connections/callback/TikTok
5. Request/enable scopes: user.info.basic, video.publish, video.upload.
6. In the Content Posting API settings, find domain/URL verification for media
   pulls and start verification for the API domain (the host of <API_URL>). If it
   offers a signature file or DNS record, STOP and show me exactly what it wants —
   DNS records I will add myself with my registrar.
7. The app page shows a Client Key and Client Secret. DO NOT paste them into this
   chat. Open railway.app → my social-media project → API service → Variables and add:
   - Platforms__TikTok__ClientKey = (the Client Key)
   - Platforms__TikTok__ClientSecret = (the Client Secret)
8. Submit the app for review. If the submission form demands a demo video, STOP
   and list exactly what it requires instead of submitting.

When done, summarise: app status (draft/submitted), domain verification status and
any DNS/file steps I still owe, and remind me that until TikTok's Direct Post
audit passes, published videos are private (SELF_ONLY) — the tool already handles
that automatically.
```

---

## Prompt 4 — Pinterest developer app

```
You are helping me create a Pinterest developer app for my social media scheduling
tool. My dashboard is at <WEB_URL> and my API is at <API_URL>. Pause and hand
control back to me for logins and any verification, then continue.

1. Go to developers.pinterest.com (pause for my Pinterest login). If my account
   is not a business account, it will prompt to convert or create one — walk me
   through it (free).
2. Create/connect an app: name it after my product (ask me first), describe it as
   a scheduling tool where businesses publish pins to their own boards.
3. In the app settings, set the Redirect URI to exactly:
   <API_URL>/api/connections/callback/Pinterest
4. Ensure the requested scopes include: boards:read, boards:write, pins:read,
   pins:write, user_accounts:read.
5. The app page shows an App ID and App Secret. DO NOT paste them into this chat.
   Open railway.app → my social-media project → API service → Variables and add:
   - Platforms__Pinterest__AppId = (the App ID)
   - Platforms__Pinterest__AppSecret = (the App Secret)
6. Note the access tier. Trial access is expected at first (sandbox-only). If
   there is an option to apply for Standard access, open the application and STOP:
   list exactly what evidence it wants (usually a demo/screen recording) rather
   than submitting.

When done, summarise: app status, access tier, and what the Standard-access
application still needs from me.
```

---

## After all four prompts

Tell me (Claude Code) the API_URL and WEB_URL and what each application still has
pending. I'll then: point the OAuth flows at a real connect test on your own Meta
accounts, prep the App Review screencast scripts, and wire anything the reviews
kick back.
