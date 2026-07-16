export interface Slide {
  id: string
  url: string
  image: HTMLImageElement
  duration: number
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = url
  })
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  width: number,
  height: number,
  zoom: number,
) {
  const imgRatio = img.width / img.height
  const targetRatio = width / height
  let drawW: number
  let drawH: number
  if (imgRatio > targetRatio) {
    drawH = height * zoom
    drawW = drawH * imgRatio
  } else {
    drawW = width * zoom
    drawH = drawW / imgRatio
  }
  const x = (width - drawW) / 2
  const y = (height - drawH) / 2
  ctx.drawImage(img, x, y, drawW, drawH)
}

export interface RenderOptions {
  width: number
  height: number
  fps: number
  transitionDuration: number
}

export interface RenderHandle {
  promise: Promise<Blob>
  cancel: () => void
}

/**
 * Renders in real time via canvas.captureStream() + MediaRecorder — there's
 * no WebCodecs/ffmpeg dependency, but rendering a 12s video takes ~12
 * wall-clock seconds. That trade-off is deliberate: it keeps this dependency-
 * free and works in any modern browser with zero server involvement.
 */
export function renderSlideshow(
  slides: Slide[],
  options: RenderOptions,
  onProgress: (fraction: number) => void,
): RenderHandle {
  const canvas = document.createElement('canvas')
  canvas.width = options.width
  canvas.height = options.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')

  const totalDuration = slides.reduce((sum, s) => sum + s.duration, 0)
  const stream = (canvas as HTMLCanvasElement & { captureStream: (fps: number) => MediaStream }).captureStream(
    options.fps,
  )
  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm'
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 })
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data)
  }

  let cancelled = false
  let rafId = 0

  const drawAtTime = (t: number) => {
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, options.width, options.height)

    let acc = 0
    let idx = 0
    for (; idx < slides.length - 1; idx++) {
      if (t < acc + slides[idx].duration) break
      acc += slides[idx].duration
    }
    const slide = slides[idx]
    const localT = t - acc
    const progress = Math.min(localT / slide.duration, 1)
    const zoom = 1 + 0.08 * progress

    const nextSlide = slides[idx + 1]
    const fadeStart = slide.duration - options.transitionDuration
    if (nextSlide && localT > fadeStart) {
      const fadeProgress = Math.min((localT - fadeStart) / options.transitionDuration, 1)
      ctx.globalAlpha = 1
      drawCover(ctx, slide.image, options.width, options.height, zoom)
      ctx.globalAlpha = fadeProgress
      drawCover(ctx, nextSlide.image, options.width, options.height, 1)
      ctx.globalAlpha = 1
    } else {
      drawCover(ctx, slide.image, options.width, options.height, zoom)
    }
  }

  const promise = new Promise<Blob>((resolve, reject) => {
    recorder.onerror = () => reject(new Error('Recording failed'))
    recorder.onstop = () => {
      if (cancelled) {
        reject(new Error('cancelled'))
        return
      }
      resolve(new Blob(chunks, { type: mimeType }))
    }

    const startTime = performance.now()
    recorder.start()

    const frame = () => {
      if (cancelled) {
        recorder.stop()
        return
      }
      const elapsed = (performance.now() - startTime) / 1000
      if (elapsed >= totalDuration) {
        drawAtTime(totalDuration - 0.001)
        onProgress(1)
        recorder.stop()
        return
      }
      drawAtTime(elapsed)
      onProgress(elapsed / totalDuration)
      rafId = requestAnimationFrame(frame)
    }
    rafId = requestAnimationFrame(frame)
  })

  return {
    promise,
    cancel: () => {
      cancelled = true
      cancelAnimationFrame(rafId)
    },
  }
}
