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
  const { status, activeUrl, errorUrl, toggle } = useAudioPreview()

  const tracks = manifest?.musicTracks ?? []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {tracks.map((track) => {
          const selected = track.trackId === musicTrackId
          const isActive = activeUrl === track.audioFile
          const playing = isActive && status === 'playing'
          const loading = isActive && status === 'loading'
          const errored = errorUrl === track.audioFile
          const glyph = loading ? '…' : playing ? '❚❚' : errored ? '↻' : '▶'
          return (
            <div
              key={track.trackId}
              className={`flex items-center gap-3 rounded-xl border p-3 shadow-[inset_0_1px_0_rgba(246,241,233,0.1)] transition-colors ${
                selected ? 'border-brand-primary bg-brand-primary/10' : 'border-border bg-surface'
              }`}
            >
              <button
                type="button"
                aria-busy={loading}
                aria-label={
                  loading
                    ? 'Loading preview'
                    : playing
                      ? 'Pause preview'
                      : errored
                        ? 'Retry preview'
                        : 'Play preview'
                }
                onClick={() => toggle(track.audioFile)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-primary text-sm text-foreground shadow-[0_0_0_1px_rgba(192,58,74,0.30),inset_0_1px_0_rgba(246,241,233,0.1)] transition-colors hover:bg-brand-primary-hover disabled:opacity-50"
              >
                {glyph}
              </button>
              <button
                type="button"
                onClick={() => setMusicTrack(track.trackId)}
                className="flex flex-1 flex-col items-start text-left"
              >
                <span className="font-medium text-text-heading">{track.displayName}</span>
                <span className="text-xs text-text-faint">
                  {errored ? "Couldn't play — tap ↻ to retry" : `${track.durationSeconds}s`}
                </span>
              </button>
              {selected ? <span className="text-brand-primary">✓</span> : null}
            </div>
          )
        })}
      </div>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="flex justify-between">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
            Video length
          </span>
          <span className="font-mono text-xs text-brand-secondary">{videoDuration}s</span>
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
        className="inline-flex min-h-11 w-full items-center justify-center gap-2.5 rounded-full bg-brand-primary px-6 py-3.5 text-center text-[0.9375rem] font-semibold text-foreground shadow-[0_0_0_1px_rgba(192,58,74,0.30),0_8px_28px_-6px_rgba(161,29,44,0.45),inset_0_1px_0_rgba(246,241,233,0.1)] transition-colors hover:bg-brand-primary-hover active:translate-y-px active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-surface-overlay disabled:text-text-faint disabled:shadow-none"
      >
        {musicTrackId ? 'Render the film' : 'Pick a track first'}
      </button>
    </div>
  )
}
