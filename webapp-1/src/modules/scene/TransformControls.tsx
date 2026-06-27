'use client'

import { useAppStore } from '@/store'
import { slotConstraints } from '@/modules/scene/transformBounds'
import { SLOT_POSITION_BOUNDS } from '@/modules/scene/anchors'
import type { AssetManifestEntry } from '@/lib/catalog-types'
import type { SlotType, Transform, Vec3 } from '@/lib/types'

interface TransformControlsProps {
  slotType: SlotType
  entry: AssetManifestEntry
}

function Slider({
  label,
  min,
  max,
  value,
  onChange,
}: {
  label: string
  min: number
  max: number
  value: number
  onChange: (v: number) => void
}) {
  return (
    <label className="flex items-center gap-3 text-sm">
      <span className="w-24 shrink-0 text-text-secondary">{label}</span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={0.01}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-6 flex-1 accent-brand-primary"
      />
    </label>
  )
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
      {children}
    </span>
  )
}

/**
 * Constrained 6-DOF + scale sliders for the asset in a slot (E-transform). Position
 * bounds come from the slot's role (SLOT_POSITION_BOUNDS); rotation + scale bounds
 * from the asset manifest. Every commit routes through updateTransform → applyConstraints,
 * so the UI can never persist an out-of-bounds value. Reset restores the asset default.
 */
export function TransformControls({ slotType, entry }: TransformControlsProps) {
  const transform = useAppStore(
    (s) => s.slotSelections.find((x) => x.slotType === slotType)?.transform,
  )
  const updateTransform = useAppStore((s) => s.updateTransform)
  if (!transform) return null

  const metadata = slotConstraints(entry, slotType)
  const box = SLOT_POSITION_BOUNDS[slotType]
  const commit = (next: Transform) => updateTransform(slotType, next, metadata)

  const setPos = (axis: 0 | 1 | 2, v: number) => {
    const position = [...transform.position] as Vec3
    position[axis] = v
    commit({ ...transform, position })
  }
  const setRot = (axis: 0 | 1 | 2, v: number) => {
    const rotation = [...transform.rotation] as Vec3
    rotation[axis] = v
    commit({ ...transform, rotation })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <GroupLabel>Move</GroupLabel>
        <Slider
          label="Left / Right"
          min={box.min[0]}
          max={box.max[0]}
          value={transform.position[0]}
          onChange={(v) => setPos(0, v)}
        />
        <Slider
          label="Up / Down"
          min={box.min[1]}
          max={box.max[1]}
          value={transform.position[1]}
          onChange={(v) => setPos(1, v)}
        />
        <Slider
          label="Forward / Back"
          min={box.min[2]}
          max={box.max[2]}
          value={transform.position[2]}
          onChange={(v) => setPos(2, v)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <GroupLabel>Rotate</GroupLabel>
        <Slider
          label="Spin"
          min={entry.minRotation[1]}
          max={entry.maxRotation[1]}
          value={transform.rotation[1]}
          onChange={(v) => setRot(1, v)}
        />
        <Slider
          label="Tilt forward"
          min={entry.minRotation[0]}
          max={entry.maxRotation[0]}
          value={transform.rotation[0]}
          onChange={(v) => setRot(0, v)}
        />
        <Slider
          label="Tilt sideways"
          min={entry.minRotation[2]}
          max={entry.maxRotation[2]}
          value={transform.rotation[2]}
          onChange={(v) => setRot(2, v)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <GroupLabel>Size</GroupLabel>
        <Slider
          label="Size"
          min={entry.minScale}
          max={entry.maxScale}
          value={transform.scale}
          onChange={(v) => commit({ ...transform, scale: v })}
        />
      </div>

      <button
        type="button"
        onClick={() => commit(entry.defaultTransform)}
        className="self-start text-xs font-semibold uppercase tracking-[0.12em] text-link transition-colors hover:text-brand-primary-hover"
      >
        ↺ Reset part
      </button>
    </div>
  )
}
