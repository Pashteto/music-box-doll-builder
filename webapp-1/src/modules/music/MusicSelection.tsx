'use client'

import { useAppStore } from '@/store'
import { useAudioPreview } from '@/modules/music/useAudioPreview'
import type { CatalogManifest } from '@/lib/catalog-types'

interface MusicSelectionProps {
  manifest: CatalogManifest | null
  onRender: () => void
}

/** Track list + audio preview + duration slider + Render CTA (E9). */
export function MusicSelection({ manifest, onRender }: MusicSelectionProps) {
  const musicTrackId = useAppStore((s) => s.musicTrackId)
  const setMusicTrack = useAppStore((s) => s.setMusicTrack)
  const videoDuration = useAppStore((s) => s.videoDuration)
  const setVideoDuration = useAppStore((s) => s.setVideoDuration)
  const { playingUrl, toggle } = useAudioPreview()

  const tracks = manifest?.musicTracks ?? []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {tracks.map((track) => {
          const selected = track.trackId === musicTrackId
          const playing = playingUrl === track.audioFile
          return (
            <div
              key={track.trackId}
              className={`flex items-center gap-3 rounded-xl border-2 p-3 ${
                selected ? 'border-brand-primary bg-brand-primary/5' : 'border-black/10'
              }`}
            >
              <button
                type="button"
                aria-label={playing ? 'Pause preview' : 'Play preview'}
                onClick={() => toggle(track.audioFile)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-primary text-white"
              >
                {playing ? '❚❚' : '▶'}
              </button>
              <button
                type="button"
                onClick={() => setMusicTrack(track.trackId)}
                className="flex flex-1 flex-col items-start text-left"
              >
                <span className="font-medium">{track.displayName}</span>
                <span className="text-xs text-foreground/50">{track.durationSeconds}s</span>
              </button>
              {selected ? <span className="text-brand-primary">✓</span> : null}
            </div>
          )
        })}
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="flex justify-between text-foreground/70">
          <span>Video length</span>
          <span>{videoDuration}s</span>
        </span>
        <input
          type="range"
          min={5}
          max={30}
          step={1}
          value={videoDuration}
          onChange={(e) => setVideoDuration(parseInt(e.target.value, 10))}
          className="h-6 accent-brand-primary"
        />
      </label>

      <button
        type="button"
        onClick={onRender}
        disabled={!musicTrackId}
        className="rounded-xl bg-brand-primary px-5 py-3 text-center font-semibold text-white active:scale-95 disabled:opacity-40"
      >
        {musicTrackId ? 'Render video 🎬' : 'Pick a track first'}
      </button>
    </div>
  )
}
