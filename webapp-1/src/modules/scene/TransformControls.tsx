'use client'

import { useAppStore } from '@/store'
import type { ConstraintMetadata } from '@/lib/constraints'
import type { AssetManifestEntry } from '@/lib/catalog-types'
import type { SlotType, Transform } from '@/lib/types'

/** Derive the clamp envelope for an asset from its manifest entry. */
export function entryConstraints(
  entry: AssetManifestEntry,
  withPosition = false,
): ConstraintMetadata {
  return {
    minScale: entry.minScale,
    maxScale: entry.maxScale,
    minRotation: entry.minRotation,
    maxRotation: entry.maxRotation,
    ...(withPosition
      ? { minPosition: [-0.6, -0.6, -0.6] as const, maxPosition: [0.6, 0.6, 0.6] as const }
      : {}),
  }
}

interface TransformControlsProps {
  slotType: SlotType
  entry: AssetManifestEntry
  /** 'slot' = rotation + scale only; 'global' = also position offset. */
  mode?: 'slot' | 'global'
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string
  min: number
  max: number
  step: number
  value: number
  onChange: (v: number) => void
}) {
  return (
    <label className="flex items-center gap-3 text-sm">
      <span className="w-16 shrink-0 text-foreground/70">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-6 flex-1 accent-brand-primary"
      />
    </label>
  )
}

/**
 * Constrained rotation/scale (and optional position) sliders for the asset in a
 * slot (E5-T3). All commits route through updateTransform, which clamps to the
 * asset's envelope — UI can never persist out-of-bounds values.
 */
export function TransformControls({ slotType, entry, mode = 'slot' }: TransformControlsProps) {
  const transform = useAppStore(
    (s) => s.slotSelections.find((x) => x.slotType === slotType)?.transform,
  )
  const updateTransform = useAppStore((s) => s.updateTransform)
  if (!transform) return null

  const metadata = entryConstraints(entry, mode === 'global')

  const commit = (next: Transform) => updateTransform(slotType, next, metadata)

  return (
    <div className="flex flex-col gap-3">
      <Slider
        label="Rotate"
        min={entry.minRotation[1]}
        max={entry.maxRotation[1]}
        step={0.01}
        value={transform.rotation[1]}
        onChange={(v) =>
          commit({
            ...transform,
            rotation: [transform.rotation[0], v, transform.rotation[2]],
          })
        }
      />
      <Slider
        label="Size"
        min={entry.minScale}
        max={entry.maxScale}
        step={0.01}
        value={transform.scale}
        onChange={(v) => commit({ ...transform, scale: v })}
      />
      {mode === 'global' ? (
        <>
          <Slider
            label="Left/Right"
            min={-0.6}
            max={0.6}
            step={0.01}
            value={transform.position[0]}
            onChange={(v) =>
              commit({
                ...transform,
                position: [v, transform.position[1], transform.position[2]],
              })
            }
          />
          <Slider
            label="Up/Down"
            min={-0.6}
            max={0.6}
            step={0.01}
            value={transform.position[1]}
            onChange={(v) =>
              commit({
                ...transform,
                position: [transform.position[0], v, transform.position[2]],
              })
            }
          />
        </>
      ) : null}
    </div>
  )
}
