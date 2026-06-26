'use client'

import { useEffect, useRef, useState } from 'react'
import { Howl } from 'howler'

export type PreviewStatus = 'idle' | 'loading' | 'playing' | 'error'

/**
 * Single-track audio preview (E9-T2). Playback starts inside a user gesture
 * (mobile Safari autoplay policy). On a `playerror` (typically a locked
 * AudioContext on iOS), we retry once on Howler's `unlock` event before giving
 * up. Howler is loaded only on the music screen (kept off the landing bundle).
 */
export function useAudioPreview() {
  const howlRef = useRef<Howl | null>(null)
  const [status, setStatus] = useState<PreviewStatus>('idle')
  const [activeUrl, setActiveUrl] = useState<string | null>(null)
  const [errorUrl, setErrorUrl] = useState<string | null>(null)

  const stop = () => {
    howlRef.current?.stop()
    howlRef.current?.unload()
    howlRef.current = null
    setStatus('idle')
    setActiveUrl(null)
  }

  const toggle = (url: string) => {
    if (activeUrl === url && (status === 'playing' || status === 'loading')) {
      stop()
      return
    }
    stop()
    setErrorUrl(null)
    setActiveUrl(url)
    setStatus('loading')

    const howl = new Howl({ src: [url], html5: true, volume: 0.7 })
    let retried = false
    howl.on('play', () => setStatus((s) => (s === 'error' ? s : 'playing')))
    howl.on('end', () => setStatus((s) => (s === 'playing' ? 'idle' : s)))
    howl.on('loaderror', () => {
      setErrorUrl(url)
      setStatus('error')
    })
    howl.on('playerror', () => {
      if (!retried) {
        retried = true
        howl.once('unlock', () => howl.play())
      } else {
        setErrorUrl(url)
        setStatus('error')
      }
    })
    howl.play()
    howlRef.current = howl
  }

  useEffect(() => {
    return () => {
      howlRef.current?.stop()
      howlRef.current?.unload()
      howlRef.current = null
    }
  }, [])

  const playingUrl = status === 'playing' ? activeUrl : null
  return { status, activeUrl, errorUrl, playingUrl, toggle, stop }
}
