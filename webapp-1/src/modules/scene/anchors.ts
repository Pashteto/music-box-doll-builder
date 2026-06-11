import type { SlotType, Vec3 } from '@/lib/types'

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
