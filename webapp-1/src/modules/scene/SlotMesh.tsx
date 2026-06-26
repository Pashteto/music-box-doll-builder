'use client'

import { AssetLoader } from '@/modules/catalog/AssetLoader'
import { getAssetById } from '@/modules/catalog/useCatalog'
import { childrenOf, relativeAnchorPosition, relativeAnchorRotation } from '@/modules/scene/anchors'
import { scaleOnlyTransform } from '@/modules/scene/transformBounds'
import { IDENTITY_TRANSFORM, type SlotSelection, type SlotType } from '@/lib/types'
import type { CatalogManifest } from '@/lib/catalog-types'

interface SlotFrameProps {
  slotType: SlotType
  selections: SlotSelection[]
  manifest: CatalogManifest | null
  selectedSlot?: SlotType | null
  onSelectSlot?: (slot: SlotType) => void
}

/** Subtle wireframe box drawn around the selected slot as transform feedback. */
function SelectionHighlight() {
  return (
    <mesh>
      <boxGeometry args={[2.4, 2.4, 2.4]} />
      <meshBasicMaterial color="#f59e0b" wireframe transparent opacity={0.35} />
    </mesh>
  )
}

/**
 * Renders one slot's frame and, nested inside it, its child slots (E-transform).
 *
 * Frame layout (per slot):
 *   <group anchor-relative-to-parent>           // positions this slot's origin
 *     <group user position + rotation>          // the nudge — propagates to children
 *       <AssetLoader scale-only />              // mesh, scaled in isolation (not children)
 *       {children…}                             // inherit parent pos+rot, NOT scale
 *     </group>
 *   </group>
 *
 * Children render regardless of whether the parent slot is filled, so an empty
 * head still positions the hair correctly at its absolute anchor.
 */
export function SlotFrame({
  slotType,
  selections,
  manifest,
  selectedSlot,
  onSelectSlot,
}: SlotFrameProps) {
  const sel = selections.find((s) => s.slotType === slotType)
  const transform = sel?.transform ?? IDENTITY_TRANSFORM
  const assetId = sel?.assetId ?? null
  const glbFile = assetId ? (getAssetById(assetId, manifest)?.glbFile ?? null) : null
  const children = childrenOf(slotType)

  return (
    <group position={relativeAnchorPosition(slotType)} rotation={relativeAnchorRotation(slotType)}>
      <group
        position={transform.position}
        rotation={transform.rotation}
        onClick={
          onSelectSlot
            ? (e) => {
                e.stopPropagation()
                onSelectSlot(slotType)
              }
            : undefined
        }
      >
        {assetId && glbFile ? (
          <AssetLoader url={glbFile} transform={scaleOnlyTransform(transform)} />
        ) : null}
        {selectedSlot === slotType && assetId ? <SelectionHighlight /> : null}
        {children.map((child) => (
          <SlotFrame
            key={child}
            slotType={child}
            selections={selections}
            manifest={manifest}
            selectedSlot={selectedSlot}
            onSelectSlot={onSelectSlot}
          />
        ))}
      </group>
    </group>
  )
}
