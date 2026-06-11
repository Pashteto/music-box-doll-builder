// Throwaway WebCodecs + mp4-muxer encoder used by the /spike route to de-risk E10
// (in-browser MP4 export on Safari). This is the seed of E10-T3's real pipeline;
// fold it in there once the editor exists.

import { Muxer, ArrayBufferTarget } from 'mp4-muxer'

export interface SpikeRenderOptions {
  width: number
  height: number
  fps: number
  durationSeconds: number
  /** Render the scene for a given frame (0..totalFrames-1), then return the canvas to capture. */
  drawFrame: (frameIndex: number, totalFrames: number) => HTMLCanvasElement
  onProgress?: (done: number, total: number) => void
}

// H.264 codec candidates, ordered most→least preferred. Level 4.x covers 1080×1920.
const AVC_CANDIDATES = ['avc1.640028', 'avc1.42002a', 'avc1.420028', 'avc1.42001f']

async function pickSupportedCodec(
  width: number,
  height: number,
  framerate: number,
  bitrate: number,
): Promise<string | null> {
  if (typeof VideoEncoder === 'undefined' || !VideoEncoder.isConfigSupported) return null
  for (const codec of AVC_CANDIDATES) {
    try {
      const { supported } = await VideoEncoder.isConfigSupported({
        codec,
        width,
        height,
        framerate,
        bitrate,
      })
      if (supported) return codec
    } catch {
      // try next candidate
    }
  }
  return null
}

export interface SpikeRenderResult {
  blob: Blob
  codec: string
  frames: number
}

export async function renderSpikeMp4(opts: SpikeRenderOptions): Promise<SpikeRenderResult> {
  const { width, height, fps, durationSeconds, drawFrame, onProgress } = opts
  const totalFrames = Math.max(1, Math.round(fps * durationSeconds))
  const bitrate = 6_000_000

  const codec = await pickSupportedCodec(width, height, fps, bitrate)
  if (!codec) {
    throw new Error('WebCodecs VideoEncoder with H.264 is not supported in this browser')
  }

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width, height },
    fastStart: 'in-memory',
  })

  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      throw e
    },
  })
  encoder.configure({ codec, width, height, framerate: fps, bitrate })

  const frameDurationUs = 1_000_000 / fps

  for (let i = 0; i < totalFrames; i++) {
    const canvas = drawFrame(i, totalFrames)
    const frame = new VideoFrame(canvas, {
      timestamp: Math.round(i * frameDurationUs),
      duration: Math.round(frameDurationUs),
    })
    // Keyframe every second keeps the file seekable.
    encoder.encode(frame, { keyFrame: i % fps === 0 })
    frame.close()
    onProgress?.(i + 1, totalFrames)

    // Avoid unbounded encoder backpressure on long renders.
    if (encoder.encodeQueueSize > fps) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    }
  }

  await encoder.flush()
  encoder.close()
  muxer.finalize()

  const { buffer } = muxer.target
  return { blob: new Blob([buffer], { type: 'video/mp4' }), codec, frames: totalFrames }
}
