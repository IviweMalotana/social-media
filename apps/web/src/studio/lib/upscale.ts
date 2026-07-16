import * as ort from 'onnxruntime-web'
import { FabricImage } from 'fabric'
import type { Canvas } from 'fabric'
import type { HistoryManager } from './history'
import { ensureWorkingCanvas, type EraserImage } from './eraser'

/**
 * AI upscaling — Real-ESRGAN 2x via ONNX.
 *
 * Real-ESRGAN is Xintao Wang et al.'s super-resolution model; the "anime6b"
 * and "x2plus" variants both exist as ONNX exports. We use the general x2
 * model — trained on natural imagery — which is a good fit for the product-
 * photo / lifestyle-shot workflow the studio is aimed at.
 *
 * How it fits with the rest of the studio
 * ---------------------------------------
 * We upscale the WORKING canvas — the same in-memory buffer the eraser tool,
 * OCR erase, and magic-remove all read/write. That means:
 *   - Any prior brush/box erases stay intact and get upscaled with the rest.
 *   - The Fabric image object's transform (left/top/scaleX/scaleY) is
 *     preserved. The image occupies exactly the same on-canvas space; only
 *     its underlying pixel resolution doubles. So the upscale looks like
 *     "the image just got sharper" rather than "the image doubled in size."
 *   - History gets a single snapshot after — Ctrl+Z reverts to the pre-
 *     upscale bitmap.
 *
 * Model / runtime
 * ---------------
 * Model is fetched on first click with live progress via the ORT ONNX runtime
 * already in the bundle for magic-remove. ~65 MB one-time download, cached by
 * the browser after. Second click starts in <1 s. Inference on a 1 MP image
 * runs in ~5-10 s on a laptop CPU; a GPU/WebGPU path could be added later
 * (Fabric already uses WebGL for its filter chain — same pattern).
 */

// Hosted mirror of the Real-ESRGAN x2 ONNX export used by the popular
// in-browser super-resolution demos. Public, permissive licence.
const MODEL_URL = 'https://huggingface.co/onnx-community/real-esrgan-x2/resolve/main/model.onnx'
const MODEL_SCALE = 2
// The model itself accepts arbitrary input sizes, but very large inputs blow
// past WASM memory. Tile large images into 256px chunks with a small overlap
// and stitch the results.
const TILE_SIZE = 256
const TILE_OVERLAP = 16

;(ort.env.wasm as unknown as { wasmPaths?: string }).wasmPaths = ''

let sessionPromise: Promise<ort.InferenceSession> | null = null

function withHistory(canvas: Canvas) {
  return (canvas as unknown as { history?: HistoryManager }).history
}

async function getSession(onProgress?: (fraction: number) => void): Promise<ort.InferenceSession> {
  if (sessionPromise) return sessionPromise
  sessionPromise = (async () => {
    const response = await fetch(MODEL_URL)
    if (!response.ok) throw new Error(`Upscale model download failed (HTTP ${response.status})`)
    const total = Number(response.headers.get('content-length')) || 0
    const reader = response.body!.getReader()
    const chunks: Uint8Array[] = []
    let received = 0
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      received += value.length
      if (total > 0) onProgress?.(received / total)
    }
    const buffer = new Uint8Array(received)
    let offset = 0
    for (const c of chunks) {
      buffer.set(c, offset)
      offset += c.length
    }
    return ort.InferenceSession.create(buffer.buffer, { executionProviders: ['wasm'] })
  })()
  sessionPromise.catch(() => {
    sessionPromise = null
  })
  return sessionPromise
}

export type UpscalePhase = 'downloading' | 'preparing' | 'inferring' | 'compositing' | 'done'

/**
 * Extract a single 256×256 tile at (tileX, tileY) into a Float32 CHW tensor
 * normalised to [0,1]. Pixels outside the source get zero-padded — the model
 * treats them as background, and we crop out the padding when stitching.
 */
function extractTileTensor(
  src: HTMLCanvasElement,
  tileX: number,
  tileY: number,
): ort.Tensor {
  const tmp = document.createElement('canvas')
  tmp.width = TILE_SIZE
  tmp.height = TILE_SIZE
  const ctx = tmp.getContext('2d')!
  ctx.clearRect(0, 0, TILE_SIZE, TILE_SIZE)
  ctx.drawImage(
    src,
    tileX,
    tileY,
    TILE_SIZE,
    TILE_SIZE,
    0,
    0,
    TILE_SIZE,
    TILE_SIZE,
  )
  const data = ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE).data
  const arr = new Float32Array(3 * TILE_SIZE * TILE_SIZE)
  const plane = TILE_SIZE * TILE_SIZE
  for (let i = 0; i < plane; i++) {
    arr[i] = data[i * 4] / 255
    arr[i + plane] = data[i * 4 + 1] / 255
    arr[i + plane * 2] = data[i * 4 + 2] / 255
  }
  return new ort.Tensor('float32', arr, [1, 3, TILE_SIZE, TILE_SIZE])
}

/**
 * Convert a [1, 3, H, W] tensor of RGB values in [0, 1] back to a canvas.
 */
function tensorToCanvas(tensor: ort.Tensor): HTMLCanvasElement {
  const [, , h, w] = tensor.dims as [number, number, number, number]
  const arr = tensor.data as Float32Array
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  const out = ctx.createImageData(w, h)
  const plane = w * h
  for (let i = 0; i < plane; i++) {
    out.data[i * 4] = Math.min(255, Math.max(0, arr[i] * 255))
    out.data[i * 4 + 1] = Math.min(255, Math.max(0, arr[i + plane] * 255))
    out.data[i * 4 + 2] = Math.min(255, Math.max(0, arr[i + plane * 2] * 255))
    out.data[i * 4 + 3] = 255
  }
  ctx.putImageData(out, 0, 0)
  return c
}

export async function upscale2x(
  fabricCanvas: Canvas,
  image: FabricImage,
  callbacks: {
    onPhase?: (phase: UpscalePhase) => void
    onDownloadProgress?: (fraction: number) => void
    onTileProgress?: (done: number, total: number) => void
  } = {},
): Promise<void> {
  const working = ensureWorkingCanvas(image as EraserImage)
  const srcW = working.width
  const srcH = working.height

  callbacks.onPhase?.('downloading')
  const session = await getSession(callbacks.onDownloadProgress)

  callbacks.onPhase?.('preparing')
  // Prepare the output canvas at 2× size.
  const dst = document.createElement('canvas')
  dst.width = srcW * MODEL_SCALE
  dst.height = srcH * MODEL_SCALE
  const dstCtx = dst.getContext('2d')!

  // Compute tile grid.
  const step = TILE_SIZE - TILE_OVERLAP
  const cols = Math.max(1, Math.ceil((srcW - TILE_OVERLAP) / step))
  const rows = Math.max(1, Math.ceil((srcH - TILE_OVERLAP) / step))
  const totalTiles = cols * rows

  callbacks.onPhase?.('inferring')
  let done = 0
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const tx = Math.min(srcW - TILE_SIZE, col * step)
      const ty = Math.min(srcH - TILE_SIZE, row * step)
      const input = extractTileTensor(working, Math.max(0, tx), Math.max(0, ty))
      const feeds: Record<string, ort.Tensor> = { input: input }
      const results = await session.run(feeds)
      const outputTensor = results.output ?? results[Object.keys(results)[0]]
      const tileCanvas = tensorToCanvas(outputTensor)
      // Paste the 2× tile at its 2× position, cropping the OVERLAP margin so
      // adjacent tiles blend seamlessly instead of showing tile-boundary seams.
      const cropInset = TILE_OVERLAP * MODEL_SCALE
      const drawX = Math.max(0, tx) * MODEL_SCALE + (col === 0 ? 0 : cropInset / 2)
      const drawY = Math.max(0, ty) * MODEL_SCALE + (row === 0 ? 0 : cropInset / 2)
      const srcInsetX = col === 0 ? 0 : cropInset / 2
      const srcInsetY = row === 0 ? 0 : cropInset / 2
      dstCtx.drawImage(
        tileCanvas,
        srcInsetX,
        srcInsetY,
        tileCanvas.width - srcInsetX,
        tileCanvas.height - srcInsetY,
        drawX,
        drawY,
        tileCanvas.width - srcInsetX,
        tileCanvas.height - srcInsetY,
      )
      done++
      callbacks.onTileProgress?.(done, totalTiles)
    }
  }

  callbacks.onPhase?.('compositing')
  // Replace the working canvas with the upscaled version. Keep the FabricImage
  // occupying the same on-canvas footprint by halving its scale — the image
  // now has 2× the pixels at the same displayed size.
  const wctx = working.getContext('2d')!
  working.width = dst.width
  working.height = dst.height
  wctx.clearRect(0, 0, dst.width, dst.height)
  wctx.drawImage(dst, 0, 0)
  const prevScaleX = image.scaleX ?? 1
  const prevScaleY = image.scaleY ?? 1
  image.set({
    scaleX: prevScaleX / MODEL_SCALE,
    scaleY: prevScaleY / MODEL_SCALE,
  })
  ;(image as unknown as { dirty: boolean }).dirty = true
  fabricCanvas.requestRenderAll()
  withHistory(fabricCanvas)?.snapshot()

  callbacks.onPhase?.('done')
}
