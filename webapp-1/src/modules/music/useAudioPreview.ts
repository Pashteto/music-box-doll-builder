'use client'

import { useEffect, useRef, useState } from 'react'
import { Howl } from 'howler'

/**
 * Single-track audio preview (E9-T2). Playback is started inside a user gesture
 * (mobile Safari autoplay policy) and the previous track is stopped before a new
 * one plays. Howler is loaded only on the music screen (kept off the landing bundle).
 */
export function useAudioPreview() {
  const howlRef = useRef<Howl | null>(null)
  const [playingUrl, setPlayingUrl] = useState<string | null>(null)

  const stop = () => {
    howlRef.current?.stop()
    howlRef.current?.unload()
    howlRef.current = null
    setPlayingUrl(null)
  }

  const toggle = (url: string) => {
    if (playingUrl === url) {
      stop()
      return
    }
    stop()
    const howl = new Howl({ src: [url], html5: true, volume: 0.7 })
    howl.on('end', () => setPlayingUrl((cur) => (cur === url ? null : cur)))
    howl.play()
    howlRef.current = howl
    setPlayingUrl(url)
  }

  useEffect(() => {
    return () => {
      howlRef.current?.stop()
      howlRef.current?.unload()
      howlRef.current = null
    }
  }, [])

  return { playingUrl, toggle, stop }
}
