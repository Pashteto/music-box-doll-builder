'use client'

/* eslint-disable @next/next/no-img-element */
import { useAppStore } from '@/store'
import type { AssetManifestEntry, CatalogManifest } from '@/lib/catalog-types'

interface PickerRowProps {
  title: string
  options: AssetManifestEntry[]
  selectedId: string | null
  onPick: (id: string | null) => void
}

function PickerRow({ title, options, selectedId, onPick }: PickerRowProps) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-foreground/80">{title}</h3>
      <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          onClick={() => onPick(null)}
          className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border-2 text-xs ${
            selectedId === null ? 'border-brand-primary bg-brand-primary/10' : 'border-black/10'
          }`}
        >
          None
        </button>
        {options.map((o) => (
          <button
            key={o.assetId}
            type="button"
            onClick={() => onPick(o.assetId)}
            className={`relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border-2 ${
              o.assetId === selectedId ? 'border-brand-primary' : 'border-black/10'
            }`}
          >
            <img
              src={o.previewImage}
              alt={o.displayName}
              className="absolute inset-0 h-full w-full object-cover"
            />
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * Minimal scene decoration for the MVP (E8-T1/T2): background + foreground pickers.
 * Floating props (E8-T3) are deferred. Real-time preview happens via DollComposition.
 */
export function SceneComposer({ manifest }: { manifest: CatalogManifest | null }) {
  const sceneBackground = useAppStore((s) => s.sceneBackground)
  const sceneForeground = useAppStore((s) => s.sceneForeground)
  const setBackground = useAppStore((s) => s.setBackground)
  const setForeground = useAppStore((s) => s.setForeground)

  return (
    <div className="flex flex-col gap-4">
      <PickerRow
        title="Background"
        options={manifest?.backgrounds ?? []}
        selectedId={sceneBackground}
        onPick={setBackground}
      />
      <PickerRow
        title="Foreground"
        options={manifest?.foregrounds ?? []}
        selectedId={sceneForeground}
        onPick={setForeground}
      />
    </div>
  )
}
