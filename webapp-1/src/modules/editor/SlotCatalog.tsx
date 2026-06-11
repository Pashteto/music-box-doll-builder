'use client'

/* eslint-disable @next/next/no-img-element */
import { useAppStore } from '@/store'
import { getAssetsForSlot } from '@/modules/catalog/useCatalog'
import type { CatalogManifest } from '@/lib/catalog-types'
import type { SlotType } from '@/lib/types'

interface SlotCatalogProps {
  slotType: SlotType
  manifest: CatalogManifest | null
}

function formatSize(bytes: number): string {
  return bytes >= 1_000_000
    ? `${(bytes / 1_000_000).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1000))} KB`
}

/**
 * Horizontal, scroll-snapping strip of asset cards for the current slot (E6-T2).
 * First card is always "Empty"; tapping a card updates the store and triggers the
 * GLB load in the scene.
 */
export function SlotCatalog({ slotType, manifest }: SlotCatalogProps) {
  const selectedAssetId = useAppStore(
    (s) => s.slotSelections.find((x) => x.slotType === slotType)?.assetId ?? null,
  )
  const selectAsset = useAppStore((s) => s.selectAsset)
  const clearSlot = useAppStore((s) => s.clearSlot)
  const assets = getAssetsForSlot(slotType, manifest)

  return (
    <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <button
        type="button"
        onClick={() => clearSlot(slotType)}
        className={`flex h-24 w-24 shrink-0 snap-center flex-col items-center justify-center rounded-xl border-2 text-xs ${
          selectedAssetId === null
            ? 'border-brand-primary bg-brand-primary/10'
            : 'border-black/10 bg-black/5'
        }`}
      >
        <span className="text-2xl">∅</span>
        Empty
      </button>

      {assets.map((asset) => {
        const active = asset.assetId === selectedAssetId
        return (
          <button
            key={asset.assetId}
            type="button"
            onClick={() => selectAsset(slotType, asset.assetId, asset.defaultTransform)}
            className={`relative flex h-24 w-24 shrink-0 snap-center flex-col items-center justify-end overflow-hidden rounded-xl border-2 ${
              active ? 'border-brand-primary' : 'border-black/10'
            }`}
          >
            <img
              src={asset.previewImage}
              alt={asset.displayName}
              className="absolute inset-0 h-full w-full object-cover"
            />
            <span className="relative z-10 w-full truncate bg-black/45 px-1 py-0.5 text-[10px] text-white">
              {asset.displayName}
              <span className="ml-1 opacity-70">{formatSize(asset.fileSizeBytes)}</span>
            </span>
            {active ? (
              <span className="absolute right-1 top-1 z-10 rounded-full bg-brand-primary px-1 text-[10px] text-white">
                ✓
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
