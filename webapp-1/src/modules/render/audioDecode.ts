// Decode a music track and tile/trim it to an exact duration (shared by both pipelines).

export interface DecodedAudio {
  sampleRate: number
  channelData: Float32Array[] // one Float32Array per channel
  numberOfChannels: number
  numberOfFrames: number
}

export type DecodeFailureReason = 'fetch-failed' | 'decode-failed' | 'unsupported'

export type DecodeResult =
  | { ok: true; audio: DecodedAudio }
  | { ok: false; reason: DecodeFailureReason }

const FETCH_TIMEOUT_MS = 15_000
const FETCH_ATTEMPTS = 2 // initial + 1 retry

async function fetchArrayBufferWithRetry(url: string): Promise<ArrayBuffer> {
  let lastErr: unknown
  for (let attempt = 0; attempt < FETCH_ATTEMPTS; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      const res = await fetch(url, { signal: controller.signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.arrayBuffer()
    } catch (err) {
      lastErr = err
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastErr
}

/** Fetch + decode an audio URL, then loop/trim it to exactly `durationSeconds`. */
export async function decodeAudioToDuration(
  url: string,
  durationSeconds: number,
): Promise<DecodeResult> {
  const Ctx: typeof AudioContext | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctx) return { ok: false, reason: 'unsupported' }

  let arr: ArrayBuffer
  try {
    arr = await fetchArrayBufferWithRetry(url)
  } catch {
    return { ok: false, reason: 'fetch-failed' }
  }

  const ctx = new Ctx()
  try {
    const buffer = await ctx.decodeAudioData(arr)
    const sampleRate = buffer.sampleRate
    const numberOfChannels = buffer.numberOfChannels
    const targetFrames = Math.floor(sampleRate * durationSeconds)

    const channelData: Float32Array[] = []
    for (let ch = 0; ch < numberOfChannels; ch++) {
      const src = buffer.getChannelData(ch)
      const out = new Float32Array(targetFrames)
      if (src.length > 0) {
        for (let i = 0; i < targetFrames; i++) out[i] = src[i % src.length]!
      }
      channelData.push(out)
    }

    return {
      ok: true,
      audio: { sampleRate, channelData, numberOfChannels, numberOfFrames: targetFrames },
    }
  } catch {
    return { ok: false, reason: 'decode-failed' }
  } finally {
    void ctx.close()
  }
}
