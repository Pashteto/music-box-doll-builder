// Fallback render path: MediaRecorder over canvas.captureStream + Web Audio (E10-T4).
// Real-time capture (a 10s video takes ~10s), output WebM (Chrome) or MP4 (Safari).
import type { RenderParams, RenderResult } from '@/modules/render/renderTypes'
import { detectRenderPipeline } from '@/modules/render/codecDetection'

export async function renderMediaRecorderVideo(params: RenderParams): Promise<RenderResult> {
  const { fps, durationSeconds, audioUrl, drawFrame, onProgress } = params
  const caps = await detectRenderPipeline()
  const mime = caps.mediaRecorderMime
  if (typeof MediaRecorder === 'undefined' || !mime) {
    throw new Error('MediaRecorder is not supported')
  }

  const totalFrames = Math.max(1, Math.round(fps * durationSeconds))
  // Prime the canvas at frame 0 (it is already sized by the caller's FrameDrawer).
  const canvas = drawFrame(0, totalFrames)
  const stream = canvas.captureStream(fps)
  const tracks: MediaStreamTrack[] = [...stream.getVideoTracks()]

  let audioCtx: AudioContext | null = null
  let source: AudioBufferSourceNode | null = null
  let hasAudio = false
  if (audioUrl) {
    try {
      const Ctx: typeof AudioContext =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      audioCtx = new Ctx()
      const buf = await (await fetch(audioUrl)).arrayBuffer()
      const audioBuffer = await audioCtx.decodeAudioData(buf)
      const dest = audioCtx.createMediaStreamDestination()
      source = audioCtx.createBufferSource()
      source.buffer = audioBuffer
      source.loop = true
      source.connect(dest)
      tracks.push(...dest.stream.getAudioTracks())
      hasAudio = true
    } catch {
      hasAudio = false
    }
  }

  const recorder = new MediaRecorder(new MediaStream(tracks), {
    mimeType: mime,
    videoBitsPerSecond: 6_000_000,
  })
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data)
  }
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve()
  })

  recorder.start()
  source?.start()

  const startT = performance.now()
  const totalMs = durationSeconds * 1000
  await new Promise<void>((resolve) => {
    const tick = () => {
      const elapsed = performance.now() - startT
      const frac = Math.min(1, elapsed / totalMs)
      drawFrame(Math.min(totalFrames - 1, Math.floor(frac * totalFrames)), totalFrames)
      onProgress?.(frac)
      if (elapsed >= totalMs) resolve()
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })

  recorder.stop()
  try {
    source?.stop()
  } catch {
    /* already stopped */
  }
  await stopped
  void audioCtx?.close()

  return {
    blob: new Blob(chunks, { type: mime }),
    mimeType: mime,
    codec: mime,
    hasAudio,
  }
}
