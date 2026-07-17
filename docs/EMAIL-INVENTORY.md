# Be Different Packaging — Email inventory and design asset list

Everything the whole system will send, and every image asset a designer needs
to make it real. Use this as the brief.

**Legend:**
- **Lane** = which surface sends it (Campaigns page / Emails page / shop backend / SMS)
- **Trigger** = what fires it (schedule, action, event)
- **Design needed?** = yes (branded HTML) / no (plain text) / transactional (simple)
- **Image assets** = the specific shots a designer/Studio needs to produce

---

## Lane summary

| Lane | Purpose | Total email types | Design work needed |
|---|---|---|---|
| Cold outreach | Sequenced pitch to new prospects | 21 emails (7 sequences × 3 emails) | None. Plain text only. |
| Owned list broadcasts | Marketing to opted-in engaged contacts | 13 templates | 13 designs, 20 to 30 unique images |
| Shop automations | Behavior-triggered flows on bedifferentpackaging.com | 12 flows | 10 designs, 15 to 20 unique images |
| Transactional | Order lifecycle receipts and updates | 7 emails | 7 minimal designs (logo + text + optional hero) |
| SMS | Adjunct to email flows | 4 message types | Copywriting only, no images |

Total unique **email designs** to build: **30**
Total unique **product / lifestyle images** the designer needs to produce: **~40**

---

## LANE 1 — Cold outreach (21 emails, plain text)

Sent from Campaigns page. Per prospect: 3 emails, spaced 0 / +3 / +4 days.
Plain text only. No design work needed. Copy already exists in
`apps/web/src/outreachTemplates.ts`.

| # | Segment | Market | Angle | Emails | Design? |
|---|---|---|---|---|---|
| 1 | Hotel / Guesthouse | ZA | Warm intro | 3 | No |
| 2 | Hotel / Guesthouse | ZA | Direct question | 3 | No |
| 3 | Rental manager | ZA | Warm intro | 3 | No |
| 4 | Intl hotel group | ZA | Warm intro | 3 | No |
| 5 | Skincare brand | ZA | Warm intro | 3 | No |
| 6 | Skincare brand | ZA | Direct question | 3 | No |
| 7 | Hotel / Guesthouse | US | Warm intro | 3 | No |
| 8 | Hotel / Guesthouse | US | Direct question | 3 | No |
| 9 | Rental manager | US | Warm intro | 3 | No |
| 10 | Skincare brand | US | Warm intro | 3 | No |
| 11 | Skincare brand | US | Direct question | 3 | No |

Spa/Salon aliases to Hotel (ZA) and Skincare (US); Intl group US aliases to Hotel US.

**Assets needed:** none. Ivi's inbox signature only.

---

## LANE 2 — Owned list broadcasts (13 designed templates)

Sent from Emails page. Engaged contacts only (Replied / Interested /
SampleSent / Won). Designed HTML using the Email Designer block system.
Every image slot is currently `[bracketed]` in the templates and needs a
real URL before send.

### 2.1 Meet BDP (welcome)
- **Purpose:** first-touch for new opted-in subscribers, introduces range and offer
- **Trigger:** subscribe to list (fires as a one-off manual send when list first activates, then automated via welcome flow)
- **Cadence:** send once to each new subscriber
- **Design needed?** Yes, dense (~9 blocks)
- **Image assets:**
  1. Founder / lifestyle hero (Ivi or brand mood shot)
  2. Dropper family shot (3 sizes together on marble)
  3. Jar family shot (3 sizes together)
  4. Bottles + pumps family shot
  5. Optional: signature graphic ("Xo, Ivi")

### 2.2 New product launch
- **Purpose:** announce a new SKU or format entering the range
- **Trigger:** manual, per launch event
- **Cadence:** 3-beat sequence (tease day 0, launch day 3-5, momentum day 10-14)
- **Design needed?** Yes, densest (~12 blocks)
- **Image assets:**
  1. Hero product image (product on marble/linen with prop styling)
  2. Product isolated shot (clean, no bg)
  3. Lifestyle subscription image (packed shelf, brand-hero moment)
  4. Detail spec shot 1
  5. Detail spec shot 2

### 2.3 Coming soon waitlist
- **Purpose:** build anticipation before a product exists
- **Trigger:** manual, before launch
- **Cadence:** once per pre-launch
- **Design needed?** Yes (~9 blocks)
- **Image assets:**
  1. Concept product shot (mockup OK if the physical product isn't shot yet)
  2. Detail shot 1 (feature/spec close-up)
  3. Detail shot 2
  4. Detail shot 3

### 2.4 Quality / certification
- **Purpose:** proof-forward, explains a quality standard we hit
- **Trigger:** manual, when a certification is worth calling out
- **Cadence:** occasional
- **Design needed?** Yes (~10 blocks)
- **Image assets:**
  1. Hero product with certification badge overlay
  2. Certification badge or lab / factory photo
  3. (Icons only for 4 quality standards — no photos needed)

### 2.5 Back in stock
- **Purpose:** fast alert when a format restocks
- **Trigger:** stock event on shop
- **Cadence:** as needed
- **Design needed?** Yes, short (~7 blocks)
- **Image assets:**
  1. Product hero (single format that's back)

### 2.6 Plain founder note
- **Purpose:** pattern break, reply-driver
- **Trigger:** manual, ~2-3 times per month
- **Cadence:** alternates with designed sends
- **Design needed?** No (text-only)
- **Image assets:** none

### 2.7 Sale: announce (beat 1 of 2)
- **Purpose:** first beat of a real promo
- **Trigger:** manual, promo start
- **Cadence:** per promo event
- **Design needed?** Yes (~9 blocks)
- **Image assets:**
  1. Hero (product family or single hero with sale treatment)
  2. Reorder format 1 shot
  3. Reorder format 2 shot

### 2.8 Sale: last call (beat 2 of 2)
- **Purpose:** honest deadline nudge 24-48h before promo ends
- **Trigger:** manual, day before deadline
- **Cadence:** per promo event
- **Design needed?** Yes, short (~5 blocks)
- **Image assets:**
  1. Same hero as announce (consistency helps)

### 2.9 Replenishment reminder
- **Purpose:** notification-mockup format, prompts reorder
- **Trigger:** customer's typical reorder window hits
- **Cadence:** per customer, ongoing
- **Design needed?** Yes, medium (~7 blocks)
- **Image assets:** none required (icon-driven), but 1 subtle product texture bg would improve it

### 2.10 Winback (60-90d lapsed)
- **Purpose:** personal note to lapsed customer
- **Trigger:** customer hasn't ordered in 60-90 days
- **Cadence:** once per lapsed customer
- **Design needed?** Yes, mostly text (~4 blocks)
- **Image assets:** none

### 2.11 Useful: teach one decision
- **Purpose:** educational, zero hard sell, positions us as expert
- **Trigger:** manual, ~1 per month
- **Cadence:** monthly
- **Design needed?** Yes (~8 blocks)
- **Image assets:**
  1. Comparison hero (two formats side-by-side, e.g. dropper vs pump)
  2. Lifestyle image (someone testing/using packaging)

### 2.12 Post-purchase: what to expect
- **Purpose:** softens delivery anxiety, sets timeline
- **Trigger:** order placed
- **Cadence:** every order
- **Design needed?** Yes (~6 blocks)
- **Image assets:**
  1. Packing bench / behind-the-scenes photo (real BDP fulfillment shot)
  2. Repeat delivery lifestyle image

### 2.13 LEMME shape reference
- **Purpose:** structural reference only (not for sending)
- **Trigger:** never
- **Design needed?** No (uses placeholders on purpose)
- **Image assets:** none

---

## LANE 3 — Shop automations (12 flows, bedifferentpackaging.com side)

**These live on the shop, not in this tool.** But the DESIGN work is shared
because they use the same block templates.

### 3.1 Welcome series — Email 1 (immediate)
- **Purpose:** deliver signup discount + hero SKU intro
- **Trigger:** popup or footer signup
- **Cadence:** 0h after signup
- **Design needed?** Yes (short, ~5 blocks)
- **Image assets:**
  1. Welcome hero (already covered by 2.1 assets)
  2. Signup discount code graphic (optional)

### 3.2 Welcome series — Email 2 (+2 days)
- **Purpose:** education on the range
- **Trigger:** 2 days after signup
- **Cadence:** once
- **Design needed?** Yes (~6 blocks)
- **Image assets:** shares 2.1 family shots

### 3.3 Welcome series — Email 3 (+4 days)
- **Purpose:** social proof wall
- **Trigger:** 4 days after signup
- **Cadence:** once
- **Design needed?** Yes (~6 blocks)
- **Image assets:**
  1. 3 to 5 real customer product-in-use shots (with permission)

### 3.4 Welcome series — Email 4 (+6 days)
- **Purpose:** FAQ + discount code expiry nudge
- **Trigger:** 6 days after signup
- **Cadence:** once
- **Design needed?** Yes (~5 blocks)
- **Image assets:** shares 2.1 assets

### 3.5 Abandoned checkout — Email 1 (+4h)
- **Purpose:** first nudge with cart contents + testimonial
- **Trigger:** checkout started, not completed
- **Cadence:** 4h after abandon
- **Design needed?** Yes (~5 blocks)
- **Image assets:** dynamic (cart-item shots pulled from shop)

### 3.6 Abandoned checkout — Email 2 (+24h)
- **Purpose:** authority/credibility angle
- **Trigger:** cart still abandoned at 24h
- **Cadence:** once per abandonment
- **Design needed?** Yes (~5 blocks)
- **Image assets:** none new (uses hero from 2.1)

### 3.7 Abandoned checkout — Email 3 (+48h)
- **Purpose:** last call, small incentive OK
- **Trigger:** cart still abandoned at 48h
- **Cadence:** once
- **Design needed?** Yes (~4 blocks)
- **Image assets:** none new

### 3.8 Browse abandonment
- **Purpose:** viewed a PDP, didn't add to cart
- **Trigger:** product page view, no ATC within 24h
- **Cadence:** 1 email
- **Design needed?** Yes (~4 blocks)
- **Image assets:** dynamic (product shot from viewed page)

### 3.9 Review request (+10 days after delivery)
- **Purpose:** ask for a review
- **Trigger:** delivery + 10 days
- **Cadence:** once per order
- **Design needed?** Yes, short (~4 blocks)
- **Image assets:**
  1. Review-request illustration or friendly bench shot

### 3.10 Feature/affiliate invite (happy customers)
- **Purpose:** invite customer to be featured or refer
- **Trigger:** repeat purchase or high NPS
- **Cadence:** once per qualifying customer
- **Design needed?** Yes (~6 blocks)
- **Image assets:**
  1. Community/spotlight hero
  2. Existing customer-brand feature examples (with permission)

### 3.11 Replenishment reminder
- **Purpose:** covered by 2.9 template; fires automatically on shop side
- **Design needed?** Yes (uses 2.9 template)

### 3.12 Back in stock
- **Purpose:** covered by 2.5 template; fires automatically on shop side
- **Design needed?** Yes (uses 2.5 template)

### 3.13 Winback (60-90d)
- **Purpose:** covered by 2.10 template; fires automatically on shop side
- **Design needed?** Yes (uses 2.10 template)

---

## LANE 4 — Transactional (7 emails, shop side)

Simple. Logo + text + optional hero. Never touch marketing rails. Sent from
`orders@bedifferentpackaging.com`.

| # | Email | Trigger | Design |
|---|---|---|---|
| 4.1 | Order confirmation | Order placed | Logo + order summary + shipping estimate. Optional: one hero of the ordered items. |
| 4.2 | Shipping confirmation | Order shipped | Logo + tracking link + delivery estimate |
| 4.3 | Delivery confirmation | Order delivered | Logo + short "how'd it go" prompt + review link |
| 4.4 | Refund confirmation | Refund processed | Logo + amount + timeline |
| 4.5 | Standing order shipped | Recurring order fires | Logo + order summary + next-order date |
| 4.6 | Standing order upcoming | 7 days before recurring order | Logo + preview + "change anything?" CTA |
| 4.7 | Standing order cancelled / paused | User pauses or cancels | Logo + confirmation + "resume anytime" note |

**Image assets needed for transactional:**
- 1 clean logo (already have)
- 1 optional order-summary graphic template
- 1 standing-order icon or graphic

---

## LANE 5 — SMS (4 message types, adjunct)

Text only. No design. Copy already partially exists.

| # | Message | Trigger | Character budget |
|---|---|---|---|
| 5.1 | Abandoned checkout | 1h after abandon | Under 160 chars, one link |
| 5.2 | Back in stock | Restock event | Under 160 chars, one link |
| 5.3 | Replenishment | Reorder window hit | Under 160 chars, one link |
| 5.4 | Winback | 60-90d lapsed | Under 160 chars, one link |

---

## The image asset list (deduped)

Everything a designer needs to produce, once. Reused across templates.

### Product photography
1. **Dropper family** — 30ml, 50ml, 100ml lined up on marble
2. **Jar family** — amber, frosted, matte white on linen
3. **Bottles + pumps family** — pump, airless, sprayer variants
4. **All-formats line-up** — full range grouped, hero shot
5. **Dropper isolated** — clean bg, no props
6. **Pump isolated** — clean bg, no props
7. **Jar isolated** — clean bg, no props
8. **Bottle isolated** — clean bg, no props
9. **Comparison shot** — dropper vs pump side by side
10. **Comparison shot** — jar vs bottle side by side

### Lifestyle photography
11. **Founder / brand mood** — Ivi or brand vibe shot (parked to month 3)
12. **Packed shelf** — brand-ready shelf in a store or studio
13. **Packing bench** — behind-the-scenes fulfillment shot
14. **Hotel bathroom scene** — amenities in setting
15. **Skincare-brand shelf** — customer brand using our packaging (with permission)
16. **Somebody testing formulations** — hands + product

### Detail / macro
17. **Silk screen detail** — close-up of the finish
18. **Hot stamp detail** — close-up of the finish
19. **Dropper mechanism close-up**
20. **Pump lock/airless close-up**
21. **Amber glass UV protection close-up**
22. **Label / bottle-hand-shot** — Ivi's hand test (arm's length, mixed lighting)

### Compositions / hero shots
23. **New launch hero** — hero product with prop styling on gradient bg
24. **Sale hero** — product family with promo treatment
25. **Restock hero** — single format with "back in stock" energy
26. **Certification badge** — clean badge for quality template
27. **Comparison hero** — two formats with subtle divider

### Community / proof
28. **3 to 5 customer-brand shots** — indie brands using our packaging (with permission)
29. **Real customer review screenshots** — for proof cards (with permission)

### Optional / month 3+
30. **Signature graphic** — Ivi's handwritten "Xo" for founder emails
31. **Founder portrait** — for month-3 reveal
32. **Expert / authority photo** — cosmetics formulator or packaging engineer (when we retain one)

---

## Priority order for the designer (what to shoot first)

If you can only produce 5 sessions in the next month, do these in order:

1. **All-formats line-up + product family shots** (assets 1-4) — unlocks 8 templates
2. **Isolated product shots** (assets 5-8) — unlocks the card blocks
3. **New launch hero** (asset 23) — unlocks the workhorse template
4. **Packing bench + skincare-brand shelf** (assets 13, 15) — unlocks post-purchase + community
5. **Comparison shots** (assets 9-10) — unlocks the useful/educational template

Everything else is nice-to-have and can be added as we go.

---

## Ownership

- **Cold outreach copy** — lives in `apps/web/src/outreachTemplates.ts`, edit there
- **Owned-list templates** — live in `apps/web/src/emailTemplates.ts`, edit there
- **Shop automation flows** — configured on bedifferentpackaging.com (separate project)
- **Transactional emails** — configured on bedifferentpackaging.com (separate project)
- **SMS copy** — currently unbuilt, shop side when it exists

## Compliance checklist (every marketing send)

- Unsubscribe link + physical address (16 Beach Road, Strand, Cape Town, 7140) in every marketing email
- Never send marketing from `orders@` (hard-blocked in code)
- Suppression list checked on every send (no exceptions)
- `[bracketed]` placeholders block send until filled
- Reviews used must be real and permissioned
- Deadlines and stock claims must be literally true
- Custom-brand mockups (when Studio ships them) must be visibly labeled as concepts
