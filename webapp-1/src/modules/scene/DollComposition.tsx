'use client'

import { useAppStore } from '@/store'
import { SlotFrame } from '@/modules/scene/SlotMesh'
import { AssetLoader } from '@/modules/catalog/AssetLoader'
import { getAssetById } from '@/modules/catalog/useCatalog'
import { ROOT_SLOTS } from '@/modules/scene/anchors'
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
 * Renders the assembled doll from store state (E6-T3, E-transform): one recursive
 * SlotFrame per root slot (children nest inside their parent), plus optional scene
 * background/foreground. Re-keys by root slotType so changing one slot never
 * disturbs the others.
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
      {ROOT_SLOTS.map((slot) => (
        <SlotFrame
          key={slot}
          slotType={slot}
          selections={slotSelections}
          manifest={manifest}
          selectedSlot={selectedSlot}
          onSelectSlot={onSelectSlot}
        />
      ))}
      {bg ? <AssetLoader url={bg.glbFile} transform={bg.defaultTransform} /> : null}
      {fg ? <AssetLoader url={fg.glbFile} transform={fg.defaultTransform} /> : null}
    </>
  )
}
