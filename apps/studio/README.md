# apps/studio

**Creative studio module** for the Social Media Scheduler — a scoped, in-browser
image + short-video editor for producing the visuals that get posted through the
scheduler (`apps/web`). Standalone Vite app, own Vercel deploy.

Originally scaffolded as `bdp-studio` — moved here so brand assets, mockups,
and image-to-video output can live next to the composer/calendar that publishes
them.

Explicitly **not** a Photoshop rebuild. Scoped to what a social-media manager
actually needs before hitting publish.

## Stack

- React 19 + TypeScript + Vite
- [Fabric.js v7](http://fabricjs.com/) — canvas rendering, object model, filters
- Zustand — editor state

## Local development

```bash
cd apps/studio
npm install
npm run dev
# http://localhost:5173
```

```bash
npm run build   # production build → dist/
npx tsc -b      # typecheck only
```

Note: `apps/web` also defaults to Vite on port 5173. Run one at a time, or start
studio with `npm run dev -- --port 5174`.

## What's shipped

### Phase 1 — Core 2D canvas editor

- Canvas with image / text / rectangle / circle objects
- Layer panel — select, reorder (front/back), show/hide, delete
- Non-destructive crop (clipPath-based)
- Image adjustments — brightness, contrast, saturation, blur, hue
- Effects — grayscale, sepia, invert
- Opacity and fill-color controls
- Undo/redo (Ctrl+Z / Ctrl+Shift+Z), delete (Delete/Backspace)
- Export to PNG

### Phase 2 — Product photo tools + mockup placement

- **Background removal** — fully client-side (WASM/ONNX via
  `@imgly/background-removal`, no API key, no server round-trip). Fetches
  its model from a CDN on first use; fails gracefully with an on-screen
  message if there's no network path to it.
- **Beautify presets** — one-click Vivid/Soft/Studio/Warm/Cool combos built
  on the existing adjustment filters
- **Skew controls** — approximate perspective (tilt a logo/design to sit on
  an angled product surface) for mockup placement. Fabric.js has no native
  4-corner projective warp, so this is a deliberate simplification, not true
  perspective transform.

### Phase 3 — Marketing templates + fit-to-screen canvas

- **Template gallery** — Sale Banner, Product Announcement, Quote Card,
  Feature Card. Loads onto the canvas via the existing object primitives
  (no new file format); confirms before overwriting existing work.
- **Fit-to-screen canvas** — the 1200×800 canvas now scales down (via CSS
  transform, recomputed on window resize) to fit the visible viewport,
  instead of silently clipping content near the edges on smaller windows.

### Phase 4 — Image-to-video

- **Slideshow export** — add multiple photos, set a duration per slide,
  export a pan/zoom ("Ken Burns") + crossfade slideshow as a WebM video.
  Renders via `canvas.captureStream()` + `MediaRecorder` — no ffmpeg/WASM
  dependency — which means it's a **real-time** capture: a 12s video takes
  ~12s to render. That trade-off is deliberate; this is not a full video
  editor (no cuts, audio, or timeline).

## Roadmap (not yet built)

- **Composer handoff** — "Send to composer" button that pushes the exported
  PNG/WebM straight into `apps/web`'s media library so it's ready to schedule
- **Batch processing** — apply background removal / presets across multiple
  photos at once (useful when scheduling a week of product posts)
- **True perspective/4-corner warp** — proper projective transform for
  mockup placement if skew turns out not to be enough
- **3D / product angling** — Three.js viewer for rotating pre-existing 3D
  models or a 360° spin from multi-angle photos

## Deploy

Separate Vercel project, root directory `apps/studio`, framework auto-detected
as Vite from `vercel.json`. See `../../docs/DEPLOY.md` for the sibling
`apps/web` setup — studio follows the same pattern.
