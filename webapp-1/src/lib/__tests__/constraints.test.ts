import { describe, it, expect } from 'vitest'
import {
  applyConstraints,
  clampPosition,
  clampRotation,
  clampScale,
  type ConstraintMetadata,
} from '@/lib/constraints'
import type { Transform } from '@/lib/types'

describe('clampScale', () => {
  it('clamps above, below, and passes through in-range', () => {
    expect(clampScale(5.0, 0.8, 2.0)).toBe(2.0)
    expect(clampScale(0.5, 0.8, 2.0)).toBe(0.8)
    expect(clampScale(1.0, 0.8, 2.0)).toBe(1.0)
  })
  it('handles equal min/max without NaN', () => {
    expect(clampScale(1.0, 1.0, 1.0)).toBe(1.0)
    expect(clampScale(99, 1.0, 1.0)).toBe(1.0)
  })
})

describe('clampRotation / clampPosition', () => {
  it('clamps each axis independently', () => {
    expect(clampRotation([5, -5, 0.1], [-1, -1, -1], [1, 1, 1])).toEqual([1, -1, 0.1])
    expect(clampPosition([2, -2, 0], [-0.5, -0.5, -0.5], [0.5, 0.5, 0.5])).toEqual([0.5, -0.5, 0])
  })
})

describe('applyConstraints', () => {
  const meta: ConstraintMetadata = {
    minScale: 0.8,
    maxScale: 1.5,
    minRotation: [-0.3, -Math.PI, -0.3],
    maxRotation: [0.3, Math.PI, 0.3],
  }
  const out: Transform = { position: [9, 9, 9], rotation: [9, 9, 9], scale: 9 }

  it('returns the transform unchanged when metadata is null', () => {
    expect(applyConstraints(out, null)).toBe(out)
  })

  it('clamps scale and rotation, leaving position untouched without bounds', () => {
    const r = applyConstraints(out, meta)
    expect(r.scale).toBe(1.5)
    expect(r.rotation).toEqual([0.3, Math.PI, 0.3])
    expect(r.position).toEqual([9, 9, 9])
  })

  it('clamps position when bounds are provided', () => {
    const r = applyConstraints(out, {
      ...meta,
      minPosition: [-0.5, -0.5, -0.5],
      maxPosition: [0.5, 0.5, 0.5],
    })
    expect(r.position).toEqual([0.5, 0.5, 0.5])
  })

  it('is pure (does not mutate input)', () => {
    applyConstraints(out, meta)
    expect(out.scale).toBe(9)
  })
})
