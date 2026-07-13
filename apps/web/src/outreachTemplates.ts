/**
 * The playbook sequences. Sending happens in the dedicated outreach tool —
 * these live here so the pipeline can fill placeholders per prospect and copy
 * the right email for wherever it gets pasted. 3 emails, 3–4 days apart, then stop.
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

const first = (p: OutreachProspectLike) =>
  p.contactName.trim().split(/\s+/)[0] || 'there'

const SEQUENCES: Record<string, (p: OutreachProspectLike) => TemplateEmail[]> = {
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

SEQUENCES.spa = SEQUENCES.hotel

/**
 * US-first playbook copy: USD pricing, the Etsy 4.9-star US proof point, US shipping
 * days, and the custom-bulk lead for hotels/STR. Used for US/UK/international
 * prospects; ZA prospects keep the local sequences above.
 */
const US_SEQUENCES: Record<string, (p: OutreachProspectLike) => TemplateEmail[]> = {
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

US_SEQUENCES.spa = US_SEQUENCES.skincare_brand
US_SEQUENCES.intl_group = US_SEQUENCES.hotel

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

/** Best cold-email send window for a market, shown next to the sequence. */
export function sendWindow(country: string): string | null {
  if (country === 'US')
    return 'US window: Tue–Thu, 8:00–10:30am Eastern (≈2:00–4:30pm SAST)'
  if (country === 'UK') return 'UK window: Tue–Thu, 8:30–10:30am UK (≈9:30–11:30am SAST)'
  return null
}

export function getSequence(
  segment: string,
  p: OutreachProspectLike,
  country = 'ZA',
): TemplateEmail[] {
  const book = country === 'ZA' ? SEQUENCES : US_SEQUENCES
  return (book[segment] ?? book.hotel ?? SEQUENCES.hotel)(p)
}
