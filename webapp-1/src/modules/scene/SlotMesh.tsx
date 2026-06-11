'use client'

import { AssetLoader } from '@/modules/catalog/AssetLoader'
import { SLOT_ANCHORS } from '@/modules/scene/anchors'
import type { SlotType, Transform } from '@/lib/types'

interface SlotMeshProps {
  slotType: SlotType
  assetId: string | null
  glbFile: string | null
  transform: Transform
  selected?: boolean
  onSelect?: (slotType: SlotType) => void
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
 * Places a slot's asset at its anchor (E5-T2). Renders nothing for an empty slot.
 * The asset's user transform is applied by AssetLoader; the anchor positions the group.
 */
export function SlotMesh({
  slotType,
  assetId,
  glbFile,
  transform,
  selected = false,
  onSelect,
}: SlotMeshProps) {
  if (!assetId || !glbFile) return null
  const anchor = SLOT_ANCHORS[slotType]

  return (
    <group
      position={anchor.position}
      rotation={anchor.rotation}
      onClick={
        onSelect
          ? (e) => {
              e.stopPropagation()
              onSelect(slotType)
            }
          : undefined
      }
    >
      <AssetLoader url={glbFile} transform={transform} />
      {selected ? <SelectionHighlight /> : null}
    </group>
  )
}
