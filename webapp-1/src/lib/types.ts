// Core data models for the doll composition (E2-T1).
// These are the single source of truth shared by the Zustand store, catalog,
// 3D scene, and IndexedDB persistence.

export type Vec3 = [number, number, number]

/** A constrained transform applied to a placed asset, relative to its slot anchor. */
export interface Transform {
  /** Position offset from the slot anchor (units). */
  position: Vec3
  /** Euler rotation in radians [x, y, z]. */
  rotation: Vec3
  /** Uniform scale multiplier. */
  scale: number
}

export const IDENTITY_TRANSFORM: Transform = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: 1,
}

/**
 * All doll slot types (full Phase-1 taxonomy). The lean MVP only activates a
 * subset (see PHASE1_SLOTS in the editor), but the model carries all of them
 * so saved projects remain forward-compatible.
 */
export const SLOT_TYPES = [
  'head',
  'hair',
  'hat',
  'horns',
  'halo',
  'bodyShell',
  'innerInsert',
  'collar',
  'wings',
  'leftHand',
  'rightHand',
  'leftSleeve',
  'rightSleeve',
  'lowerBody',
  'feetBase',
  'tail',
] as const

export type SlotType = (typeof SLOT_TYPES)[number]

/** A single slot's chosen asset (or empty) plus its user-adjusted transform. */
export interface SlotSelection {
  slotType: SlotType
  assetId: string | null
  transform: Transform
}

/** A placed decorative prop in the scene (multiple allowed). */
export interface PropPlacement {
  /** Unique placement id (a prop asset may be placed more than once). */
  id: string
  assetId: string
  transform: Transform
}

export const EDITOR_MODES = [
  'slot-editor',
  'global-adjust',
  'scene',
  'music',
  'render',
  'share',
] as const

export type EditorMode = (typeof EDITOR_MODES)[number]

/** The full serializable project — persisted to IndexedDB (E4). */
export interface DollProject {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  /** Index into the active slot sequence the user last visited. */
  currentStep: number
  slotSelections: SlotSelection[]
  sceneBackground: string | null
  sceneForeground: string | null
  sceneProps: PropPlacement[]
  musicTrackId: string | null
  /** Render duration in seconds. */
  videoDuration: number
  /** Small data-URL preview for the "Continue Draft" cards. */
  thumbnailDataUrl?: string | null
}

/** Build the initial slot-selection array (one empty entry per slot type). */
export function createEmptySlotSelections(): SlotSelection[] {
  return SLOT_TYPES.map((slotType) => ({
    slotType,
    assetId: null,
    transform: { ...IDENTITY_TRANSFORM, position: [0, 0, 0], rotation: [0, 0, 0] },
  }))
}
