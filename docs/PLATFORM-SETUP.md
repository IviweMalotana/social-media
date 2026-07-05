# What you need to do (and hand back) to go live

The code for Facebook, Instagram, TikTok, and Pinterest is already implemented. Every
item below is an account/approval only **you** can create because it's tied to your
identity and business. Work top to bottom — step 0 unblocks everything else.

**The hand-back list.** When a step produces a credential, set it in Railway as an
environment variable (never paste secrets into chat or commit them):

| Env var | From |
|---|---|
| `Platforms__Meta__AppId` / `Platforms__Meta__AppSecret` | Step 2 |
| `Platforms__TikTok__ClientKey` / `Platforms__TikTok__ClientSecret` | Step 3 |
| `Platforms__Pinterest__AppId` / `Platforms__Pinterest__AppSecret` | Step 4 |
| `Platforms__GoogleAds__ClientId` / `ClientSecret` / `DeveloperToken` | Step 5 |

---

## Step 0 — Deploy + domain (~1 hour, do first)

Every platform application requires a **live URL**, a **privacy policy URL**, and a
**terms URL**. Those pages already exist in the app (`/privacy`, `/terms`) — they just
need to be online.

1. Pick and buy a domain for the product (e.g. `yourtool.co.za`). The product needs its
   own identity — platform reviews look at it.
2. Deploy the API to **Railway**: new service from this repo, root directory `apps/api`
   (it has a Dockerfile), attach a Postgres database, and set the env vars from
   [DEPLOY.md](DEPLOY.md) (`ConnectionStrings__Default`, `Jwt__Key`, `TokenVault__Key`,
   `App__BaseUrl`, `App__WebOrigin`).
3. Deploy the dashboard to **Vercel**: import the repo, root directory `apps/web`,
   env var `VITE_API_URL` = the Railway API URL. Point your domain at it.

Now you have: `https://app.yourtool.co.za` (dashboard), `/privacy`, `/terms`, and an
API base URL — everything the applications ask for.

## Step 1 — Business paperwork (gathering, ~30 min)

Meta business verification will ask for: company registration document (CIPC if you're
registering in SA, or your sole-prop details), business address, business phone number,
and a business email on your domain. Have these ready as PDFs/scans.

## Step 2 — Meta (Facebook + Instagram + WhatsApp later) — the big one

1. Go to [developers.facebook.com](https://developers.facebook.com) → create a
   developer account with your Facebook login.
2. Create App → type **Business**. Add products: **Facebook Login for Business**.
3. In App Settings → Basic: fill in privacy policy URL, terms URL, app icon, category.
4. Facebook Login → Settings → Valid OAuth Redirect URIs — add:
   - `https://<api-domain>/api/connections/callback/Facebook`
   - `https://<api-domain>/api/connections/callback/Instagram`
   - `https://<api-domain>/api/connections/callback/WhatsApp`
5. Copy the **App ID** and **App Secret** → Railway env vars.
   Also in Facebook Login → Settings, set the **Data Deletion Request URL** to:
   `https://<api-domain>/api/meta/data-deletion` (the endpoint validates Meta's
   signed requests and returns the confirmation payload Meta requires).
6. Business settings → connect your Meta Business Portfolio → start **Business
   Verification** (uses Step 1 documents). Takes days to weeks.
7. App Review → request advanced access for: `pages_show_list`,
   `pages_manage_posts`, `pages_read_engagement`, `instagram_basic`,
   `instagram_content_publish`, `instagram_manage_insights`, `business_management`.
   You'll record a short screencast of the connect + publish flow — I can prep a
   script for it when you get there.

**Until approval:** add yourself as an app tester (App Roles) — everything works
against your own Pages/IG immediately with the App ID/Secret set. So you can be
posting to *your own* accounts as soon as step 5 is done.

## Step 3 — TikTok

1. [developers.tiktok.com](https://developers.tiktok.com) → create developer account →
   Manage apps → Create app.
2. Add the **Login Kit** and **Content Posting API** products; request scopes
   `user.info.basic`, `video.publish`, `video.upload`.
3. Redirect URI: `https://<api-domain>/api/connections/callback/TikTok`.
4. **Verify your media domain** (the API domain) under Content Posting API →
   the tool publishes via PULL_FROM_URL and TikTok only pulls from verified domains.
5. Copy **Client Key** and **Client Secret** → Railway env vars.
6. Submit the app for review, then apply for the **Direct Post audit**. Until the audit
   passes, posts land as **private (SELF_ONLY)** — the tool handles this automatically;
   flip `Platforms__TikTok__Audited=true` when approved.

## Step 4 — Pinterest

1. [developers.pinterest.com](https://developers.pinterest.com) → create an app
   (requires a Pinterest **business** account — convert yours if needed).
2. Redirect URI: `https://<api-domain>/api/connections/callback/Pinterest`.
3. Copy **App ID** and **App Secret** → Railway env vars. This gives **Trial access**
   (sandbox — full API, not visible publicly).
4. Apply for **Standard access** from the app dashboard once you can demo the working
   integration (screen recording of connect + pin creation).

## Step 5 — Google Ads (can wait — Phase 4)

1. You need a **Google Ads Manager Account (MCC)**: ads.google.com/home/tools/manager-accounts.
2. In the MCC: Tools → API Center → apply for a **developer token** (Basic access).
   The application asks what the tool does — answer: campaign scheduling and reporting
   for small businesses, OAuth per customer.
3. [console.cloud.google.com](https://console.cloud.google.com) → new project → OAuth
   consent screen (external) → create **OAuth Client ID** (web application) with
   redirect `https://<api-domain>/api/connections/callback/GoogleAds`.
4. Copy Client ID, Client Secret, Developer Token → Railway env vars.

## Step 6 — WhatsApp (can wait — Phase 3)

Rides on the Step 2 Meta app: add the **WhatsApp** product to it, complete business
verification, register a phone number for the WABA. Embedded Signup for other
businesses requires **Tech Provider** approval — that application opens after
business verification clears.

---

## Timeline reality

| Item | Wait time | Blocks |
|---|---|---|
| Deploy + domain | same day | everything |
| Meta App ID/Secret | same day | posting to your own accounts |
| Meta business verification + App Review | 1–4 weeks | other businesses connecting Meta |
| TikTok app review + Direct Post audit | 1–3 weeks | public TikTok posts |
| Pinterest Standard access | ~1 week | public pins |
| Google Ads developer token | 1–2 weeks | Google Ads phase |

The efficient order: **Step 0 today**, then submit 2, 3, 4 back-to-back so the waits
run in parallel. Everything after that is my side of the fence.
