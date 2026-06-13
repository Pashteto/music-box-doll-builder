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
        className={`flex h-24 w-24 shrink-0 snap-center flex-col items-center justify-center gap-1 rounded-lg border bg-surface-overlay text-xs uppercase tracking-wide shadow-[inset_0_1px_0_rgba(246,241,233,0.1)] transition-colors ${
          selectedAssetId === null
            ? 'border-brand-accent text-text-secondary shadow-[0_0_0_1px_var(--color-brand-accent),inset_0_1px_0_rgba(246,241,233,0.1)]'
            : 'border-border text-text-muted hover:border-border-glaze'
        }`}
      >
        <span className="text-2xl text-text-faint">∅</span>
        Empty
      </button>

      {assets.map((asset) => {
        const active = asset.assetId === selectedAssetId
        return (
          <button
            key={asset.assetId}
            type="button"
            onClick={() => selectAsset(slotType, asset.assetId, asset.defaultTransform)}
            className={`relative flex h-24 w-24 shrink-0 snap-center flex-col items-center justify-end overflow-hidden rounded-lg border bg-surface-overlay shadow-[inset_0_1px_0_rgba(246,241,233,0.1)] transition-colors ${
              active
                ? 'border-brand-accent shadow-[0_0_0_1px_var(--color-brand-accent),inset_0_1px_0_rgba(246,241,233,0.1)]'
                : 'border-border hover:border-border-glaze'
            }`}
          >
            <img
              src={asset.previewImage}
              alt={asset.displayName}
              className="absolute inset-0 h-full w-full object-cover"
            />
            <span className="relative z-10 w-full truncate bg-gradient-to-t from-ink/85 to-transparent px-1.5 pb-1 pt-2 text-[10px] uppercase tracking-wide text-text-secondary">
              {asset.displayName}
              <span className="ml-1 font-mono lowercase tracking-normal text-text-faint">
                {formatSize(asset.fileSizeBytes)}
              </span>
            </span>
            {active ? (
              <span className="absolute right-1.5 top-1.5 z-10 grid h-[18px] w-[18px] place-items-center rounded-full bg-brand-accent text-[11px] font-bold text-ink">
                ✓
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
