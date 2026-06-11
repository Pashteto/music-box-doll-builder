// Transform constraint enforcement (E2-T2).
// Pure functions that clamp a transform to an asset's allowed envelope so no
// component can ever push a value out of bounds. Applied inside store actions.

import type { Transform, Vec3 } from '@/lib/types'

export interface ConstraintMetadata {
  minScale: number
  maxScale: number
  minRotation: Vec3
  maxRotation: Vec3
  /** Optional position-offset bounds (used only in global-adjust mode). */
  minPosition?: Vec3
  maxPosition?: Vec3
}

function clamp(value: number, min: number, max: number): number {
  // Guard against inverted or degenerate ranges (min === max → that exact value).
  const lo = Math.min(min, max)
  const hi = Math.max(min, max)
  if (Number.isNaN(value)) return lo
  return Math.min(hi, Math.max(lo, value))
}

export function clampScale(value: number, min: number, max: number): number {
  return clamp(value, min, max)
}

export function clampRotation(rotation: Vec3, minRot: Vec3, maxRot: Vec3): Vec3 {
  return [
    clamp(rotation[0], minRot[0], maxRot[0]),
    clamp(rotation[1], minRot[1], maxRot[1]),
    clamp(rotation[2], minRot[2], maxRot[2]),
  ]
}

export function clampPosition(position: Vec3, min: Vec3, max: Vec3): Vec3 {
  return [
    clamp(position[0], min[0], max[0]),
    clamp(position[1], min[1], max[1]),
    clamp(position[2], min[2], max[2]),
  ]
}

/**
 * Master clamp: returns a new Transform with scale/rotation (and position when
 * bounds are provided) clamped to the asset's metadata. Passing `null` metadata
 * returns the transform unchanged (e.g. before the asset's constraints load).
 */
export function applyConstraints(
  transform: Transform,
  metadata: ConstraintMetadata | null,
): Transform {
  if (!metadata) return transform

  const scale = clampScale(transform.scale, metadata.minScale, metadata.maxScale)
  const rotation = clampRotation(transform.rotation, metadata.minRotation, metadata.maxRotation)
  const position =
    metadata.minPosition && metadata.maxPosition
      ? clampPosition(transform.position, metadata.minPosition, metadata.maxPosition)
      : transform.position

  return { position, rotation, scale }
}
