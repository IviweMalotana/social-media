/**
 * Prebuilt email designs modelled on the 5 real Lemme sends in
 * `.claude/skills/email-campaign/references/`, adjusted for BDP copy.
 * Each template loads into the Email Designer as a full set of blocks
 * plus subject + preheader. [Bracketed] copy still blocks send until
 * filled with a real fact or a real image URL.
 */

export type Block = Record<string, unknown> & { type: string }

export interface BrandOverride {
  accent?: string
  bg?: string
  card?: string
  ink?: string
  muted?: string
  button?: string
  border?: string
  wordmark?: string
  logoUrl?: string
}

export interface EmailTemplate {
  key: string
  name: string
  description: string
  subject: string
  preheader: string
  blocks: Block[]
  /** Optional palette override loaded alongside the template. */
  brand?: BrandOverride
}

const SHOP = 'https://www.bedifferentpackaging.com'

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    key: 'lemme-shape-reference',
    name: 'LEMME shape reference',
    description:
      'Pixel-close structural clone of a Lemme launch email: NEW LAUNCH marquee, hero + product image, benefit icon row, blush subscription panel with lifestyle image, 4 ingredient-style cards, closing CTA. Loads with Lemme\'s lavender/purple palette. Every text slot is [bracketed] so nothing sends by accident. Use it as a shape-and-vibe reference, then rewrite for your own product.',
    subject: 'meet [product name].',
    preheader: '[Rewrite this for your product before sending. This template is a shape reference only.]',
    brand: {
      // Lemme-style pastel palette: lavender panel, purple accent, black CTA on white cards.
      accent: '#7B5F9E',
      bg: '#EDE4F1',
      card: '#FFFFFF',
      ink: '#1A1A1A',
      muted: '#6B6664',
      button: '#000000',
      border: '#E4D8EA',
      wordmark: 'bdp',
      logoUrl: '',
    },
    blocks: [
      { type: 'marquee', text: '+ NEW LAUNCH + NEW LAUNCH + NEW LAUNCH +' },
      { type: 'logo' },
      {
        type: 'hero',
        headline: '[HEADLINE LINE ONE].\n[HEADLINE LINE TWO].',
        subline: '[One line subhead. Feature name in title case, benefit in body case.]',
        imageUrl: '[Hero product image URL. Product on gradient background with prop styling.]',
        ctaText: 'BE FIRST',
        ctaUrl: SHOP,
      },
      {
        type: 'text',
        heading: '',
        body: '[First body paragraph, 2 or 3 sentences. Everyday-upgrade framing, benefit-forward, one implicit promise.]\n\n[Second body paragraph, 1 sentence. Format simplicity claim: no capsules, no powders, just X.]',
      },
      {
        type: 'text',
        heading: 'Formulated with [ingredient 1], [ingredient 2] & [ingredient 3] to manage:',
        body: '',
        bg: 'sand',
      },
      {
        type: 'iconRow',
        items: [
          { icon: '✦', label: '[BENEFIT ONE]' },
          { icon: '✦', label: '[BENEFIT TWO]' },
          { icon: '✦', label: '[BENEFIT THREE]' },
          { icon: '✦', label: '[BENEFIT FOUR]' },
        ],
      },
      {
        type: 'hero',
        headline: '',
        subline: '',
        ctaText: 'BE STOCKED',
        ctaUrl: SHOP,
      },
      {
        type: 'storyImage',
        heading: 'SAVE 10% ON EVERY ORDER',
        body: '[One sentence on the subscription mechanic. Standing repeat orders, 3 month minimum, cancel or change formats after that.]',
        imageUrl: '[Lifestyle image URL. Person or scene that matches the audience.]',
        bg: 'blush',
        ctaText: 'BE ON REPEAT',
        ctaUrl: SHOP,
      },
      {
        type: 'text',
        heading: 'Real specifics, real numbers',
        body: '',
      },
      {
        type: 'card',
        title: '[FEATURE OR SPEC ONE]',
        body: '[Honest paragraph. What it is, why it matters, one concrete number if you have one.]',
        imageUrl: '[Detail shot URL.]',
      },
      {
        type: 'card',
        title: '[FEATURE OR SPEC TWO]',
        body: '[Honest paragraph.]',
        imageUrl: '[Detail shot URL.]',
      },
      {
        type: 'card',
        title: '[FEATURE OR SPEC THREE]',
        body: '[Honest paragraph.]',
        imageUrl: '[Detail shot URL.]',
      },
      {
        type: 'card',
        title: '[FEATURE OR SPEC FOUR]',
        body: '[Honest paragraph.]',
        imageUrl: '[Detail shot URL.]',
      },
      {
        type: 'hero',
        headline: '',
        subline: '',
        ctaText: 'BE STOCKED',
        ctaUrl: SHOP,
      },
    ],
  },

  {
    key: 'welcome',
    name: 'Meet BDP (welcome)',
    description:
      'Modelled on MEET lemme. Founder intro, three format categories with images, values row, signed closer.',
    subject: 'meet bdp.',
    preheader: 'take 10% off your first order. code: TRYBDP10',
    blocks: [
      { type: 'offerBar', text: 'TAKE 10% OFF YOUR FIRST ORDER WITH CODE TRYBDP10' },
      { type: 'logo' },
      {
        type: 'hero',
        headline: 'MEET bdp.',
        subline:
          '"Small brands deserve serious packaging. I started BDP after 4.9 stars on Etsy and years of watching small skincare brands get quoted like they didn\'t matter."',
        imageUrl: '[Founder or lifestyle hero image URL.]',
        ctaText: 'BE STOCKED',
        ctaUrl: SHOP,
      },
      {
        type: 'text',
        heading: 'Say hello to packaging with 10% off your first order. Use code: TRYBDP10',
        body: '',
        bg: 'sand',
      },
      {
        type: 'card',
        title: 'DROPPERS',
        body: 'Serums, oils, and actives. Glass body, rubber teat. 30ml, 50ml, 100ml stocked in Cape Town from 10 units.',
        imageUrl: '[Dropper family shot URL.]',
        ctaText: 'BE STOCKED',
        ctaUrl: SHOP,
      },
      {
        type: 'card',
        title: 'JARS',
        body: 'Balms, masks, solid formulas. Amber glass, frosted, or matte white. UV protection built in. From 10 units.',
        imageUrl: '[Jar family shot URL.]',
        ctaText: 'BE STOCKED',
        ctaUrl: SHOP,
      },
      {
        type: 'card',
        title: 'BOTTLES & PUMPS',
        body: 'Lotions, moisturisers, body wash. Airless pumps, standard pumps, sprayers. Lock during transit. From 10 units.',
        imageUrl: '[Bottles + pumps family shot URL.]',
        ctaText: 'BE STOCKED',
        ctaUrl: SHOP,
      },
      {
        type: 'iconRow',
        title: 'What we build in (and leave out)',
        items: [
          { icon: '10', label: 'FROM 10 UNITS' },
          { icon: '⚡', label: 'LIVE TIERED PRICING' },
          { icon: '📦', label: 'NO QUOTE ROUND TRIPS' },
          { icon: '★', label: '4.9 STAR ETSY HISTORY' },
        ],
      },
      {
        type: 'storyImage',
        heading: '"Every format we stock is one I\'d put my own product in."',
        body: 'I sold on Etsy for years and watched small skincare brands get quoted like they didn\'t matter. BDP is the supplier I wished existed then.\n\nXo, Ivi',
        imageUrl: '[Founder photo or signature image URL.]',
        bg: 'sand',
        ctaText: 'BE STOCKED',
        ctaUrl: SHOP,
      },
    ],
  },

  {
    key: 'new-launch',
    name: 'New product launch',
    description:
      'Modelled on MEET RELAX. Launch marquee, hero product image, benefit icon row, subscription block, ingredient/feature cards.',
    subject: 'meet [product name].',
    preheader: 'built for your next production run. from 10 units.',
    blocks: [
      { type: 'marquee', text: '+ NEW LAUNCH + NEW LAUNCH + NEW LAUNCH +' },
      { type: 'logo' },
      {
        type: 'hero',
        headline: 'MEET [PRODUCT NAME].\nBUILT FOR YOUR NEXT RUN.',
        subline:
          'From 10 units. Live tiered pricing. Ships in [X] days from Cape Town.',
        imageUrl: '[Hero product image URL. Product on marble or linen, ideally with prop styling.]',
        ctaText: 'BE FIRST',
        ctaUrl: SHOP,
      },
      {
        type: 'text',
        heading: 'The problem isn\'t packaging. It\'s the 500 unit gamble to test one.',
        body: '[Two or three honest sentences on the format you\'re launching. What it holds, what it fits, what job it does that other formats miss.]',
      },
      {
        type: 'iconRow',
        title: 'Formulated for indie brands',
        items: [
          { icon: '10', label: 'FROM 10 UNITS' },
          { icon: '⚡', label: 'LIVE PRICING' },
          { icon: '🚚', label: 'SHIPS IN [X] DAYS' },
          { icon: '🔁', label: 'STANDING ORDER 10% OFF' },
        ],
        bg: 'sand',
      },
      {
        type: 'storyImage',
        heading: 'SAVE 10% ON EVERY ORDER',
        body: 'Standing repeat orders lock in the same tier price. 3 month minimum commitment. Cancel or change formats after that anytime.',
        imageUrl: '[Lifestyle image URL. Packed shelf, brand hero, or repeat-delivery visual.]',
        bg: 'blush',
        ctaText: 'BE ON REPEAT',
        ctaUrl: SHOP,
      },
      {
        type: 'text',
        heading: 'Real specifics, real numbers',
        body: '',
      },
      {
        type: 'card',
        title: '[SIZE + FORMAT]',
        body: '[One line on what it holds and what it\'s best for. Then one line on price tier or MOQ story.]',
        imageUrl: '[Product isolated shot URL.]',
      },
      {
        type: 'card',
        title: '[SIZE + FORMAT VARIANT 2]',
        body: '[One line on what it holds and what it\'s best for. Then one line on price tier or MOQ story.]',
        imageUrl: '[Product isolated shot URL.]',
      },
      {
        type: 'proof',
        quote: '[Paste a real customer review here. Never invent one.]',
        attribution: '[Real customer first name], [their brand]',
      },
      {
        type: 'text',
        heading: 'We believe small brands deserve serious packaging.',
        body: 'Started on Etsy at 4.9 stars because small skincare brands kept getting quoted like they didn\'t matter. Every format we stock is one we\'d put our own product in.',
        bg: 'sand',
      },
    ],
  },

  {
    key: 'waitlist',
    name: 'Coming soon waitlist',
    description:
      'Modelled on Lemme Metabolism waitlist. COMING SOON marquee, problem reframe, feature circles, ingredient cards, JOIN THE WAITLIST CTA.',
    subject: 'coming soon: [product name].',
    preheader: 'the format indie brands keep asking us for. join the waitlist.',
    blocks: [
      { type: 'marquee', text: '+ COMING SOON + COMING SOON + COMING SOON +' },
      { type: 'logo' },
      {
        type: 'hero',
        headline: 'COMING SOON\n[PRODUCT NAME]',
        subline: '[One-line benefit or purpose. What this fills in the range.]',
        imageUrl: '[Product concept shot URL. Even a mockup works.]',
        ctaText: 'JOIN THE WAITLIST',
        ctaUrl: SHOP,
      },
      {
        type: 'text',
        heading: 'The problem isn\'t [category]. It\'s [what the current market gets wrong].',
        body: '[Two sentences reframing the pain. Most suppliers do X. Small brands need Y. This is our take on Y.]',
        bg: 'sand',
      },
      {
        type: 'text',
        heading: 'If you\'ve been quoted big MOQs for [category], this is the missing piece',
        body: '',
      },
      {
        type: 'iconRow',
        items: [
          { icon: '10', label: 'FROM 10 UNITS' },
          { icon: '📏', label: '[SPEC ONE]' },
          { icon: '🎨', label: '[SPEC TWO]' },
          { icon: '⚡', label: 'LIVE PRICING' },
        ],
      },
      {
        type: 'hero',
        headline: 'SIGN ME UP',
        subline: 'First 100 waitlisters get 15% off launch pricing.',
        ctaText: 'JOIN THE WAITLIST',
        ctaUrl: SHOP,
      },
      {
        type: 'text',
        heading: 'What\'s in this?',
        body: '',
        bg: 'sand',
      },
      {
        type: 'card',
        title: '[SPEC / FEATURE 1]',
        body: '[Honest paragraph on what it is, what it does, why it matters. Real numbers if you have them.]',
        imageUrl: '[Detail shot URL.]',
      },
      {
        type: 'card',
        title: '[SPEC / FEATURE 2]',
        body: '[Honest paragraph on what it is, what it does, why it matters.]',
        imageUrl: '[Detail shot URL.]',
      },
      {
        type: 'card',
        title: '[SPEC / FEATURE 3]',
        body: '[Honest paragraph on what it is, what it does, why it matters.]',
        imageUrl: '[Detail shot URL.]',
      },
    ],
  },

  {
    key: 'proof',
    name: 'Quality / certification',
    description:
      'Modelled on the Creatine NSF Certified email. Proof-forward, four checkmark cards for quality standards, product family row.',
    subject: '[quality standard]. what it actually means.',
    preheader: 'why we bought the extra certification. and what it changes for you.',
    blocks: [
      { type: 'offerBar', text: 'FREE SHIPPING ON ORDERS OVER R[amount]' },
      { type: 'logo' },
      {
        type: 'hero',
        headline: '[FORMAT / SKU]\n[QUALITY STANDARD]',
        subline:
          '[One line on what the standard is. Kept plain because the standard\'s name is the ad.]',
        imageUrl: '[Hero product image URL, with certification badge if applicable.]',
        ctaText: 'BE STOCKED',
        ctaUrl: SHOP,
      },
      {
        type: 'text',
        heading: 'Translation? [The one-line consumer version of what this really means for the buyer.]',
        body: '',
        bg: 'sand',
      },
      {
        type: 'iconRow',
        items: [
          { icon: '✓', label: '[STANDARD ONE]' },
          { icon: '✓', label: '[STANDARD TWO]' },
          { icon: '✓', label: '[STANDARD THREE]' },
          { icon: '✓', label: '[STANDARD FOUR]' },
        ],
      },
      {
        type: 'card',
        title: '[STANDARD ONE]',
        body: '[One honest paragraph on what this standard actually checks. Numbers or spec if you have them.]',
        imageUrl: '',
      },
      {
        type: 'card',
        title: '[STANDARD TWO]',
        body: '[One honest paragraph on what this standard actually checks.]',
        imageUrl: '',
      },
      {
        type: 'card',
        title: '[STANDARD THREE]',
        body: '[One honest paragraph on what this standard actually checks.]',
        imageUrl: '',
      },
      {
        type: 'card',
        title: '[STANDARD FOUR]',
        body: '[One honest paragraph on what this standard actually checks.]',
        imageUrl: '',
      },
      {
        type: 'storyImage',
        heading: 'The extra quality check',
        body: '[One paragraph on why we bought the extra certification, what it costs us, and what it changes for the brands we supply. Confidence in every unit.]',
        imageUrl: '[Certification badge or lab photo URL.]',
        bg: 'sand',
        ctaText: 'BE STOCKED',
        ctaUrl: SHOP,
      },
      {
        type: 'iconRow',
        title: 'Find the format that fits',
        items: [
          { icon: '💧', label: 'DROPPERS' },
          { icon: '🫙', label: 'JARS' },
          { icon: '🧴', label: 'BOTTLES' },
          { icon: '💨', label: 'PUMPS' },
        ],
        bg: 'sand',
      },
    ],
  },

  {
    key: 'restock',
    name: 'Back in stock',
    description:
      'Fast, short, urgency-honest. Modelled on Lemme\'s "the mint one is back." Subject lowercase with a period, one hero image, one CTA, one review.',
    subject: 'the [format] is back.',
    preheader: 'back in stock. going fast. you first.',
    blocks: [
      { type: 'marquee', text: '+ BACK IN STOCK + BACK IN STOCK +' },
      { type: 'logo' },
      {
        type: 'hero',
        headline: 'BACK IN STOCK\nTHE [FORMAT].',
        subline: 'Missed the last restock? Now\'s your window.',
        imageUrl: '[Product hero URL.]',
        ctaText: 'BE STOCKED',
        ctaUrl: SHOP,
      },
      {
        type: 'iconRow',
        items: [
          { icon: '10', label: 'FROM 10 UNITS' },
          { icon: '📦', label: '[QTY] IN STOCK' },
          { icon: '🚚', label: 'SHIPS TODAY' },
        ],
        bg: 'sand',
      },
      {
        type: 'proof',
        quote: '[Real customer quote about this format. Never invent one.]',
        attribution: '[Real customer first name], [their brand]',
      },
      {
        type: 'text',
        heading: 'Save 10% every reorder',
        body: 'Standing repeat orders lock in your tier price for 3 months. Cancel or change formats after that anytime.',
        bg: 'blush',
      },
      {
        type: 'hero',
        headline: 'DON\'T MISS THIS ONE.',
        subline: 'Restocks sell out in [X] days on average.',
        ctaText: 'BE STOCKED',
        ctaUrl: SHOP,
      },
    ],
  },

  {
    key: 'founder-note',
    name: 'Plain founder note',
    description:
      'The pattern break. Alternates with designed sends 2 to 3 times a month. Short, personal, no images, one link. Reply-driver, not click-driver.',
    subject: 'can I ask you something?',
    preheader: '',
    blocks: [
      { type: 'logo' },
      {
        type: 'text',
        heading: '',
        body:
          'Hey,\n\nQuick one before the week gets loud.\n\n[One short story about a real decision, question, or moment from this week. 2 to 3 sentences.]\n\n[The ask, or the one link, or the reply prompt. One sentence.]\n\nIf you\'ve been thinking about [related decision], we\'re here: ' +
          SHOP +
          '\n\nXo, Ivi\nBe Different Packaging',
      },
    ],
  },

  {
    key: 'sale-announce',
    name: 'Sale: announce (beat 1 of 2)',
    description:
      'First beat of the two beat promo pattern. Announces the discount, states the honest end date, one CTA. Follow with the last-call template 24 to 48 hours before the deadline.',
    subject: '[X]% off through [day].',
    preheader: '[One line reason for the promo. Real reason only.]',
    blocks: [
      { type: 'offerBar', text: '[X]% OFF WITH CODE [CODE]. ENDS [DAY] AT MIDNIGHT.' },
      { type: 'logo' },
      {
        type: 'hero',
        headline: '[X]% OFF EVERYTHING.\nUNTIL [DAY].',
        subline: 'Use code [CODE] at checkout. No minimum. All formats included.',
        imageUrl: '[Hero image URL. Product family or single hero.]',
        ctaText: 'BE STOCKED',
        ctaUrl: SHOP,
      },
      {
        type: 'text',
        heading: 'Why the [X]% off, honestly',
        body: '[One real sentence on the reason. Overstock, birthday, quarter-end. Never invent urgency.]',
      },
      {
        type: 'iconRow',
        items: [
          { icon: '%', label: '[X]% OFF' },
          { icon: '⏰', label: 'ENDS [DAY]' },
          { icon: '📦', label: 'FROM 10 UNITS' },
          { icon: '🚚', label: 'SHIPS TODAY' },
        ],
        bg: 'sand',
      },
      {
        type: 'text',
        heading: 'What our customers reorder most',
        body: '[One paragraph pointing at the 3 or 4 formats indie brands come back for.]',
      },
      {
        type: 'card',
        title: '[FORMAT ONE]',
        body: '[One line on what it holds and why it moves.]',
        imageUrl: '[Product shot URL.]',
        ctaText: 'BE STOCKED',
        ctaUrl: SHOP,
      },
      {
        type: 'card',
        title: '[FORMAT TWO]',
        body: '[One line on what it holds and why it moves.]',
        imageUrl: '[Product shot URL.]',
        ctaText: 'BE STOCKED',
        ctaUrl: SHOP,
      },
      {
        type: 'proof',
        quote: '[Paste a real customer review here. Never invent one.]',
        attribution: '[Real customer first name], [their brand]',
      },
    ],
  },

  {
    key: 'sale-last-call',
    name: 'Sale: last call (beat 2 of 2)',
    description:
      'Second beat of the two beat promo. Sent 24 to 48 hours before the real deadline. Short, one CTA, honest countdown. Never fake the deadline.',
    subject: 'last call: [X]% off ends tonight.',
    preheader: 'code [CODE] at checkout. Ends [time].',
    blocks: [
      { type: 'marquee', text: '+ LAST CALL + ENDS TONIGHT +' },
      { type: 'logo' },
      {
        type: 'hero',
        headline: 'LAST CALL.\n[X]% OFF ENDS TONIGHT.',
        subline: 'Code [CODE] at checkout. Real deadline, not a fake one.',
        imageUrl: '[Same hero image as the announce email. Consistency helps.]',
        ctaText: 'BE STOCKED',
        ctaUrl: SHOP,
      },
      {
        type: 'iconRow',
        items: [
          { icon: '%', label: '[X]% OFF' },
          { icon: '⏰', label: 'ENDS [TIME]' },
          { icon: '📦', label: 'FROM 10 UNITS' },
        ],
        bg: 'blush',
      },
      {
        type: 'text',
        heading: '',
        body: 'If you\'ve been putting off a reorder, this is the window. No repeat of this promo until [next honest window].',
      },
      {
        type: 'hero',
        headline: '',
        subline: '',
        ctaText: 'BE STOCKED',
        ctaUrl: SHOP,
      },
    ],
  },

  {
    key: 'replenishment',
    name: 'Replenishment reminder',
    description:
      'The notification-mockup format. Fires when a customer\'s reorder window is due. Short, personal, one link. Uses the phone-notification framing on top.',
    subject: 'time to top up your [format]?',
    preheader: 'your last order shipped [X] weeks ago. Reorder in one click.',
    blocks: [
      { type: 'logo' },
      {
        type: 'text',
        heading: 'Reminder: your [format] stock is running low',
        body: 'Your last order of [format] shipped on [date]. Most brands your size reorder every [X] weeks.\n\nHit the button below to pull up the exact same order. Same tier price. No renegotiation.',
        bg: 'sand',
      },
      {
        type: 'hero',
        headline: 'TIME TO TOP UP?',
        subline: '',
        ctaText: 'BE STOCKED',
        ctaUrl: SHOP,
      },
      {
        type: 'iconRow',
        items: [
          { icon: '✓', label: 'ALREADY DID' },
          { icon: '🛒', label: 'DOING IT NOW' },
          { icon: '⏸', label: 'NOT THIS MONTH' },
        ],
      },
      {
        type: 'text',
        heading: 'Or lock it in on a standing order',
        body: 'Same order, same schedule, 10% off. 3 month minimum. Cancel or change formats after that anytime.',
      },
      {
        type: 'hero',
        headline: '',
        subline: '',
        ctaText: 'BE ON REPEAT',
        ctaUrl: SHOP,
      },
    ],
  },

  {
    key: 'winback',
    name: 'Winback (60 to 90 day lapsed)',
    description:
      'Plain-text style personal note first, offer second. Fires when a past customer hasn\'t ordered in 60 to 90 days. Reads like a founder note, not a designed sell.',
    subject: 'still around?',
    preheader: '',
    blocks: [
      { type: 'logo' },
      {
        type: 'text',
        heading: '',
        body:
          'Hey [first name],\n\nNoticed [company] hasn\'t ordered since [date]. Wanted to check in, not to sell.\n\n[One sentence acknowledging that things change. Maybe you switched suppliers, maybe you paused the line, maybe life got loud.]\n\nIf we did something wrong on your last order, tell me. I want to know.\n\nIf you\'re still building and just haven\'t needed packaging yet, we\'re here when you\'re ready: ' +
          SHOP +
          '\n\nXo, Ivi',
      },
      {
        type: 'text',
        heading: '',
        body: 'And if it\'s useful, here\'s 10% off your next order with code [CODE]. Real code, real 30 day window. No pressure.',
        bg: 'sand',
      },
    ],
  },

  {
    key: 'useful-education',
    name: 'Useful: teach one decision',
    description:
      'The "useful" job from the social jobs table, in email form. Teach ONE packaging decision (dropper vs pump, MOQ math, etc.). Zero hard sell. Positions BDP as the expert supplier without needing to prove it.',
    subject: '[dropper vs pump]: which one and when.',
    preheader: 'the packaging decision most indie brands get wrong on their first launch.',
    blocks: [
      { type: 'logo' },
      {
        type: 'hero',
        headline: '[DROPPER VS PUMP.]\nWHICH ONE AND WHEN.',
        subline: 'A short guide for founders picking packaging for the first time.',
        imageUrl: '[Comparison hero URL. Both formats side by side on marble.]',
      },
      {
        type: 'text',
        heading: 'The short version',
        body: '[Two sentence answer. Format A wins when X. Format B wins when Y. Honest, no upsell.]',
      },
      {
        type: 'iconRow',
        title: 'Dropper wins for',
        items: [
          { icon: '💧', label: '[USE CASE ONE]' },
          { icon: '💧', label: '[USE CASE TWO]' },
          { icon: '💧', label: '[USE CASE THREE]' },
        ],
        bg: 'sand',
      },
      {
        type: 'iconRow',
        title: 'Pump wins for',
        items: [
          { icon: '💨', label: '[USE CASE ONE]' },
          { icon: '💨', label: '[USE CASE TWO]' },
          { icon: '💨', label: '[USE CASE THREE]' },
        ],
      },
      {
        type: 'text',
        heading: 'The one to avoid',
        body: '[One paragraph on the format-viscosity mismatch that trips most first-launches up. Real experience only.]',
      },
      {
        type: 'storyImage',
        heading: 'Not sure? Order 10 of each and test.',
        body: 'From 10 units, live tiered pricing. Test both formats with your real formula, pick the winner, scale from there.',
        imageUrl: '[Lifestyle image URL. Someone testing formulations.]',
        bg: 'blush',
        ctaText: 'BE STOCKED',
        ctaUrl: SHOP,
      },
    ],
  },

  {
    key: 'post-purchase',
    name: 'Post-purchase: what to expect',
    description:
      'Fires after order confirmation. Sets timeline expectations (dispatch, tracking, delivery). Softens post-purchase anxiety. Ends with a review-and-standing-order nudge.',
    subject: 'your order is packed.',
    preheader: 'here\'s what to expect over the next [X] days.',
    blocks: [
      { type: 'logo' },
      {
        type: 'hero',
        headline: 'YOUR ORDER IS PACKED.\nHERE\'S WHAT COMES NEXT.',
        subline: 'Order [order number] for [company].',
        imageUrl: '[Packing bench photo or order confirmation graphic URL.]',
      },
      {
        type: 'timeline',
        title: 'What to expect',
        steps: [
          { label: 'TODAY', text: 'Packed. Tracking number arrives when the courier scans it.' },
          { label: '[X] DAYS', text: 'Out for delivery. Someone should sign for it at your address.' },
          { label: 'ON ARRIVAL', text: 'Inspect the shipment. If anything looks off, reply to this email within 48 hours.' },
          { label: '+10 DAYS', text: 'We\'ll check in and ask how the fit and finish worked out.' },
        ],
      },
      {
        type: 'text',
        heading: 'Got a question about the order?',
        body: 'Reply to this email. Ivi reads every one, usually within a business day.',
        bg: 'sand',
      },
      {
        type: 'iconRow',
        title: 'Next steps once it lands',
        items: [
          { icon: '📸', label: 'PHOTOGRAPH IT' },
          { icon: '⭐', label: 'REVIEW US' },
          { icon: '🔁', label: 'SET REPEAT' },
        ],
      },
      {
        type: 'storyImage',
        heading: 'Reorder same order, 10% off',
        body: 'Once you know these formats work, lock in the tier price on a standing repeat order. 3 month minimum. Cancel or change formats after that anytime.',
        imageUrl: '[Repeat delivery lifestyle image URL.]',
        bg: 'blush',
        ctaText: 'BE ON REPEAT',
        ctaUrl: SHOP,
      },
    ],
  },
]

export const TEMPLATE_LABEL = Object.fromEntries(
  EMAIL_TEMPLATES.map((t) => [t.key, t.name]),
)
