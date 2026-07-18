# ⚠️ This repo has been merged into `bdp-management`

Everything here — the social posting API, campaigns/outreach engine, announcement +
designed emails, articles, the studio editor, and the web app — now lives in the
**`IviweMalotana/bdp-management`** monorepo (branch
`claude/social-messaging-integration-2b3mjn` until merged):

- API → `BDP.API/Social/` (routes under `/api/social/*`, same process as the shop API,
  own `social` Postgres schema, Hangfire jobs in-process)
- Web app → `BDP.Web/src/social/`, mounted at **admin.bedifferentpackaging.com/marketing**
  behind the normal staff login
- Tests → `BDP.API.Tests/Social/`

The full cutover checklist (env vars to copy, data migration into the shared database,
OAuth app re-registration, retiring this repo's Railway service and Vercel project) is in
**`bdp-management/docs/SOCIAL-MERGE.md`**.

Do not develop here. Once the cutover has run clean, archive this repository.
