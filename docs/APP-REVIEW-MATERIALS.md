# App Review materials (Meta, TikTok, Pinterest)

Everything the review forms ask for, pre-written. Copy-paste the text answers;
record the screencasts by following the shot lists (any screen recorder works —
Loom, OBS, or macOS/Windows built-in).

Replace `<WEB_URL>` with your live dashboard URL before submitting.

---

## Meta App Review

### Written usage descriptions (per permission)

**pages_show_list**
> Our app is a social media scheduling tool for small businesses. After a business
> owner connects their Facebook account via OAuth, we use pages_show_list to display
> the list of Pages they manage so they can choose which Pages to connect for
> publishing. The list is shown once at connection time and stored as the user's
> connected accounts.

**pages_manage_posts**
> Users compose posts (text and images) in our dashboard and schedule them for a
> future time. At the scheduled time, our server publishes the post to the user's own
> connected Facebook Page using pages_manage_posts. Posts are only ever created from
> explicit user action — the user writes the content and picks the time.

**pages_read_engagement**
> After a post is published, we display its performance (likes, comments, shares)
> back to the user in their dashboard so they can see how their own content performed.
> We read engagement only for posts our app published, on Pages the user connected.

**instagram_basic**
> Used at connection time to identify the Instagram professional account linked to the
> user's Facebook Page (account id, username, profile picture) so the user can confirm
> which Instagram account they are connecting for publishing.

**instagram_content_publish**
> Users compose image posts with captions in our dashboard and schedule them. At the
> scheduled time our server publishes to the user's own connected Instagram
> professional account via the content publishing API (media container + publish).
> Content is always user-authored; we respect the platform's publishing limits.

**instagram_manage_insights**
> After publishing, we show the user their own post's performance (impressions, likes,
> comments, shares) in their dashboard. Insights are read only for media our app
> published on the user's connected account.

**business_management**
> Required to reliably list and connect Pages and Instagram accounts owned through the
> user's Business Manager during the OAuth connection flow.

### Screencast shot list (one video, ~2 minutes)

1. Open `<WEB_URL>`, log in.
2. Go to **Connections** → click **Connect Facebook** → complete the Facebook OAuth
   dialog → land back on Connections showing the connected Page.
3. Click **Connect Instagram** → complete OAuth → show the connected IG account.
4. Go to **Composer** → select Facebook + Instagram → type a caption → attach an
   image from the media library → point at the live per-platform validation
   (character counts, media checks) → set a schedule time a few minutes out →
   **Schedule post**.
5. Go to **Calendar** → show the post as Scheduled.
6. (Cut, resume after publish time) Show the post now **Published** in the calendar,
   then show the actual post live on the Facebook Page and Instagram account.
7. Back on the **Dashboard**, show the Performance card with the post's metrics.

Recording tips: use a test user or your own account; make sure the browser shows the
OAuth dialogs fully (Meta reviewers specifically check the permission screens);
no music, no cuts during the OAuth flows.

---

## TikTok review

**App description**
> A social media scheduling dashboard for small businesses. Users connect their own
> TikTok creator account via OAuth, compose a video post with a caption, and schedule
> it. At the scheduled time our server publishes the video to the user's own account
> via the Content Posting API (PULL_FROM_URL). Nothing is posted without explicit
> user scheduling.

**Scope justifications**
- `user.info.basic`: shown at connection time so the user can confirm which TikTok
  account they connected (display name and avatar in their accounts list).
- `video.upload` / `video.publish`: publishing the user's own scheduled videos to
  their own account at the time they chose.

**Screencast shot list (~90 seconds)**
1. `<WEB_URL>` → Connections → Connect TikTok → OAuth dialog → connected account
   visible.
2. Composer → select TikTok → caption + attach a video → schedule.
3. Calendar showing Scheduled → (cut) → Published, then the video visible in the
   TikTok app (private/SELF_ONLY is expected pre-audit — say so in the submission
   notes: "video posts as private pending Direct Post audit approval").

---

## Pinterest Standard-access application

**What the app does**
> A scheduling dashboard where businesses compose pins (image, title, description,
> destination link) and schedule them to their own boards. Pins are created only from
> explicit user scheduling via the v5 API.

**Why Standard access**
> Trial access limits us to sandbox; our users need pins created on their real boards.
> We request boards:read/write and pins:read/write for creating user-authored pins and
> user_accounts:read to display the connected account.

**Screencast shot list (~60 seconds)**
1. Connect Pinterest via OAuth → account appears in Connections.
2. Compose with an image + link in the caption → schedule → Calendar shows it.
3. Show the created pin on the board (sandbox pin is fine for the application —
   mention it: "shown against Trial/sandbox; identical flow on Standard").

---

## Submission notes that prevent rejections

- Meta rejects vague descriptions — every answer above names the exact user action
  that triggers the API call. Don't shorten them to one line.
- The reviewer must be able to test: for Meta, add a **test user** under App Roles →
  Test Users with instructions in the review notes: "Log in at <WEB_URL> with
  [test credentials you create], go to Connections, connect the pre-linked test
  Page." Create that dashboard test account before submitting.
- If a form asks for a data-deletion URL: our privacy policy (`<WEB_URL>/privacy`)
  states disconnecting deletes tokens and full deletion is available on request —
  link the privacy page. (A dedicated deletion-callback endpoint ships with the
  WhatsApp phase; note it as "supported via contact + disconnect" for now.)
