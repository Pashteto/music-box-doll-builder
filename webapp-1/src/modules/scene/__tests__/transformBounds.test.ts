import { describe, it, expect } from 'vitest'
import type { AssetManifestEntry } from '@/lib/catalog-types'
import { slotConstraints, scaleOnlyTransform } from '@/modules/scene/transformBounds'
import { SLOT_POSITION_BOUNDS } from '@/modules/scene/anchors'

const ENTRY: AssetManifestEntry = {
  assetId: 'head-1',
  slotType: 'head',
  displayName: 'Head',
  previewImage: 'p.svg',
  glbFile: 'head.glb',
  textureFormat: 'embedded',
  defaultTransform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 },
  minScale: 0.8,
  maxScale: 1.5,
  minRotation: [-0.3, -Math.PI, -0.3],
  maxRotation: [0.3, Math.PI, 0.3],
  anchorPoint: [0, 0, 0],
  excludes: [],
  dependencies: [],
  fileSizeBytes: 1000,
  triangleCount: 100,
}

describe('slotConstraints', () => {
  it('takes scale + rotation from the manifest and position from the slot table', () => {
    const m = slotConstraints(ENTRY, 'head')
    expect(m.minScale).toBe(0.8)
    expect(m.maxScale).toBe(1.5)
    expect(m.minRotation).toEqual([-0.3, -Math.PI, -0.3])
    expect(m.maxRotation).toEqual([0.3, Math.PI, 0.3])
    expect(m.minPosition).toEqual(SLOT_POSITION_BOUNDS.head.min)
    expect(m.maxPosition).toEqual(SLOT_POSITION_BOUNDS.head.max)
  })
})

describe('scaleOnlyTransform', () => {
  it('zeroes position + rotation and keeps scale', () => {
    expect(
      scaleOnlyTransform({ position: [1, 2, 3], rotation: [0.1, 0.2, 0.3], scale: 1.4 }),
    ).toEqual({ position: [0, 0, 0], rotation: [0, 0, 0], scale: 1.4 })
  })
})
