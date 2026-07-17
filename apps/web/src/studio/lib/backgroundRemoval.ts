import { removeBackground } from '@imgly/background-removal'
import { FabricImage } from 'fabric'
import type { Canvas } from 'fabric'
import { commitPendingChange } from './canvasActions'

type TaggedImage = FabricImage & { id?: string; name?: string }

export type BackgroundRemovalPhase = 'loading' | 'processing' | 'refining' | 'compositing' | 'done'

/**
 * Runs entirely client-side via WASM/ONNX (no API key, no server round-trip).
 * The model is fetched from a CDN on first use and cached by the browser.
 *
 * Model choice
 * ------------
 * @imgly/background-removal 1.7 ships three variants of ISNet — the salient
 * object segmentation net from Qin et al. (DIS5K, 2022):
 *
 *   isnet_quint8  — 8-bit quantised, ~40 MB, fastest, weakest
 *   isnet_fp16    — half precision,  ~80 MB, decent
 *   isnet         — full precision, ~160 MB, highest confidence masks
 *
 * We use `isnet` (full precision) because on product photos with warm/light
 * backgrounds (yellow bottle on cream, glass on beige, etc.) the smaller
 * variants return a low-confidence mask that visually reads as "everything
 * is 60% transparent" instead of a clean cut.
 *
 * Alpha refinement (largest-component + hole-fill)
 * ------------------------------------------------
 * Simple global thresholds fail on translucent subjects (wipes out glass
 * interiors) and edge-flood-fills fail when the mask has a low-alpha channel
 * connecting exterior to interior (fill leaks INTO the subject, chewing holes
 * out of it — the bug that produced the distorted-bottle report).
 *
 * The robust approach: treat this as a shape problem, not a per-pixel one.
 *
 *   1. Rough-threshold the mask at CANDIDATE_ALPHA — every pixel above is
 *      a "possibly subject" candidate, everything else is definitely
 *      background. The threshold is low (24) on purpose so translucent
 *      interior pixels are included as candidates.
 *   2. Find connected components of candidates (4-connectivity BFS).
 *   3. Keep only the largest component. That is the subject. Every other
 *      candidate blob is a shadow / reflection / model artifact.
 *   4. Fill interior holes: any pixel NOT in the largest component but
 *      completely enclosed by it becomes subject too. Implemented as a
 *      second flood fill from the image edges through non-subject pixels —
 *      anything not reached is an interior hole.
 *   5. Final alpha assignment:
 *        - background            → 0
 *        - subject deep interior → 255
 *        - subject boundary      → model's alpha, boosted, capped
 *
 * Cost: two linear-time BFS passes with preallocated ring buffers. Trivial
 * next to ISNet inference.
 *
 * Progress
 * --------
 * The library reports (key, current, total) tuples where key is the phase
 * name (e.g. "fetch:onnx-runtime", "compute:mask"). We collapse those into
 * a loading/processing/refining/compositing state for the UI.
 */

const CANDIDATE_ALPHA = 24

export async function removeImageBackground(
  canvas: Canvas,
  image: TaggedImage,
  callbacks: {
    onPhase?: (phase: BackgroundRemovalPhase) => void
    onProgress?: (fraction: number) => void
  } = {},
) {
  callbacks.onPhase?.('loading')
  let sawCompute = false

  const blob = await removeBackground(image.getSrc(), {
    model: 'isnet',
    progress: (key, current, total) => {
      if (total <= 0) return
      if (!sawCompute && key.startsWith('compute')) {
        sawCompute = true
        callbacks.onPhase?.('processing')
      }
      callbacks.onProgress?.(current / total)
    },
  })

  callbacks.onPhase?.('refining')
  const refinedBlob = await refineAlpha(blob)

  callbacks.onPhase?.('compositing')
  const url = URL.createObjectURL(refinedBlob)
  const cutout = (await FabricImage.fromURL(url, { crossOrigin: 'anonymous' })) as TaggedImage

  cutout.set({
    left: image.left,
    top: image.top,
    originX: image.originX,
    originY: image.originY,
    scaleX: image.scaleX,
    scaleY: image.scaleY,
    angle: image.angle,
    opacity: image.opacity,
  })
  cutout.id = crypto.randomUUID()
  cutout.name = `${image.name ?? 'Image'} (no bg)`
  // Cache the original data URL on the cutout so the Restore tool can
  // paint back pixels ISNet decided were "background" (e.g. a second
  // bottle salient-object detection dropped).
  ;(cutout as unknown as { _originalSrc?: string })._originalSrc = image.getSrc()

  const index = canvas.getObjects().indexOf(image)
  canvas.remove(image)
  canvas.insertAt(index, cutout)
  canvas.setActiveObject(cutout)
  canvas.requestRenderAll()
  commitPendingChange(canvas)

  callbacks.onPhase?.('done')
  return cutout
}

/**
 * Largest-connected-component + hole-fill alpha refinement.
 *
 * See the doc block at the top of this file for the reasoning. This replaces
 * an earlier edge-flood-fill approach that leaked into the subject interior
 * whenever the model's mask had a thin low-alpha channel from outside to in —
 * the failure mode that produced the "distorted bottle" report.
 */
async function refineAlpha(blob: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = bmp.width
  canvas.height = bmp.height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bmp, 0, 0)
  bmp.close?.()
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data
  const w = canvas.width
  const h = canvas.height
  const total = w * h

  // Step 1: rough candidate mask.
  const candidate = new Uint8Array(total)
  for (let i = 0; i < total; i++) {
    if (data[i * 4 + 3] >= CANDIDATE_ALPHA) candidate[i] = 1
  }

  // Step 2 + 3: connected components on candidates, find the largest.
  // componentId[i] = 0 means "not visited". IDs start at 1.
  const componentId = new Int32Array(total)
  const queue = new Int32Array(total)
  let bestId = 0
  let bestSize = 0
  let nextId = 1

  for (let start = 0; start < total; start++) {
    if (!candidate[start] || componentId[start] !== 0) continue
    const id = nextId++
    let head = 0
    let tail = 0
    queue[tail++] = start
    componentId[start] = id
    let size = 0
    while (head < tail) {
      const i = queue[head++]
      size++
      const y = (i / w) | 0
      const x = i - y * w
      if (x > 0 && candidate[i - 1] && componentId[i - 1] === 0) {
        componentId[i - 1] = id
        queue[tail++] = i - 1
      }
      if (x < w - 1 && candidate[i + 1] && componentId[i + 1] === 0) {
        componentId[i + 1] = id
        queue[tail++] = i + 1
      }
      if (y > 0 && candidate[i - w] && componentId[i - w] === 0) {
        componentId[i - w] = id
        queue[tail++] = i - w
      }
      if (y < h - 1 && candidate[i + w] && componentId[i + w] === 0) {
        componentId[i + w] = id
        queue[tail++] = i + w
      }
    }
    if (size > bestSize) {
      bestSize = size
      bestId = id
    }
  }

  // Step 4: interior hole fill. Flood from image edges through NON-subject
  // pixels only; anything not reached is a hole enclosed by the subject and
  // should be promoted to subject too. Re-use the queue buffer.
  //   isSubject[i] starts as "belongs to the biggest CC". After this pass it
  //   also includes filled interior holes.
  const isSubject = new Uint8Array(total)
  for (let i = 0; i < total; i++) if (componentId[i] === bestId) isSubject[i] = 1

  const reachedExterior = new Uint8Array(total)
  const enqueueIfExterior = (i: number) => {
    if (isSubject[i] || reachedExterior[i]) return
    reachedExterior[i] = 1
    queue[tail++] = i
  }
  let head = 0
  let tail = 0
  for (let x = 0; x < w; x++) {
    enqueueIfExterior(x)
    enqueueIfExterior((h - 1) * w + x)
  }
  for (let y = 0; y < h; y++) {
    enqueueIfExterior(y * w)
    enqueueIfExterior(y * w + w - 1)
  }
  while (head < tail) {
    const i = queue[head++]
    const y = (i / w) | 0
    const x = i - y * w
    if (x > 0 && !isSubject[i - 1] && !reachedExterior[i - 1]) {
      reachedExterior[i - 1] = 1
      queue[tail++] = i - 1
    }
    if (x < w - 1 && !isSubject[i + 1] && !reachedExterior[i + 1]) {
      reachedExterior[i + 1] = 1
      queue[tail++] = i + 1
    }
    if (y > 0 && !isSubject[i - w] && !reachedExterior[i - w]) {
      reachedExterior[i - w] = 1
      queue[tail++] = i - w
    }
    if (y < h - 1 && !isSubject[i + w] && !reachedExterior[i + w]) {
      reachedExterior[i + w] = 1
      queue[tail++] = i + w
    }
  }
  // Any non-subject pixel not reached from the exterior is an interior hole.
  for (let i = 0; i < total; i++) {
    if (!isSubject[i] && !reachedExterior[i]) isSubject[i] = 1
  }

  // Step 5: final alpha assignment.
  //   background            → 0
  //   subject deep interior → 255
  //   subject boundary      → boosted model alpha (preserves anti-aliasing)
  for (let i = 0; i < total; i++) {
    if (!isSubject[i]) {
      data[i * 4 + 3] = 0
      continue
    }
    const y = (i / w) | 0
    const x = i - y * w
    const onBoundary =
      (x > 0 && !isSubject[i - 1]) ||
      (x < w - 1 && !isSubject[i + 1]) ||
      (y > 0 && !isSubject[i - w]) ||
      (y < h - 1 && !isSubject[i + w])
    if (onBoundary) {
      const a = data[i * 4 + 3]
      data[i * 4 + 3] = a >= 200 ? 255 : Math.min(255, Math.round(a * 1.5))
    } else {
      data[i * 4 + 3] = 255
    }
  }
  ctx.putImageData(imageData, 0, 0)
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('refineAlpha toBlob failed'))), 'image/png')
  })
}
