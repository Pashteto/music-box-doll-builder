// Primary render path: WebCodecs H.264 video (+ optional AAC audio) → MP4 (E10-T3).
import { Muxer, ArrayBufferTarget } from 'mp4-muxer'
import { decodeAudioToDuration } from '@/modules/render/audioDecode'
import type { RenderParams, RenderResult } from '@/modules/render/renderTypes'
import { detectRenderPipeline } from '@/modules/render/codecDetection'

const AUDIO_CHUNK_FRAMES = 1024

/** Render an MP4 using WebCodecs. Falls back to silent video if audio encoding fails. */
export async function renderWebCodecsMp4(params: RenderParams): Promise<RenderResult> {
  const { width, height, fps, durationSeconds, audioUrl, drawFrame, onProgress } = params
  const caps = await detectRenderPipeline(width, height, fps)
  if (caps.pipeline !== 'webcodecs' || !caps.videoCodec) {
    throw new Error('WebCodecs video encoding is not supported')
  }

  const totalFrames = Math.max(1, Math.round(fps * durationSeconds))
  const wantAudio = !!audioUrl && caps.hasAudioEncoder

  // Pre-decode audio so we know the channel count for the muxer config.
  const decoded = wantAudio ? await decodeAudioToDuration(audioUrl!, durationSeconds) : null

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width, height },
    ...(decoded
      ? {
          audio: {
            codec: 'aac',
            numberOfChannels: decoded.numberOfChannels,
            sampleRate: decoded.sampleRate,
          },
        }
      : {}),
    fastStart: 'in-memory',
  })

  // ── Audio first (independent of the video timeline) ──
  let hasAudio = false
  if (decoded) {
    try {
      let error: unknown = null
      const audioEncoder = new AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
        error: (e) => {
          error = e
        },
      })
      audioEncoder.configure({
        codec: 'mp4a.40.2',
        sampleRate: decoded.sampleRate,
        numberOfChannels: decoded.numberOfChannels,
        bitrate: 128_000,
      })
      for (let offset = 0; offset < decoded.numberOfFrames; offset += AUDIO_CHUNK_FRAMES) {
        const frames = Math.min(AUDIO_CHUNK_FRAMES, decoded.numberOfFrames - offset)
        const planar = new Float32Array(frames * decoded.numberOfChannels)
        for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
          planar.set(decoded.channelData[ch]!.subarray(offset, offset + frames), ch * frames)
        }
        const audioData = new AudioData({
          format: 'f32-planar',
          sampleRate: decoded.sampleRate,
          numberOfFrames: frames,
          numberOfChannels: decoded.numberOfChannels,
          timestamp: Math.round((offset / decoded.sampleRate) * 1_000_000),
          data: planar,
        })
        audioEncoder.encode(audioData)
        audioData.close()
        if (error) throw error
      }
      await audioEncoder.flush()
      audioEncoder.close()
      if (error) throw error
      hasAudio = true
    } catch {
      // Silent video is acceptable if audio encoding fails.
      hasAudio = false
    }
  }

  // ── Video ──
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      throw e
    },
  })
  videoEncoder.configure({
    codec: caps.videoCodec,
    width,
    height,
    framerate: fps,
    bitrate: 6_000_000,
  })

  const frameDurationUs = 1_000_000 / fps
  for (let i = 0; i < totalFrames; i++) {
    const canvas = drawFrame(i, totalFrames)
    const frame = new VideoFrame(canvas, {
      timestamp: Math.round(i * frameDurationUs),
      duration: Math.round(frameDurationUs),
    })
    videoEncoder.encode(frame, { keyFrame: i % fps === 0 })
    frame.close()
    onProgress?.((i + 1) / totalFrames)
    if (videoEncoder.encodeQueueSize > fps) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    }
  }

  await videoEncoder.flush()
  videoEncoder.close()
  muxer.finalize()

  const { buffer } = muxer.target
  return {
    blob: new Blob([buffer], { type: 'video/mp4' }),
    mimeType: 'video/mp4',
    codec: caps.videoCodec,
    hasAudio,
  }
}
