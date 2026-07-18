import * as ort from 'onnxruntime-web'
import type { Canvas, FabricImage } from 'fabric'
import type { HistoryManager } from './history'
import { ensureWorkingCanvas, type EraserImage } from './eraser'

/**
 * "Magic remove" — proper content-aware fill via ONNX inpainting.
 *
 * Uses MI-GAN (Picsart Research) exported to ONNX and hosted on Hugging Face.
 * The `_pipeline_v2` export includes the denormalisation and normalisation
 * steps in-graph, so inputs and outputs are raw uint8 pixels — no manual
 * scaling. Runs entirely in the browser via `onnxruntime-web`.
 *
 * Model input:
 *   image [1, 3, H, W] — RGB, uint8 0-255, planar (CHW)
 *   mask  [1, 1, H, W] — uint8; 255 = regenerate this pixel, 0 = keep
 * Model output:
 *   [1, 3, H, W] — RGB, uint8 0-255, planar (CHW)
 *
 * On first click the ~55 MB model + WASM runtime is fetched and cached by
 * the browser; subsequent runs skip the download and start in ~1 s.
 *
 * The result is only painted over pixels that were transparent in the
 * working canvas, so anything you didn't erase is preserved exactly (no
 * accidental degradation of the untouched parts of the photo).
 */

// MI-GAN inpainting weights, exported and packaged as an ONNX pipeline
// (denormalise + generator + normalise). Public, permissive licence, no auth.
//
// Two URLs so we survive one going down: the original repo (moved a while
// back from lxfater/inpaint-web → andraniksargsyan/migan on HF) and the
// inpaint-web maintainer's Cloudflare Workers mirror. We race through them
// in order; the first that returns a 2xx wins.
const MODEL_URLS = [
  'https://huggingface.co/andraniksargsyan/migan/resolve/main/migan_pipeline_v2.onnx',
  'https://worker-share-proxy-01f5.lxfater.workers.dev/andraniksargsyan/migan/resolve/main/migan_pipeline_v2.onnx',
]
const MODEL_SIZE = 512

// onnxruntime-web needs to know where its WASM shims live. `@imgly/background-
// removal` sets the same option globally when it initialises, but we set it
// defensively so the two libraries don't race and clobber each other.
// (An empty string tells ORT to use its bundled resources served by Vite.)
;(ort.env.wasm as unknown as { wasmPaths?: string }).wasmPaths = ''

let sessionPromise: Promise<ort.InferenceSession> | null = null

function withHistory(canvas: Canvas) {
  return (canvas as unknown as { history?: HistoryManager }).history
}

async function fetchModel(
  url: string,
  onProgress?: (fraction: number) => void,
): Promise<Uint8Array> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
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
  return buffer
}

async function getSession(onProgress?: (fraction: number) => void): Promise<ort.InferenceSession> {
  if (sessionPromise) return sessionPromise
  sessionPromise = (async () => {
    // Try each mirror in turn; only give up if all fail.
    const errors: string[] = []
    for (const url of MODEL_URLS) {
      try {
        const buffer = await fetchModel(url, onProgress)
        return await ort.InferenceSession.create(buffer.buffer, { executionProviders: ['wasm'] })
      } catch (e) {
        errors.push(`${url}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    throw new Error(`Model download failed from all mirrors — ${errors.join(' | ')}`)
  })()
  // Reset on failure so the next click retries the download.
  sessionPromise.catch(() => {
    sessionPromise = null
  })
  return sessionPromise
}

/**
 * Draw the working canvas into a 512×512 square, extract the model's input
 * tensors, and remember the placement so we can composite the result back
 * onto the original resolution afterwards.
 *
 * We letterbox (fit-inside) rather than stretching so the model sees the
 * image at its native aspect ratio — matters for objects like bottles where
 * distortion would break the shape the model expects to reconstruct.
 */
function buildInputs(working: HTMLCanvasElement): {
  imageTensor: ort.Tensor
  maskTensor: ort.Tensor
  placement: { drawX: number; drawY: number; drawW: number; drawH: number }
} {
  const scale = Math.min(MODEL_SIZE / working.width, MODEL_SIZE / working.height)
  const drawW = Math.round(working.width * scale)
  const drawH = Math.round(working.height * scale)
  const drawX = Math.floor((MODEL_SIZE - drawW) / 2)
  const drawY = Math.floor((MODEL_SIZE - drawH) / 2)

  const modelCanvas = document.createElement('canvas')
  modelCanvas.width = MODEL_SIZE
  modelCanvas.height = MODEL_SIZE
  const ctx = modelCanvas.getContext('2d')!
  ctx.drawImage(working, drawX, drawY, drawW, drawH)
  const data = ctx.getImageData(0, 0, MODEL_SIZE, MODEL_SIZE).data

  const pixelCount = MODEL_SIZE * MODEL_SIZE
  const imgArr = new Uint8Array(3 * pixelCount)
  const maskArr = new Uint8Array(pixelCount)
  for (let i = 0; i < pixelCount; i++) {
    // Planar CHW: all R, then all G, then all B (not interleaved RGBRGB).
    imgArr[i] = data[i * 4]
    imgArr[i + pixelCount] = data[i * 4 + 1]
    imgArr[i + pixelCount * 2] = data[i * 4 + 2]
    // Pipeline convention: 255 = regenerate, 0 = keep. Alpha=0 (erased) → 255.
    maskArr[i] = data[i * 4 + 3] === 0 ? 255 : 0
  }

  return {
    imageTensor: new ort.Tensor('uint8', imgArr, [1, 3, MODEL_SIZE, MODEL_SIZE]),
    maskTensor: new ort.Tensor('uint8', maskArr, [1, 1, MODEL_SIZE, MODEL_SIZE]),
    placement: { drawX, drawY, drawW, drawH },
  }
}

/**
 * Take the [1,3,512,512] output tensor in [-1,1] and render just the
 * letterboxed region back to a canvas at the original working-canvas size.
 * Only pixels that were originally transparent get overwritten — every
 * untouched pixel keeps its exact bit-for-bit value.
 */
function paintResultBack(
  workingCanvas: HTMLCanvasElement,
  outputTensor: ort.Tensor,
  placement: { drawX: number; drawY: number; drawW: number; drawH: number },
) {
  const pixelCount = MODEL_SIZE * MODEL_SIZE
  // Pipeline export returns uint8 in [0,255]. Older non-pipeline exports
  // returned float32 in [-1,1]; support both defensively so if we ever swap
  // back to a raw MI-GAN model the same code still works.
  const rawData = outputTensor.data
  const isFloat = rawData instanceof Float32Array
  const modelResult = document.createElement('canvas')
  modelResult.width = MODEL_SIZE
  modelResult.height = MODEL_SIZE
  const rCtx = modelResult.getContext('2d')!
  const rData = rCtx.createImageData(MODEL_SIZE, MODEL_SIZE)
  for (let i = 0; i < pixelCount; i++) {
    if (isFloat) {
      const f = rawData as Float32Array
      rData.data[i * 4] = Math.round((f[i] + 1) * 127.5)
      rData.data[i * 4 + 1] = Math.round((f[i + pixelCount] + 1) * 127.5)
      rData.data[i * 4 + 2] = Math.round((f[i + pixelCount * 2] + 1) * 127.5)
    } else {
      const u = rawData as Uint8Array
      rData.data[i * 4] = u[i]
      rData.data[i * 4 + 1] = u[i + pixelCount]
      rData.data[i * 4 + 2] = u[i + pixelCount * 2]
    }
    rData.data[i * 4 + 3] = 255
  }
  rCtx.putImageData(rData, 0, 0)

  // Upscale just the content region back to working-canvas size.
  const fullSize = document.createElement('canvas')
  fullSize.width = workingCanvas.width
  fullSize.height = workingCanvas.height
  const fCtx = fullSize.getContext('2d')!
  fCtx.drawImage(
    modelResult,
    placement.drawX,
    placement.drawY,
    placement.drawW,
    placement.drawH,
    0,
    0,
    workingCanvas.width,
    workingCanvas.height,
  )
  const filled = fCtx.getImageData(0, 0, workingCanvas.width, workingCanvas.height).data

  // Paint into the working canvas — only where alpha was 0.
  const wCtx = workingCanvas.getContext('2d')!
  const workImg = wCtx.getImageData(0, 0, workingCanvas.width, workingCanvas.height)
  const w = workImg.data
  for (let i = 0; i < workingCanvas.width * workingCanvas.height; i++) {
    if (w[i * 4 + 3] === 0) {
      w[i * 4] = filled[i * 4]
      w[i * 4 + 1] = filled[i * 4 + 1]
      w[i * 4 + 2] = filled[i * 4 + 2]
      w[i * 4 + 3] = 255
    }
  }
  wCtx.putImageData(workImg, 0, 0)
}

export type MagicFillPhase = 'downloading' | 'preparing' | 'inferring' | 'painting' | 'done'

export async function magicRemove(
  fabricCanvas: Canvas,
  image: FabricImage,
  callbacks: {
    onPhase?: (phase: MagicFillPhase) => void
    onDownloadProgress?: (fraction: number) => void
  } = {},
): Promise<void> {
  const working = ensureWorkingCanvas(image as EraserImage)

  callbacks.onPhase?.('downloading')
  const session = await getSession(callbacks.onDownloadProgress)

  callbacks.onPhase?.('preparing')
  const { imageTensor, maskTensor, placement } = buildInputs(working)

  callbacks.onPhase?.('inferring')
  // MI-GAN's ONNX export uses 'image' and 'mask' as input names, 'output' as
  // output name. If your model export uses different names, adjust here.
  const feeds: Record<string, ort.Tensor> = { image: imageTensor, mask: maskTensor }
  const results = await session.run(feeds)
  const outputTensor = results.output ?? results[Object.keys(results)[0]]

  callbacks.onPhase?.('painting')
  paintResultBack(working, outputTensor, placement)
  ;(image as unknown as { dirty: boolean }).dirty = true
  fabricCanvas.requestRenderAll()
  withHistory(fabricCanvas)?.snapshot()

  callbacks.onPhase?.('done')
}
