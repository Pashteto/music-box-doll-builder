import { describe, it, expect } from 'vitest'
import { SLOT_TYPES } from '@/lib/types'
import {
  SLOT_ANCHORS,
  SLOT_POSITION_BOUNDS,
  ROOT_SLOTS,
  childrenOf,
  relativeAnchorPosition,
  relativeAnchorRotation,
} from '@/modules/scene/anchors'

describe('SLOT_POSITION_BOUNDS', () => {
  it('defines a box for every slot type', () => {
    for (const slot of SLOT_TYPES) {
      expect(SLOT_POSITION_BOUNDS[slot]).toBeDefined()
      expect(SLOT_POSITION_BOUNDS[slot].min).toHaveLength(3)
      expect(SLOT_POSITION_BOUNDS[slot].max).toHaveLength(3)
    }
  })

  it('keeps the lowest possible head above the highest possible feet', () => {
    const headLowestY = SLOT_ANCHORS.head.position[1] + SLOT_POSITION_BOUNDS.head.min[1]
    const feetHighestY = SLOT_ANCHORS.feetBase.position[1] + SLOT_POSITION_BOUNDS.feetBase.max[1]
    expect(headLowestY).toBeGreaterThan(feetHighestY)
  })
})

describe('parent tree helpers', () => {
  it('roots exclude any parented slot', () => {
    expect(ROOT_SLOTS).toContain('head')
    expect(ROOT_SLOTS).not.toContain('hair')
    expect(ROOT_SLOTS).not.toContain('collar')
  })

  it('lists the head children', () => {
    expect(childrenOf('head').sort()).toEqual(['hair', 'halo', 'hat', 'horns'].sort())
  })

  it('returns an empty array for a childless slot', () => {
    expect(childrenOf('hair')).toEqual([])
  })

  it('expresses a child anchor relative to its parent', () => {
    // hair anchor [0,2.6,0] minus head anchor [0,2.2,0]
    const result = relativeAnchorPosition('hair')
    expect(result[0]).toBe(0)
    expect(result[1]).toBeCloseTo(0.4, 10)
    expect(result[2]).toBe(0)
  })

  it('returns the absolute anchor for a root slot', () => {
    expect(relativeAnchorPosition('head')).toEqual(SLOT_ANCHORS.head.position)
  })

  it('relative rotation of a child is zero (all anchors are unrotated)', () => {
    expect(relativeAnchorRotation('hair')).toEqual([0, 0, 0])
  })

  it('expresses body-subtree child anchors relative to bodyShell', () => {
    // collar anchor [0,1.2,0] minus bodyShell anchor [0,0.2,0]
    expect(relativeAnchorPosition('collar')).toEqual([0, 1, 0])
    // innerInsert shares the bodyShell anchor [0,0.2,0] → zero offset
    expect(relativeAnchorPosition('innerInsert')).toEqual([0, 0, 0])
  })
})
