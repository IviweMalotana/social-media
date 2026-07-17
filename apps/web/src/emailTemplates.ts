/**
 * Prebuilt email designs modelled on the 5 real Lemme sends in
 * `.claude/skills/email-campaign/references/`, adjusted for BDP copy.
 * Each template loads into the Email Designer as a full set of blocks
 * plus subject + preheader. [Bracketed] copy still blocks send until
 * filled with a real fact or a real image URL.
 */

export type Block = Record<string, unknown> & { type: string }

export interface EmailTemplate {
  key: string
  name: string
  description: string
  subject: string
  preheader: string
  blocks: Block[]
}

const SHOP = 'https://www.bedifferentpackaging.com'

export const EMAIL_TEMPLATES: EmailTemplate[] = [
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
]

export const TEMPLATE_LABEL = Object.fromEntries(
  EMAIL_TEMPLATES.map((t) => [t.key, t.name]),
)
