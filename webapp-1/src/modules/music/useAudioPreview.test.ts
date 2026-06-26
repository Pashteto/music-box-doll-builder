import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Controllable Howl mock: capture event handlers so the test can fire them.
const handlers: Record<string, Array<(...a: unknown[]) => void>> = {}
const playSpy = vi.fn()
vi.mock('howler', () => ({
  Howl: class {
    on(ev: string, cb: (...a: unknown[]) => void) {
      ;(handlers[ev] ??= []).push(cb)
    }
    once(ev: string, cb: (...a: unknown[]) => void) {
      ;(handlers[ev] ??= []).push(cb)
    }
    play = playSpy
    stop() {}
    unload() {}
  },
}))

function fire(ev: string) {
  for (const cb of handlers[ev] ?? []) cb()
}

import { useAudioPreview } from '@/modules/music/useAudioPreview'

beforeEach(() => {
  for (const k of Object.keys(handlers)) delete handlers[k]
  playSpy.mockClear()
})
afterEach(() => vi.clearAllMocks())

describe('useAudioPreview', () => {
  it('goes loading → playing on play event', () => {
    const { result } = renderHook(() => useAudioPreview())
    act(() => result.current.toggle('a.mp3'))
    expect(result.current.status).toBe('loading')
    act(() => fire('play'))
    expect(result.current.status).toBe('playing')
    expect(result.current.playingUrl).toBe('a.mp3')
  })

  it('retries once on playerror via unlock, then plays', () => {
    const { result } = renderHook(() => useAudioPreview())
    act(() => result.current.toggle('a.mp3'))
    act(() => fire('playerror'))
    act(() => fire('unlock'))
    expect(playSpy).toHaveBeenCalledTimes(2) // initial + unlock retry
  })

  it('goes to error on loaderror', () => {
    const { result } = renderHook(() => useAudioPreview())
    act(() => result.current.toggle('a.mp3'))
    act(() => fire('loaderror'))
    expect(result.current.status).toBe('error')
    expect(result.current.errorUrl).toBe('a.mp3')
  })
})
