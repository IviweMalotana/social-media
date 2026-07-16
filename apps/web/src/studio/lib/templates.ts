import { Rect, IText, Circle } from 'fabric'
import type { Canvas, FabricObject } from 'fabric'
import { commitPendingChange } from './canvasActions'

// Fabric v7 defaults originX/originY to 'center' (unlike v5/v6's 'left'/'top'),
// so every object below sets its origin explicitly — omitting it silently
// shifts left-aligned layout by half the object's width/height.
const FONT = 'Inter, system-ui, sans-serif'

function tag<T extends FabricObject>(obj: T, name: string): T {
  Object.assign(obj, { id: crypto.randomUUID(), name })
  return obj
}

export interface Template {
  key: string
  label: string
  description: string
  swatch: string
  build: (canvas: Canvas) => void
}

export const TEMPLATES: Template[] = [
  {
    key: 'sale-banner',
    label: 'Sale Banner',
    description: 'Bold promo banner for a limited-time offer',
    swatch: '#ff6b4f',
    build: (canvas) => {
      canvas.backgroundColor = '#ff6b4f'
      canvas.add(
        tag(
          new IText('SALE', {
            left: 600,
            top: 260,
            originX: 'center',
            originY: 'center',
            fontSize: 160,
            fontWeight: '800',
            fill: '#ffffff',
            fontFamily: FONT,
          }),
          'Headline',
        ),
      )
      canvas.add(
        tag(
          new IText('Up to 50% off — this week only', {
            left: 600,
            top: 400,
            originX: 'center',
            originY: 'center',
            fontSize: 36,
            fill: '#ffffff',
            fontFamily: FONT,
          }),
          'Subheadline',
        ),
      )
      canvas.add(
        tag(
          new Rect({
            left: 600,
            top: 500,
            originX: 'center',
            originY: 'center',
            width: 260,
            height: 64,
            rx: 32,
            ry: 32,
            fill: '#111111',
          }),
          'CTA background',
        ),
      )
      canvas.add(
        tag(
          new IText('SHOP NOW', {
            left: 600,
            top: 500,
            originX: 'center',
            originY: 'center',
            fontSize: 22,
            fontWeight: '700',
            fill: '#ffffff',
            fontFamily: FONT,
          }),
          'CTA label',
        ),
      )
    },
  },
  {
    key: 'product-announcement',
    label: 'Product Announcement',
    description: 'Headline + product image slot for a new-arrival post',
    swatch: '#17181d',
    build: (canvas) => {
      canvas.backgroundColor = '#f4f3f1'
      canvas.add(
        tag(
          new Rect({
            left: 850,
            top: 400,
            originX: 'center',
            originY: 'center',
            width: 560,
            height: 640,
            rx: 12,
            ry: 12,
            fill: '#ffffff',
            stroke: '#d9d7d2',
            strokeDashArray: [10, 8],
            strokeWidth: 2,
          }),
          'Product image slot',
        ),
      )
      canvas.add(
        tag(
          new IText('Drop your\nproduct photo here', {
            left: 850,
            top: 400,
            originX: 'center',
            originY: 'center',
            fontSize: 24,
            fill: '#a7a49d',
            textAlign: 'center',
            fontFamily: FONT,
          }),
          'Placeholder label',
        ),
      )
      canvas.add(
        tag(
          new IText('NEW', {
            left: 120,
            top: 160,
            originX: 'left',
            originY: 'top',
            fontSize: 22,
            fontWeight: '700',
            fill: '#4f7cff',
            charSpacing: 200,
            fontFamily: FONT,
          }),
          'Eyebrow',
        ),
      )
      canvas.add(
        tag(
          new IText('Introducing the\nnext generation', {
            left: 120,
            top: 220,
            originX: 'left',
            originY: 'top',
            fontSize: 56,
            fontWeight: '700',
            fill: '#111111',
            lineHeight: 1.1,
            fontFamily: FONT,
          }),
          'Headline',
        ),
      )
      canvas.add(
        tag(
          new IText('Available now — see it in the shop.', {
            left: 120,
            top: 420,
            originX: 'left',
            originY: 'top',
            fontSize: 24,
            fill: '#555555',
            fontFamily: FONT,
          }),
          'Subheadline',
        ),
      )
    },
  },
  {
    key: 'quote-card',
    label: 'Quote Card',
    description: 'Minimal centered quote — social post friendly',
    swatch: '#1e1f26',
    build: (canvas) => {
      canvas.backgroundColor = '#1e1f26'
      canvas.add(
        tag(
          new IText('“', {
            left: 600,
            top: 200,
            originX: 'center',
            originY: 'center',
            fontSize: 180,
            fill: '#4f7cff',
            fontFamily: 'Georgia, serif',
          }),
          'Quote mark',
        ),
      )
      canvas.add(
        tag(
          new IText('Design is not just\nwhat it looks like.\nDesign is how it works.', {
            left: 600,
            top: 400,
            originX: 'center',
            originY: 'center',
            fontSize: 44,
            fill: '#ffffff',
            textAlign: 'center',
            lineHeight: 1.3,
            fontFamily: FONT,
          }),
          'Quote text',
        ),
      )
      canvas.add(
        tag(
          new IText('— Your Brand', {
            left: 600,
            top: 620,
            originX: 'center',
            originY: 'center',
            fontSize: 22,
            fill: '#9a9ba5',
            fontFamily: FONT,
          }),
          'Attribution',
        ),
      )
    },
  },
  {
    key: 'feature-card',
    label: 'Feature Card',
    description: 'Icon, heading and body copy for a benefits/info post',
    swatch: '#22c55e',
    build: (canvas) => {
      canvas.backgroundColor = '#ffffff'
      canvas.add(
        tag(
          new Circle({
            left: 600,
            top: 220,
            originX: 'center',
            originY: 'center',
            radius: 70,
            fill: '#e8f9ee',
          }),
          'Icon background',
        ),
      )
      canvas.add(
        tag(
          new Circle({
            left: 600,
            top: 220,
            originX: 'center',
            originY: 'center',
            radius: 28,
            fill: '#22c55e',
          }),
          'Icon mark',
        ),
      )
      canvas.add(
        tag(
          new IText('Fast, reliable shipping', {
            left: 600,
            top: 360,
            originX: 'center',
            originY: 'center',
            fontSize: 44,
            fontWeight: '700',
            fill: '#111111',
            fontFamily: FONT,
          }),
          'Heading',
        ),
      )
      canvas.add(
        tag(
          new IText('Every order is tracked door-to-door,\nso you always know where it is.', {
            left: 600,
            top: 440,
            originX: 'center',
            originY: 'center',
            fontSize: 24,
            fill: '#555555',
            textAlign: 'center',
            lineHeight: 1.4,
            fontFamily: FONT,
          }),
          'Body',
        ),
      )
    },
  },
]

export function applyTemplate(canvas: Canvas, template: Template) {
  canvas.clear()
  template.build(canvas)
  canvas.requestRenderAll()
  commitPendingChange(canvas)
}
