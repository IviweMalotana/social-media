/**
 * The playbook sequences. Sending happens in the dedicated outreach tool —
 * these live here so the pipeline can fill placeholders per prospect and copy
 * the right email for wherever it gets pasted. 3 emails, 3–4 days apart, then stop.
 *
 * Structure: LIBRARY[market][segment][angle] → 3-email sequence.
 *   angle 'warm'   → genuine-line opener ("I came across X — [genuine line]…")
 *   angle 'direct' → question-hook opener (Format 6 in the ad-creative skill:
 *                    "[hyper-specific moment this week]?")
 *
 * Both angles carry the same honesty pattern: one [bracketed] research line
 * per prospect that the send engine blocks on until filled.
 */

export interface OutreachProspectLike {
  companyName: string
  contactName: string
  city: string
}

interface TemplateEmail {
  subject: string
  body: string
}

type SequenceBuilder = (p: OutreachProspectLike) => TemplateEmail[]

const first = (p: OutreachProspectLike) =>
  p.contactName.trim().split(/\s+/)[0] || 'there'

// -----------------------------------------------------------------------------
// ZA — warm intro (the original sequences)
// -----------------------------------------------------------------------------

const ZA_WARM: Record<string, SequenceBuilder> = {
  hotel: (p) => [
    {
      subject: `amenity bottles for ${p.companyName}`,
      body: `Hi ${first(p)},

I came across ${p.companyName} — [one genuine specific line about the property].

Quick question: how are you currently handling your guest amenity bottles and refills? Most guesthouses we talk to are either overpaying for branded minis or emailing suppliers for quotes every quarter.

We're a South African packaging supplier — you pick your bottles once, set the quantity, and get the same order delivered and invoiced on repeat. No minimums that force you to overstock (we start at 10 units).

Worth a quick look? I can send pricing for the sizes you use.

Ivi
Be Different Packaging`,
    },
    {
      subject: `re: amenity bottles for ${p.companyName}`,
      body: `Hi ${first(p)} — following up briefly.

One thing that resonates with the hotels we supply: live tiered pricing on the site. You slide the quantity up and watch the unit price drop — no "request a quote" back-and-forth.

If amenities aren't your department, could you point me to whoever handles purchasing?

Ivi`,
    },
    {
      subject: `last one from me`,
      body: `Hi ${first(p)},

I'll leave you be after this. If packaging ever becomes a headache — reordering, minimums, quotes — we're at bedifferentpackaging.com. Happy to send a small sample set to ${p.companyName} if useful.

Either way, good luck for the season ahead.

Ivi`,
    },
  ],

  rental_manager: (p) => [
    {
      subject: `packaging across your ${p.city || 'portfolio'} properties`,
      body: `Hi ${first(p)},

You're managing what looks like a serious portfolio of properties in ${p.city || 'your area'} — which usually means someone on your team is buying amenity bottles and dispensers over and over for every unit.

We supply exactly that, on repeat: pick the products once, we deliver the same order monthly or quarterly, invoiced to one account. Starts at 10 units, scales to thousands.

Would it make sense to send pricing for the formats you stock across your properties?

Ivi
Be Different Packaging`,
    },
    {
      subject: `re: packaging across your ${p.city || 'portfolio'} properties`,
      body: `Hi ${first(p)} — quick follow-up.

One account, one invoice, every property stocked on the same cycle. The teams we supply stopped tracking amenity purchases per-unit entirely.

If this sits with someone else on the team, a quick intro would be appreciated.

Ivi`,
    },
    {
      subject: `last one from me`,
      body: `Hi ${first(p)},

Closing the loop — if amenity supply ever becomes the annoying line item, we're at bedifferentpackaging.com. Happy to send samples for the formats you use.

All the best with the portfolio.

Ivi`,
    },
  ],

  intl_group: (p) => [
    {
      subject: `custom-branded amenity packaging, 4–6 week lead time`,
      body: `Hi ${first(p)},

For a group like ${p.companyName}, branded in-room packaging is one of those details guests photograph — but most suppliers want enormous MOQs or 4-month lead times.

We produce custom silk-screen or hot-stamp branded bottles and jars from 2,500 units, delivered factory-direct in 4–6 weeks, with one point of contact end to end.

Could I send over a short line sheet with formats and per-unit pricing tiers?

Ivi
Be Different Packaging`,
    },
    {
      subject: `re: custom-branded packaging for ${p.companyName}`,
      body: `Hi ${first(p)} — following up.

Recent example: a boutique group moved from stock minis to hot-stamped 50ml bottles across 3 properties — one order, 4-week turnaround, per-unit cost below their previous unbranded supply.

Happy to ship a sample of the finish quality to your office. Where should I send it?

Ivi`,
    },
    {
      subject: `last one from me`,
      body: `Hi ${first(p)},

Last note from me. When branded packaging comes up in your next product refresh, we're at bedifferentpackaging.com — from 2,500 units, 4–6 weeks, factory-direct.

Thanks for your time.

Ivi`,
    },
  ],

  skincare_brand: (p) => [
    {
      subject: `packaging from 10 units for ${p.companyName}`,
      body: `Hi ${first(p)},

Came across ${p.companyName} — [one genuine line about their range].

Most packaging suppliers make small brands buy 500+ units per SKU. We start at 10 — droppers, jars, pumps, bottles — with tiered pricing that drops as you grow into bigger runs.

Worth a look for your next production run? I can send pricing for the formats you use.

Ivi
Be Different Packaging`,
    },
    {
      subject: `re: packaging from 10 units`,
      body: `Hi ${first(p)} — quick follow-up.

The brands we supply usually start with a 10–50 unit order to test fit and finish, then move to repeat orders as they scale. No quote round-trips — live pricing on the site.

If packaging buying sits with someone else, could you point me their way?

Ivi`,
    },
    {
      subject: `last one from me`,
      body: `Hi ${first(p)},

I'll leave it here. When your next run needs bottles or jars without a 500-unit commitment, we're at bedifferentpackaging.com. Samples available.

Good luck with the brand — it looks great.

Ivi`,
    },
  ],
}

// -----------------------------------------------------------------------------
// ZA — direct (question-hook opener; Format 6 from the ad-creative skill)
// -----------------------------------------------------------------------------

const ZA_DIRECT: Record<string, SequenceBuilder> = {
  hotel: (p) => [
    {
      subject: `guests keep pocketing your amenity bottles?`,
      body: `Hi ${first(p)},

Small thing about ${p.companyName} — [one genuine specific line about the property].

Two things come up with hotels we supply: guests photograph (or walk off with) the amenity bottles when they're properly branded, and reorders eat up someone's Tuesday every month.

We do both — refill bottles from 10 units on repeat, and custom silk-screen or hot-stamp branding from 2,500 units in 4–6 weeks. One account, one contact end to end.

Worth a quick look?

Ivi
Be Different Packaging`,
    },
    {
      subject: `re: amenity bottles that stay branded`,
      body: `Hi ${first(p)} — one more note.

If refills are the bigger pain, we can set a standing order — same items, same schedule, no reorder emails. If it's the branded feel, samples arrive in about a week.

Which is more useful right now?

Ivi`,
    },
    {
      subject: `last one from me`,
      body: `Hi ${first(p)},

I'll leave you be after this. When amenity packaging becomes the annoying line item — reorders or branding — we're at bedifferentpackaging.com. Happy to ship samples any time.

All the best for the season.

Ivi`,
    },
  ],

  skincare_brand: (p) => [
    {
      subject: `launching soon and no bottles yet?`,
      body: `Hi ${first(p)},

Quick question about ${p.companyName} — [one genuine specific line about their range or launch].

When you're testing a new product, are you stuck ordering 500+ units just to get workable unit pricing? Most small suppliers make you.

We start at 10 units — droppers, jars, pumps, bottles — with live tiered pricing on the site. No quote round-trips.

Worth a look before your next run?

Ivi
Be Different Packaging`,
    },
    {
      subject: `re: bottles from 10 units`,
      body: `Hi ${first(p)} — thought I'd send one more note.

The brands we supply usually start with a 10–50 unit test order to check fit and finish, then scale up as they grow. Same site, same pricing, no renegotiation.

If packaging buying sits with someone else, could you point me their way?

Ivi`,
    },
    {
      subject: `last one from me`,
      body: `Hi ${first(p)},

I'll leave you be. When MOQ pain hits — usually right before a launch — we're at bedifferentpackaging.com. Samples on request.

Good luck with ${p.companyName}, genuinely.

Ivi`,
    },
  ],
}

// -----------------------------------------------------------------------------
// US — warm intro (the original US sequences)
// -----------------------------------------------------------------------------

const US_WARM: Record<string, SequenceBuilder> = {
  skincare_brand: (p) => [
    {
      subject: `packaging from 10 units for ${p.companyName}`,
      body: `Hi ${first(p)},

Came across ${p.companyName} — [one genuine specific line about their product/aesthetic].

Quick question: when you test a new product, are you stuck buying 500+ bottles to get decent unit pricing?

We supply cosmetic bottles, jars and droppers from 10 units — live tiered pricing on the site, no quote requests. Most of our customers are US indie brands (4.9-star average from our Etsy days), and we ship to the US in [X] days.

Worth a look for your next launch? Happy to send the link to the exact formats you use.

Ivi
Be Different Packaging`,
    },
    {
      subject: `re: packaging from 10 units`,
      body: `Hi ${first(p)} — one thing I should have led with: you can watch the unit price drop live as you slide the quantity up. No sales rep, no "request a quote."

If you're planning a spring/summer launch, testing packaging at 10–50 units before committing to a big run is exactly what we're built for.

Ivi`,
    },
    {
      subject: `last one from me`,
      body: `Hi ${first(p)} — I'll leave you be after this. If MOQ pain ever hits, we're at bedifferentpackaging.com. Good luck with ${p.companyName} — genuinely rooting for the small guys.

Ivi`,
    },
  ],

  hotel: (p) => [
    {
      subject: `custom-branded amenities for ${p.companyName}, 4–6 week lead`,
      body: `Hi ${first(p)},

Guests photograph the details at properties like ${p.companyName} — and branded in-room packaging is one of them. But most custom suppliers want massive MOQs or quarter-long lead times.

We produce silk-screen or hot-stamp branded bottles and jars from 2,500 units, delivered factory-direct to you in 4–6 weeks, one contact end to end.

Can I send a one-page line sheet with formats and per-unit USD pricing?

Ivi
Be Different Packaging`,
    },
    {
      subject: `re: custom-branded amenities for ${p.companyName}`,
      body: `Hi ${first(p)} — quick follow-up.

I can ship a small sample set to the property this week — takes 5 minutes to say yes, and you'll have the finish quality in hand before any commitment.

Where should I send it?

Ivi`,
    },
    {
      subject: `last one from me`,
      body: `Hi ${first(p)},

Last note from me — the line sheet with formats and per-unit USD tiers is yours any time at bedifferentpackaging.com. When branded packaging comes up in your next refresh, we're a 4–6 week turnaround away.

Thanks for your time.

Ivi`,
    },
  ],

  rental_manager: (p) => [
    {
      subject: `amenity packaging across your ${p.city || 'portfolio'} properties`,
      body: `Hi ${first(p)},

Managing a portfolio in ${p.city || 'your market'} means someone on your team is re-buying dispensers and amenity bottles constantly, unit by unit.

We supply that on repeat — pick the formats once, get the same order delivered on schedule, one invoice. And at portfolio volumes, we can custom-brand them with your logo (2,500+ units, 4–6 weeks, factory-direct).

Worth sending pricing for the formats you stock?

Ivi
Be Different Packaging`,
    },
    {
      subject: `re: amenity packaging across your portfolio`,
      body: `Hi ${first(p)} — quick follow-up.

The math the operators we supply care about: one account, one invoice, every unit stocked on the same cycle — and branded dispensers guests don't walk off with as souvenirs.

If procurement sits with someone else, a quick intro would be appreciated.

Ivi`,
    },
    {
      subject: `last one from me`,
      body: `Hi ${first(p)},

Closing the loop — when amenity supply becomes the annoying line item, we're at bedifferentpackaging.com. Happy to ship samples of the formats you stock.

All the best with the portfolio.

Ivi`,
    },
  ],
}

// -----------------------------------------------------------------------------
// US — direct (question-hook opener)
// -----------------------------------------------------------------------------

const US_DIRECT: Record<string, SequenceBuilder> = {
  skincare_brand: (p) => [
    {
      subject: `stuck buying 500 units to test one product?`,
      body: `Hi ${first(p)},

Genuine question about ${p.companyName} — [one genuine specific line about their range or brand story].

When you launch a new SKU, do you have to commit to 500+ bottles just to get a workable unit price? That's the tax most cosmetic packaging suppliers charge indie brands.

We start at 10 units, with live tiered pricing on the site (slider drops the unit price as you increase the quantity) and no quote requests. Custom silk-screen/hot-stamp branding kicks in at 2,500.

Worth a look for your next launch?

Ivi
Be Different Packaging`,
    },
    {
      subject: `re: 10-unit MOQs`,
      body: `Hi ${first(p)} — brief follow-up.

Most of our US customers came from our Etsy days (4.9★ average) and stayed once they saw the tiered pricing. Testing at 10, scaling at 500, branding at 2,500 — same supplier, all three stages.

If you'd like the direct link to the formats you'd use, happy to send.

Ivi`,
    },
    {
      subject: `last one from me`,
      body: `Hi ${first(p)} — done pestering.

Whenever MOQ pain shows up, we're at bedifferentpackaging.com. Genuinely rooting for ${p.companyName}.

Ivi`,
    },
  ],

  hotel: (p) => [
    {
      subject: `your amenity bottles look like everyone else's?`,
      body: `Hi ${first(p)},

Small thing about ${p.companyName} — [one genuine specific line about the property].

At most properties I visit, in-room amenity bottles are unbranded generic — which guests notice, especially when the rest of the design is deliberate.

We hot-stamp or silk-screen brand cosmetic bottles from 2,500 units, factory-direct, 4–6 week lead time. One point of contact end to end, per-unit USD pricing you can plan against.

Can I send a one-page line sheet?

Ivi
Be Different Packaging`,
    },
    {
      subject: `re: branded amenities for ${p.companyName}`,
      body: `Hi ${first(p)} — quick follow-up.

I can put a small sample set in the mail this week — takes 5 minutes to say yes, and you'll have the finish quality in hand before any commitment.

Where should I ship it?

Ivi`,
    },
    {
      subject: `last one from me`,
      body: `Hi ${first(p)},

Last note. When branded amenity packaging comes up in your next refresh — 2,500 units, 4–6 weeks, factory-direct, one contact — we're at bedifferentpackaging.com.

Thanks for your time.

Ivi`,
    },
  ],
}

// -----------------------------------------------------------------------------
// Library assembly + segment aliases
// -----------------------------------------------------------------------------

interface AngleMap {
  warm?: SequenceBuilder
  direct?: SequenceBuilder
}

const LIBRARY: Record<string, Record<string, AngleMap>> = {
  ZA: {
    hotel: { warm: ZA_WARM.hotel, direct: ZA_DIRECT.hotel },
    rental_manager: { warm: ZA_WARM.rental_manager },
    intl_group: { warm: ZA_WARM.intl_group },
    skincare_brand: { warm: ZA_WARM.skincare_brand, direct: ZA_DIRECT.skincare_brand },
  },
  US: {
    hotel: { warm: US_WARM.hotel, direct: US_DIRECT.hotel },
    rental_manager: { warm: US_WARM.rental_manager },
    skincare_brand: { warm: US_WARM.skincare_brand, direct: US_DIRECT.skincare_brand },
  },
}

// Spa uses the same voice as hotel (ZA) / skincare (US)
LIBRARY.ZA.spa = LIBRARY.ZA.hotel
LIBRARY.US.spa = LIBRARY.US.skincare_brand
// Intl group on the US side falls back to hotel copy
LIBRARY.US.intl_group = LIBRARY.US.hotel

export const SEGMENTS = [
  { key: 'hotel', label: 'Hotel / Guesthouse' },
  { key: 'spa', label: 'Spa / Salon' },
  { key: 'rental_manager', label: 'Rental manager' },
  { key: 'skincare_brand', label: 'Skincare brand' },
  { key: 'intl_group', label: 'Intl hotel group' },
]

export const MARKETS = [
  { key: '', label: 'All markets' },
  { key: 'ZA', label: '🇿🇦 South Africa' },
  { key: 'US', label: '🇺🇸 United States' },
  { key: 'UK', label: '🇬🇧 United Kingdom' },
]

export const ANGLES = [
  { key: 'warm', label: 'Warm intro', note: 'Genuine-line opener — "I came across X — [one specific thing]…"' },
  { key: 'direct', label: 'Direct question', note: 'Question-hook opener — a hyper-specific problem posed as a question.' },
]

const ANGLE_KEYS = new Set(ANGLES.map((a) => a.key))

/** Best cold-email send window for a market, shown next to the sequence. */
export function sendWindow(country: string): string | null {
  if (country === 'US')
    return 'US window: Tue–Thu, 8:00–10:30am Eastern (≈2:00–4:30pm SAST)'
  if (country === 'UK') return 'UK window: Tue–Thu, 8:30–10:30am UK (≈9:30–11:30am SAST)'
  return null
}

function resolve(country: string, segment: string, angle: string): SequenceBuilder {
  const market = LIBRARY[country] ?? LIBRARY.ZA
  const seg = market[segment] ?? market.hotel ?? LIBRARY.ZA.hotel
  return seg[angle as keyof AngleMap] ?? seg.warm ?? LIBRARY.ZA.hotel.warm!
}

export function getSequence(
  segment: string,
  p: OutreachProspectLike,
  country = 'ZA',
  angle: string = 'warm',
): TemplateEmail[] {
  return resolve(country, segment, angle)(p)
}

export interface CampaignStepTemplate {
  delayDays: number
  subject: string
  body: string
}

/**
 * The same sequence rendered with the server's merge-field syntax
 * ({{firstName}}, {{companyName}}, {{city}}), for pre-filling campaign steps.
 * Cadence delays follow the playbook: send now, +3 days, +4 days.
 */
export function getSequenceTemplate(
  segment: string,
  country = 'ZA',
  angle: string = 'warm',
): CampaignStepTemplate[] {
  const merge: OutreachProspectLike = {
    companyName: '{{companyName}}',
    contactName: '{{firstName}}',
    city: '{{city}}',
  }
  return getSequence(segment, merge, country, angle).map((email, i) => ({
    delayDays: i === 0 ? 0 : i === 1 ? 3 : 4,
    subject: email.subject,
    body: email.body,
  }))
}

/** Which angles exist for this market × segment (in ANGLES order). */
export function availableAngles(country: string, segment: string): string[] {
  const seg = LIBRARY[country]?.[segment] ?? LIBRARY.ZA[segment] ?? LIBRARY.ZA.hotel
  return ANGLES.filter((a) => seg[a.key as keyof AngleMap]).map((a) => a.key)
}

export interface SequenceRow {
  market: string
  segment: string
  angle: string
  emails: TemplateEmail[]
}

/**
 * Every (market × segment × angle) tuple that exists in the library, rendered
 * against a sample prospect so the gallery can preview readable copy without
 * showing raw {{merge}} tokens.
 */
export function listAllSequences(sample: OutreachProspectLike): SequenceRow[] {
  const rows: SequenceRow[] = []
  for (const marketOpt of MARKETS) {
    if (!marketOpt.key) continue
    const market = marketOpt.key
    for (const segOpt of SEGMENTS) {
      const seg = LIBRARY[market]?.[segOpt.key]
      if (!seg) continue
      for (const angleKey of Object.keys(seg)) {
        if (!ANGLE_KEYS.has(angleKey)) continue
        const builder = seg[angleKey as keyof AngleMap]
        if (!builder) continue
        rows.push({
          market,
          segment: segOpt.key,
          angle: angleKey,
          emails: builder(sample),
        })
      }
    }
  }
  return rows
}
