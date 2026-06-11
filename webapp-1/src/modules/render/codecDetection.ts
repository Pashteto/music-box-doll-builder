// Render pipeline capability detection (E10-T1).

export type RenderPipeline = 'webcodecs' | 'mediarecorder' | 'none'

export interface CodecCapabilities {
  pipeline: RenderPipeline
  /** Chosen H.264 codec string for WebCodecs (when pipeline === 'webcodecs'). */
  videoCodec?: string
  /** Whether AudioEncoder (AAC) is usable for muxing sound into the MP4. */
  hasAudioEncoder: boolean
  /** Chosen MediaRecorder MIME type (when pipeline === 'mediarecorder'). */
  mediaRecorderMime?: string
}

// Level 4.x covers 1080×1920; ordered most→least preferred.
const AVC_CANDIDATES = ['avc1.640028', 'avc1.42002a', 'avc1.420028', 'avc1.42001f']
const MR_MIME_CANDIDATES = [
  'video/mp4;codecs=avc1.640028',
  'video/mp4;codecs=h264',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
]

async function pickVideoCodec(
  width: number,
  height: number,
  framerate: number,
  bitrate: number,
): Promise<string | undefined> {
  if (typeof VideoEncoder === 'undefined' || !VideoEncoder.isConfigSupported) return undefined
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
      /* try next */
    }
  }
  return undefined
}

async function hasAacEncoder(): Promise<boolean> {
  if (typeof AudioEncoder === 'undefined' || !AudioEncoder.isConfigSupported) return false
  try {
    const { supported } = await AudioEncoder.isConfigSupported({
      codec: 'mp4a.40.2',
      sampleRate: 44100,
      numberOfChannels: 1,
      bitrate: 128_000,
    })
    return !!supported
  } catch {
    return false
  }
}

function pickMediaRecorderMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return undefined
  return MR_MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m))
}

export async function detectRenderPipeline(
  width = 1080,
  height = 1920,
  framerate = 30,
  bitrate = 6_000_000,
): Promise<CodecCapabilities> {
  const videoCodec = await pickVideoCodec(width, height, framerate, bitrate)
  const hasAudioEncoder = await hasAacEncoder()
  const mediaRecorderMime = pickMediaRecorderMime()

  if (videoCodec) {
    return { pipeline: 'webcodecs', videoCodec, hasAudioEncoder, mediaRecorderMime }
  }
  if (mediaRecorderMime) {
    return { pipeline: 'mediarecorder', hasAudioEncoder, mediaRecorderMime }
  }
  return { pipeline: 'none', hasAudioEncoder: false }
}
