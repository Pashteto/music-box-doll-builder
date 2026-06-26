import { afterEach, describe, expect, it, vi } from 'vitest'
import { decodeAudioToDuration } from '@/modules/render/audioDecode'

class FakeAudioBuffer {
  constructor(
    public sampleRate: number,
    public numberOfChannels: number,
    private data: Float32Array,
  ) {}
  getChannelData() {
    return this.data
  }
}

function installAudioContext(decode: () => Promise<unknown>) {
  ;(globalThis as unknown as { AudioContext: unknown }).AudioContext = class {
    decodeAudioData = decode
    close = vi.fn()
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  delete (globalThis as unknown as { AudioContext?: unknown }).AudioContext
  delete (globalThis as unknown as { webkitAudioContext?: unknown }).webkitAudioContext
})

describe('decodeAudioToDuration', () => {
  it('returns unsupported when no AudioContext exists', async () => {
    const res = await decodeAudioToDuration('a.mp3', 10)
    expect(res).toEqual({ ok: false, reason: 'unsupported' })
  })

  it('returns fetch-failed after retry exhausted', async () => {
    installAudioContext(() => Promise.resolve(new FakeAudioBuffer(48000, 1, new Float32Array(10))))
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
    const res = await decodeAudioToDuration('a.mp3', 10)
    expect(res).toEqual({ ok: false, reason: 'fetch-failed' })
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2) // initial + 1 retry
  })

  it('returns decode-failed when decodeAudioData throws', async () => {
    installAudioContext(() => Promise.reject(new Error('bad data')))
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }),
    )
    const res = await decodeAudioToDuration('a.mp3', 10)
    expect(res).toEqual({ ok: false, reason: 'decode-failed' })
  })

  it('tiles a short buffer to the requested duration on success', async () => {
    const src = new Float32Array([1, 2, 3]) // 3 frames
    installAudioContext(() => Promise.resolve(new FakeAudioBuffer(10, 1, src)))
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }),
    )
    const res = await decodeAudioToDuration('a.mp3', 1) // 10 frames target
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.audio.numberOfFrames).toBe(10)
      expect(Array.from(res.audio.channelData[0]!)).toEqual([1, 2, 3, 1, 2, 3, 1, 2, 3, 1])
    }
  })
})
