import { SLOT_TYPES, type SlotType, type Vec3 } from '@/lib/types'

export interface Anchor {
  position: Vec3
  rotation: Vec3
}

/**
 * Authoritative 3D anchor for each slot (E5-T2). Positions form a coherent
 * stacked humanoid doll centered near the origin (total height ~5.5 units).
 *
 * NOTE: the MVP places slots at absolute anchors. True hierarchical parenting
 * (hair/hat following head when the head is moved) is captured in
 * SLOT_PARENT below for a later pass but not yet applied at render time.
 */
export const SLOT_ANCHORS: Record<SlotType, Anchor> = {
  head: { position: [0, 2.2, 0], rotation: [0, 0, 0] },
  hair: { position: [0, 2.6, 0], rotation: [0, 0, 0] },
  hat: { position: [0, 3.0, 0], rotation: [0, 0, 0] },
  horns: { position: [0, 3.0, 0], rotation: [0, 0, 0] },
  halo: { position: [0, 3.5, 0], rotation: [0, 0, 0] },
  bodyShell: { position: [0, 0.2, 0], rotation: [0, 0, 0] },
  innerInsert: { position: [0, 0.2, 0], rotation: [0, 0, 0] },
  collar: { position: [0, 1.2, 0], rotation: [0, 0, 0] },
  wings: { position: [0, 0.6, -0.5], rotation: [0, 0, 0] },
  leftHand: { position: [-1.3, 0.0, 0], rotation: [0, 0, 0] },
  rightHand: { position: [1.3, 0.0, 0], rotation: [0, 0, 0] },
  leftSleeve: { position: [-1.05, 0.5, 0], rotation: [0, 0, 0] },
  rightSleeve: { position: [1.05, 0.5, 0], rotation: [0, 0, 0] },
  lowerBody: { position: [0, -1.0, 0], rotation: [0, 0, 0] },
  feetBase: { position: [0, -2.1, 0], rotation: [0, 0, 0] },
  tail: { position: [0, -1.0, -0.6], rotation: [0, 0, 0] },
}

/** Future hierarchical attachment map (not yet applied — see note above). */
export const SLOT_PARENT: Partial<Record<SlotType, SlotType>> = {
  hair: 'head',
  hat: 'head',
  horns: 'head',
  halo: 'head',
  collar: 'bodyShell',
  innerInsert: 'bodyShell',
}

/** An axis-aligned offset box around a slot's anchor (units), used to clamp position nudges. */
export interface OffsetBox {
  min: Vec3
  max: Vec3
}

/**
 * Per-slot position-offset limits (E-transform). Deliberately tight — this is a
 * "nudge for polish" feature, not free placement. Because anchors are fixed and
 * these boxes are small, nonsense placements are impossible by geometry (e.g. the
 * head can never reach the feet). Tune by eye; keep the head-above-feet invariant.
 */
export const SLOT_POSITION_BOUNDS: Record<SlotType, OffsetBox> = {
  head: { min: [-0.2, -0.25, -0.15], max: [0.2, 0.25, 0.15] },
  hair: { min: [-0.12, -0.15, -0.12], max: [0.12, 0.15, 0.12] },
  hat: { min: [-0.12, -0.15, -0.12], max: [0.12, 0.15, 0.12] },
  horns: { min: [-0.12, -0.15, -0.12], max: [0.12, 0.15, 0.12] },
  halo: { min: [-0.12, -0.15, -0.12], max: [0.12, 0.15, 0.12] },
  collar: { min: [-0.12, -0.12, -0.1], max: [0.12, 0.12, 0.1] },
  innerInsert: { min: [-0.12, -0.12, -0.1], max: [0.12, 0.12, 0.1] },
  bodyShell: { min: [-0.1, -0.1, -0.1], max: [0.1, 0.1, 0.1] },
  lowerBody: { min: [-0.1, -0.1, -0.1], max: [0.1, 0.1, 0.1] },
  feetBase: { min: [-0.1, -0.1, -0.1], max: [0.1, 0.1, 0.1] },
  leftHand: { min: [-0.3, -0.25, -0.2], max: [0.3, 0.25, 0.2] },
  rightHand: { min: [-0.3, -0.25, -0.2], max: [0.3, 0.25, 0.2] },
  leftSleeve: { min: [-0.15, -0.15, -0.12], max: [0.15, 0.15, 0.12] },
  rightSleeve: { min: [-0.15, -0.15, -0.12], max: [0.15, 0.15, 0.12] },
  wings: { min: [-0.15, -0.15, -0.15], max: [0.15, 0.15, 0.15] },
  tail: { min: [-0.15, -0.15, -0.15], max: [0.15, 0.15, 0.15] },
}

/** Slots with no parent — rendered at their absolute anchor. */
export const ROOT_SLOTS: SlotType[] = SLOT_TYPES.filter((s) => !SLOT_PARENT[s])

/** Direct children of a slot in the attachment hierarchy. */
export function childrenOf(slot: SlotType): SlotType[] {
  return SLOT_TYPES.filter((s) => SLOT_PARENT[s] === slot)
}

/** A slot's anchor position expressed relative to its parent (absolute if it has no parent). */
export function relativeAnchorPosition(slot: SlotType): Vec3 {
  const a = SLOT_ANCHORS[slot].position
  const parent = SLOT_PARENT[slot]
  if (!parent) return [...a] as Vec3
  const p = SLOT_ANCHORS[parent].position
  return [a[0] - p[0], a[1] - p[1], a[2] - p[2]]
}

/** A slot's anchor rotation expressed relative to its parent (absolute if it has no parent). */
export function relativeAnchorRotation(slot: SlotType): Vec3 {
  const a = SLOT_ANCHORS[slot].rotation
  const parent = SLOT_PARENT[slot]
  if (!parent) return [...a] as Vec3
  const p = SLOT_ANCHORS[parent].rotation
  return [a[0] - p[0], a[1] - p[1], a[2] - p[2]]
}
