// Decode a music track and tile/trim it to an exact duration (shared by both pipelines).

export interface DecodedAudio {
  sampleRate: number
  channelData: Float32Array[] // one Float32Array per channel
  numberOfChannels: number
  numberOfFrames: number
}

/** Fetch + decode an audio URL, then loop/trim it to exactly `durationSeconds`. */
export async function decodeAudioToDuration(
  url: string,
  durationSeconds: number,
): Promise<DecodedAudio | null> {
  try {
    const Ctx: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    const res = await fetch(url)
    const arr = await res.arrayBuffer()
    const buffer = await ctx.decodeAudioData(arr)
    void ctx.close()

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

    return { sampleRate, channelData, numberOfChannels, numberOfFrames: targetFrames }
  } catch {
    return null
  }
}
