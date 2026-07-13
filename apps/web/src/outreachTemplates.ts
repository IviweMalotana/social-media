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

Ivy
Be Different Packaging`,
    },
    {
      subject: `re: amenity bottles for ${p.companyName}`,
      body: `Hi ${first(p)} — following up briefly.

One thing that resonates with the hotels we supply: live tiered pricing on the site. You slide the quantity up and watch the unit price drop — no "request a quote" back-and-forth.

If amenities aren't your department, could you point me to whoever handles purchasing?

Ivy`,
    },
    {
      subject: `last one from me`,
      body: `Hi ${first(p)},

I'll leave you be after this. If packaging ever becomes a headache — reordering, minimums, quotes — we're at bedifferentpackaging.com. Happy to send a small sample set to ${p.companyName} if useful.

Either way, good luck for the season ahead.

Ivy`,
    },
  ],

  rental_manager: (p) => [
    {
      subject: `packaging across your ${p.city || 'portfolio'} properties`,
      body: `Hi ${first(p)},

You're managing what looks like a serious portfolio of properties in ${p.city || 'your area'} — which usually means someone on your team is buying amenity bottles and dispensers over and over for every unit.

We supply exactly that, on repeat: pick the products once, we deliver the same order monthly or quarterly, invoiced to one account. Starts at 10 units, scales to thousands.

Would it make sense to send pricing for the formats you stock across your properties?

Ivy
Be Different Packaging`,
    },
    {
      subject: `re: packaging across your ${p.city || 'portfolio'} properties`,
      body: `Hi ${first(p)} — quick follow-up.

One account, one invoice, every property stocked on the same cycle. The teams we supply stopped tracking amenity purchases per-unit entirely.

If this sits with someone else on the team, a quick intro would be appreciated.

Ivy`,
    },
    {
      subject: `last one from me`,
      body: `Hi ${first(p)},

Closing the loop — if amenity supply ever becomes the annoying line item, we're at bedifferentpackaging.com. Happy to send samples for the formats you use.

All the best with the portfolio.

Ivy`,
    },
  ],

  intl_group: (p) => [
    {
      subject: `custom-branded amenity packaging, 4–6 week lead time`,
      body: `Hi ${first(p)},

For a group like ${p.companyName}, branded in-room packaging is one of those details guests photograph — but most suppliers want enormous MOQs or 4-month lead times.

We produce custom silk-screen or hot-stamp branded bottles and jars from 2,500 units, delivered factory-direct in 4–6 weeks, with one point of contact end to end.

Could I send over a short line sheet with formats and per-unit pricing tiers?

Ivy
Be Different Packaging`,
    },
    {
      subject: `re: custom-branded packaging for ${p.companyName}`,
      body: `Hi ${first(p)} — following up.

Recent example: a boutique group moved from stock minis to hot-stamped 50ml bottles across 3 properties — one order, 4-week turnaround, per-unit cost below their previous unbranded supply.

Happy to ship a sample of the finish quality to your office. Where should I send it?

Ivy`,
    },
    {
      subject: `last one from me`,
      body: `Hi ${first(p)},

Last note from me. When branded packaging comes up in your next product refresh, we're at bedifferentpackaging.com — from 2,500 units, 4–6 weeks, factory-direct.

Thanks for your time.

Ivy`,
    },
  ],

  skincare_brand: (p) => [
    {
      subject: `packaging from 10 units for ${p.companyName}`,
      body: `Hi ${first(p)},

Came across ${p.companyName} — [one genuine line about their range].

Most packaging suppliers make small brands buy 500+ units per SKU. We start at 10 — droppers, jars, pumps, bottles — with tiered pricing that drops as you grow into bigger runs.

Worth a look for your next production run? I can send pricing for the formats you use.

Ivy
Be Different Packaging`,
    },
    {
      subject: `re: packaging from 10 units`,
      body: `Hi ${first(p)} — quick follow-up.

The brands we supply usually start with a 10–50 unit order to test fit and finish, then move to repeat orders as they scale. No quote round-trips — live pricing on the site.

If packaging buying sits with someone else, could you point me their way?

Ivy`,
    },
    {
      subject: `last one from me`,
      body: `Hi ${first(p)},

I'll leave it here. When your next run needs bottles or jars without a 500-unit commitment, we're at bedifferentpackaging.com. Samples available.

Good luck with the brand — it looks great.

Ivy`,
    },
  ],
}

SEQUENCES.spa = SEQUENCES.hotel

export const SEGMENTS = [
  { key: 'hotel', label: 'Hotel / Guesthouse' },
  { key: 'spa', label: 'Spa / Salon' },
  { key: 'rental_manager', label: 'Rental manager' },
  { key: 'skincare_brand', label: 'Skincare brand' },
  { key: 'intl_group', label: 'Intl hotel group' },
]

export function getSequence(segment: string, p: OutreachProspectLike): TemplateEmail[] {
  return (SEQUENCES[segment] ?? SEQUENCES.hotel)(p)
}
