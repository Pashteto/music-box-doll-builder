// Pure helpers bridging manifest constraints + the per-slot position bounds (E-transform).

import type { ConstraintMetadata } from '@/lib/constraints'
import type { AssetManifestEntry } from '@/lib/catalog-types'
import type { SlotType, Transform } from '@/lib/types'
import { SLOT_POSITION_BOUNDS } from '@/modules/scene/anchors'

/**
 * Full clamp envelope for an asset placed in a slot: scale + rotation come from the
 * asset's manifest entry; position-offset bounds come from the slot's role in the doll.
 */
export function slotConstraints(entry: AssetManifestEntry, slotType: SlotType): ConstraintMetadata {
  const box = SLOT_POSITION_BOUNDS[slotType]
  return {
    minScale: entry.minScale,
    maxScale: entry.maxScale,
    minRotation: entry.minRotation,
    maxRotation: entry.maxRotation,
    minPosition: box.min,
    maxPosition: box.max,
  }
}

/**
 * Strip a transform down to its scale. The parent "nudge" group already applies
 * position + rotation, so the mesh itself must only carry scale — and scale must
 * not propagate to child slots.
 */
export function scaleOnlyTransform(t: Transform): Transform {
  return { position: [0, 0, 0], rotation: [0, 0, 0], scale: t.scale }
}
