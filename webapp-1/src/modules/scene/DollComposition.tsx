'use client'

import { useAppStore } from '@/store'
import { SlotMesh } from '@/modules/scene/SlotMesh'
import { AssetLoader } from '@/modules/catalog/AssetLoader'
import { getAssetById } from '@/modules/catalog/useCatalog'
import type { CatalogManifest } from '@/lib/catalog-types'
import type { SlotType } from '@/lib/types'

interface DollCompositionProps {
  manifest: CatalogManifest | null
  selectedSlot?: SlotType | null
  onSelectSlot?: (slot: SlotType) => void
  /** Include scene background/foreground (off during slot editing for clarity). */
  showScene?: boolean
}

/**
 * Renders the assembled doll from store state (E6-T3): one SlotMesh per non-empty
 * slot, plus optional scene background/foreground. Re-keys by slotType so changing
 * one slot never disturbs the others.
 */
export function DollComposition({
  manifest,
  selectedSlot,
  onSelectSlot,
  showScene = true,
}: DollCompositionProps) {
  const slotSelections = useAppStore((s) => s.slotSelections)
  const sceneBackground = useAppStore((s) => s.sceneBackground)
  const sceneForeground = useAppStore((s) => s.sceneForeground)

  const bg = showScene && sceneBackground ? getAssetById(sceneBackground, manifest) : undefined
  const fg = showScene && sceneForeground ? getAssetById(sceneForeground, manifest) : undefined

  return (
    <>
      {slotSelections.map((sel) => (
        <SlotMesh
          key={sel.slotType}
          slotType={sel.slotType}
          assetId={sel.assetId}
          glbFile={sel.assetId ? (getAssetById(sel.assetId, manifest)?.glbFile ?? null) : null}
          transform={sel.transform}
          selected={selectedSlot === sel.slotType}
          onSelect={onSelectSlot}
        />
      ))}
      {bg ? <AssetLoader url={bg.glbFile} transform={bg.defaultTransform} /> : null}
      {fg ? <AssetLoader url={fg.glbFile} transform={fg.defaultTransform} /> : null}
    </>
  )
}
