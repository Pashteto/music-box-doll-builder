import type { SlotType } from '@/lib/types'

/** The slots active in the lean MVP editor flow (E6-T1). */
export const PHASE1_SLOTS: SlotType[] = ['head', 'hair', 'bodyShell', 'wings', 'feetBase']

export const SLOT_LABELS: Record<SlotType, string> = {
  head: 'Head',
  hair: 'Hair',
  hat: 'Hat',
  horns: 'Horns',
  halo: 'Halo',
  bodyShell: 'Body',
  innerInsert: 'Inner',
  collar: 'Collar',
  wings: 'Wings',
  leftHand: 'Left Hand',
  rightHand: 'Right Hand',
  leftSleeve: 'Left Sleeve',
  rightSleeve: 'Right Sleeve',
  lowerBody: 'Lower Body',
  feetBase: 'Feet',
  tail: 'Tail',
}
