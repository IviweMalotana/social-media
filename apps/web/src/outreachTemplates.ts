/**
 * The playbook sequences. Sending happens in the dedicated outreach tool.
 * These live here so the pipeline can fill placeholders per prospect and
 * copy the right email wherever it gets pasted. 3 emails, spaced 0/+3/+4
 * days, then stop.
 *
 * Structure: LIBRARY[market][segment][angle] returns the 3-email sequence.
 *   angle 'warm'   -> genuine-line opener ("Came across X. [genuine line].")
 *   angle 'direct' -> question-hook opener (a hyper-specific problem posed
 *                     as a question, per Format 6 in the ad-creative skill).
 *
 * Voice rules (strict, copy them when adding or editing):
 *   - Short sentences. Periods, not em dashes.
 *   - Numbers over adjectives ("10 units" beats "small quantities").
 *   - One question per email. One ask.
 *   - Group-chat texture. Contractions. No "genuinely", "resonates with",
 *     "worth a look", "just wanted to", "circle back", "one thing I should
 *     have led with", "brief follow-up on my last one". Those are AI tells.
 *   - One [bracketed] line per email for real per-prospect research. The
 *     send engine blocks approval until it's filled.
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
// ZA - warm intro (genuine-line opener)
// -----------------------------------------------------------------------------

const ZA_WARM: Record<string, SequenceBuilder> = {
  hotel: (p) => [
    {
      subject: `amenity bottles for ${p.companyName}`,
      body: `Hi ${first(p)},

Came across ${p.companyName}. [one genuine specific line about the property].

Quick one about your guest amenities. Are you refilling generic bottles, or paying big MOQs for branded minis?

We supply refill bottles from 10 units. Same order delivered on repeat. One invoice.

Want pricing for the sizes you use?

Ivi
Be Different Packaging`,
    },
    {
      subject: `re: amenity bottles`,
      body: `Hi ${first(p)},

Following up.

Live tiered pricing on the site. Slide the quantity up, watch the unit price drop. No quote back-and-forth.

If amenities aren't your call, could you point me at whoever handles buying?

Ivi`,
    },
    {
      subject: `last one from me`,
      body: `Hi ${first(p)},

Leaving you be after this.

If packaging ever gets annoying (reorders, minimums, waiting on quotes), we're at bedifferentpackaging.com. Happy to send a small sample set to ${p.companyName}.

Good luck for the season.

Ivi`,
    },
  ],

  rental_manager: (p) => [
    {
      subject: `amenity packaging across your ${p.city || 'portfolio'} properties`,
      body: `Hi ${first(p)},

You're running a proper portfolio in ${p.city || 'your area'}. Which usually means someone on the team is re-buying amenity bottles and dispensers unit by unit.

We supply that on repeat. Pick the products once. Same order delivered monthly or quarterly. One invoice. From 10 units, scales to thousands.

Want pricing for the formats you stock?

Ivi
Be Different Packaging`,
    },
    {
      subject: `re: amenity packaging`,
      body: `Hi ${first(p)},

Quick follow-up.

One account. One invoice. Every property on the same cycle. The teams we supply stopped tracking amenity purchases per unit.

If this sits with someone else, a quick intro would help.

Ivi`,
    },
    {
      subject: `last one from me`,
      body: `Hi ${first(p)},

Closing the loop.

When amenity supply becomes the annoying line item, we're at bedifferentpackaging.com. Samples for the formats you use, on request.

All the best with the portfolio.

Ivi`,
    },
  ],

  intl_group: (p) => [
    {
      subject: `custom-branded packaging, 4-6 week lead`,
      body: `Hi ${first(p)},

Branded in-room packaging is one of those details guests photograph at ${p.companyName} properties. Most suppliers want huge MOQs or four-month lead times.

We produce custom silk-screen or hot-stamp branded bottles and jars from 2,500 units. Factory-direct in 4-6 weeks. One point of contact end to end.

Can I send a short line sheet with formats and per-unit pricing?

Ivi
Be Different Packaging`,
    },
    {
      subject: `re: custom-branded packaging`,
      body: `Hi ${first(p)},

Following up.

Recent one. A boutique group moved from stock minis to hot-stamped 50ml bottles across three properties. One order. 4-week turnaround. Per-unit cost below their previous unbranded supply.

Happy to ship a sample of the finish quality. Where should I send it?

Ivi`,
    },
    {
      subject: `last one from me`,
      body: `Hi ${first(p)},

Last note.

When branded packaging comes up in your next refresh, we're at bedifferentpackaging.com. From 2,500 units. 4-6 weeks. Factory-direct.

Thanks for your time.

Ivi`,
    },
  ],

  skincare_brand: (p) => [
    {
      subject: `packaging from 10 units for ${p.companyName}`,
      body: `Hi ${first(p)},

Came across ${p.companyName}. [one genuine line about their range].

Most packaging suppliers make small brands buy 500+ units per SKU. We start at 10. Droppers, jars, pumps, bottles. Tiered pricing that drops as you grow.

Want pricing for the formats you'd use?

Ivi
Be Different Packaging`,
    },
    {
      subject: `re: packaging from 10 units`,
      body: `Hi ${first(p)},

Quick follow-up.

The brands we supply usually start with a 10-50 unit test order. Check fit and finish. Then move to repeat orders as they scale. Live pricing on the site.

If packaging buying sits with someone else, could you point me their way?

Ivi`,
    },
    {
      subject: `last one from me`,
      body: `Hi ${first(p)},

Leaving it here.

When your next run needs bottles or jars without a 500-unit commitment, we're at bedifferentpackaging.com. Samples if you want them.

Good luck with the brand.

Ivi`,
    },
  ],
}

// -----------------------------------------------------------------------------
// ZA - direct (question-hook opener)
// -----------------------------------------------------------------------------

const ZA_DIRECT: Record<string, SequenceBuilder> = {
  hotel: (p) => [
    {
      subject: `guests keep pocketing your amenity bottles?`,
      body: `Hi ${first(p)},

Guests keep pocketing your amenity bottles? That's a compliment.

Two things. Guests photograph (or take) the bottles when they're properly branded. Reorders eat up someone's Tuesday every month.

We handle both. Refill bottles from 10 units on repeat. Custom branding from 2,500 units in 4-6 weeks.

One thing about ${p.companyName}: [one genuine specific line about the property].

Which is the bigger headache right now?

Ivi
Be Different Packaging`,
    },
    {
      subject: `re: amenity bottles that stay branded`,
      body: `Hi ${first(p)},

One more note.

If refills are the bigger pain, we set a standing order. Same items. Same schedule. No reorder emails.

If it's the branded feel, samples land in about a week.

Which is more useful right now?

Ivi`,
    },
    {
      subject: `last one from me`,
      body: `Hi ${first(p)},

Leaving you be.

When amenity packaging becomes the annoying line item, we're at bedifferentpackaging.com. Happy to ship samples any time.

All the best for the season.

Ivi`,
    },
  ],

  skincare_brand: (p) => [
    {
      subject: `launching soon and no bottles yet?`,
      body: `Hi ${first(p)},

Launching soon and no bottles yet?

Most indie skincare brands hit the same wall. Suppliers want 500+ units to test one product.

We start at 10. Droppers, jars, pumps, bottles. Live pricing on the site. Slide the quantity up, the unit price drops.

About ${p.companyName}: [one genuine specific line about their range or launch].

Want the link to the format you'd use?

Ivi
Be Different Packaging`,
    },
    {
      subject: `re: bottles from 10 units`,
      body: `Hi ${first(p)},

Following up.

The brands we supply usually start with a 10-50 unit test order. Then move to repeat orders once they scale. Same site. Same pricing.

If packaging buying sits with someone else, could you point me their way?

Ivi`,
    },
    {
      subject: `last one from me`,
      body: `Hi ${first(p)},

Leaving it here.

When MOQ pain hits (usually right before a launch), we're at bedifferentpackaging.com. Samples on request.

Good luck with ${p.companyName}.

Ivi`,
    },
  ],
}

// -----------------------------------------------------------------------------
// US - warm intro
// -----------------------------------------------------------------------------

const US_WARM: Record<string, SequenceBuilder> = {
  skincare_brand: (p) => [
    {
      subject: `packaging from 10 units for ${p.companyName}`,
      body: `Hi ${first(p)},

Came across ${p.companyName}. [one genuine specific line about their product or aesthetic].

Quick one. When you test a new product, are you stuck buying 500+ bottles for decent unit pricing?

We supply cosmetic bottles, jars, and droppers from 10 units. Live tiered pricing on the site. No quote requests.

Most of our customers are US indie brands. We came up on Etsy at 4.9 stars and ship to the US in [X] days.

Want the link to the formats you'd use?

Ivi
Be Different Packaging`,
    },
    {
      subject: `re: packaging from 10 units`,
      body: `Hi ${first(p)},

One thing to add.

You can watch the unit price drop as you slide the quantity up. No sales rep. No "request a quote."

Planning a spring or summer launch? Testing at 10-50 units before a big run is exactly what we're built for.

Ivi`,
    },
    {
      subject: `last one from me`,
      body: `Hi ${first(p)},

Leaving you be.

If MOQ pain ever hits, we're at bedifferentpackaging.com. Good luck with ${p.companyName}.

Ivi`,
    },
  ],

  hotel: (p) => [
    {
      subject: `custom-branded amenities, 4-6 week lead`,
      body: `Hi ${first(p)},

Guests photograph the details at properties like ${p.companyName}. Branded amenity packaging is one of them. Most custom suppliers want massive MOQs or quarter-long lead times.

We produce silk-screen or hot-stamp branded bottles and jars from 2,500 units. Factory-direct in 4-6 weeks. One contact end to end.

Can I send a one-page line sheet with formats and per-unit USD pricing?

Ivi
Be Different Packaging`,
    },
    {
      subject: `re: custom-branded amenities`,
      body: `Hi ${first(p)},

Quick follow-up.

I can ship a small sample set to the property this week. Takes 5 minutes to say yes and you'll have the finish quality in hand before any commitment.

Where should I send it?

Ivi`,
    },
    {
      subject: `last one from me`,
      body: `Hi ${first(p)},

Last note.

The line sheet with formats and per-unit USD tiers is at bedifferentpackaging.com whenever you want it. When branded packaging comes up in your next refresh, we're 4-6 weeks away.

Thanks for your time.

Ivi`,
    },
  ],

  rental_manager: (p) => [
    {
      subject: `amenity packaging across your ${p.city || 'portfolio'} properties`,
      body: `Hi ${first(p)},

Managing a portfolio in ${p.city || 'your market'} means someone on your team is re-buying dispensers and amenity bottles unit by unit.

We supply that on repeat. Pick the formats once. Same order delivered on schedule. One invoice.

At portfolio volumes we can custom-brand them with your logo (2,500+ units, 4-6 weeks, factory-direct).

Want pricing for the formats you stock?

Ivi
Be Different Packaging`,
    },
    {
      subject: `re: amenity packaging across your portfolio`,
      body: `Hi ${first(p)},

Quick follow-up.

The math operators we supply care about. One account. One invoice. Every unit on the same cycle. Branded dispensers guests don't walk off with as souvenirs.

If procurement sits with someone else, a quick intro would help.

Ivi`,
    },
    {
      subject: `last one from me`,
      body: `Hi ${first(p)},

Closing the loop.

When amenity supply becomes the annoying line item, we're at bedifferentpackaging.com. Happy to ship samples of the formats you stock.

All the best with the portfolio.

Ivi`,
    },
  ],
}

// -----------------------------------------------------------------------------
// US - direct (question-hook opener)
// -----------------------------------------------------------------------------

const US_DIRECT: Record<string, SequenceBuilder> = {
  skincare_brand: (p) => [
    {
      subject: `stuck buying 500 units to test one product?`,
      body: `Hi ${first(p)},

Stuck buying 500 units to test one product?

That's the tax most cosmetic packaging suppliers charge indie brands.

We start at 10. Live tiered pricing on the site (slide the quantity up, unit price drops). No quote requests. Custom silk-screen and hot-stamp branding kicks in at 2,500.

About ${p.companyName}: [one genuine specific line about their range or brand story].

Want to try this on your next SKU?

Ivi
Be Different Packaging`,
    },
    {
      subject: `re: 10-unit MOQs`,
      body: `Hi ${first(p)},

Following up.

Most of our US customers came from our Etsy days (4.9 stars) and stayed once they saw the tiered pricing. Test at 10. Scale at 500. Brand at 2,500. Same supplier through all three stages.

Want the direct link to the formats you'd use?

Ivi`,
    },
    {
      subject: `last one from me`,
      body: `Hi ${first(p)},

Done pestering.

Whenever MOQ pain shows up, we're at bedifferentpackaging.com. Rooting for ${p.companyName}.

Ivi`,
    },
  ],

  hotel: (p) => [
    {
      subject: `your amenity bottles look like everyone else's?`,
      body: `Hi ${first(p)},

Your amenity bottles look like everyone else's?

At most properties I visit, in-room amenities are generic unbranded stock. Guests notice when the rest of the design is deliberate.

We hot-stamp or silk-screen brand cosmetic bottles from 2,500 units. Factory-direct. 4-6 weeks. Per-unit USD pricing you can plan against. One point of contact end to end.

One thing about ${p.companyName}: [one genuine specific line about the property].

Can I send a one-page line sheet?

Ivi
Be Different Packaging`,
    },
    {
      subject: `re: branded amenities for ${p.companyName}`,
      body: `Hi ${first(p)},

Quick follow-up.

I can put a small sample set in the mail this week. Takes 5 minutes to say yes and you'll have the finish quality in hand before any commitment.

Where should I ship it?

Ivi`,
    },
    {
      subject: `last one from me`,
      body: `Hi ${first(p)},

Last note.

When branded amenity packaging comes up in your next refresh (2,500 units, 4-6 weeks, factory-direct, one contact), we're at bedifferentpackaging.com.

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
  { key: 'warm', label: 'Warm intro', note: 'Genuine-line opener. "Came across X. [one specific thing]."' },
  { key: 'direct', label: 'Direct question', note: 'Question-hook opener. A hyper-specific problem posed as a question.' },
]

const ANGLE_KEYS = new Set(ANGLES.map((a) => a.key))

/** Best cold-email send window for a market, shown next to the sequence. */
export function sendWindow(country: string): string | null {
  if (country === 'US')
    return 'US window: Tue-Thu, 8:00-10:30am Eastern (about 2:00-4:30pm SAST)'
  if (country === 'UK') return 'UK window: Tue-Thu, 8:30-10:30am UK (about 9:30-11:30am SAST)'
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

/** Which angles exist for this market x segment (in ANGLES order). */
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
 * Every (market x segment x angle) tuple that exists in the library, rendered
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
