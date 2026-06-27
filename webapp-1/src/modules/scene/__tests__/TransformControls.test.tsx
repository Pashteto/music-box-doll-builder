import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useAppStore } from '@/store'
import { TransformControls } from '@/modules/scene/TransformControls'
import { SLOT_POSITION_BOUNDS } from '@/modules/scene/anchors'
import { createEmptySlotSelections } from '@/lib/types'
import type { AssetManifestEntry } from '@/lib/catalog-types'

const ENTRY = {
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
} as unknown as AssetManifestEntry

function headTransform() {
  return useAppStore.getState().slotSelections.find((s) => s.slotType === 'head')!.transform
}

beforeEach(() => {
  // Seed a selected head with a non-default nudge so Reset has something to undo.
  const selections = createEmptySlotSelections().map((s) =>
    s.slotType === 'head'
      ? {
          ...s,
          assetId: 'head-1',
          transform: {
            position: [0.1, 0.1, 0] as [number, number, number],
            rotation: [0, 0.2, 0] as [number, number, number],
            scale: 1.2,
          },
        }
      : s,
  )
  useAppStore.setState({ slotSelections: selections })
})

describe('TransformControls', () => {
  it('renders all seven controls', () => {
    render(<TransformControls slotType="head" entry={ENTRY} />)
    for (const label of [
      'Left / Right',
      'Up / Down',
      'Forward / Back',
      'Spin',
      'Tilt forward',
      'Tilt sideways',
      'Size',
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument()
    }
  })

  it('clamps an out-of-box position commit to the slot bound', () => {
    render(<TransformControls slotType="head" entry={ENTRY} />)
    // Force a value above head's max Up/Down (0.25).
    fireEvent.change(screen.getByLabelText('Up / Down'), { target: { value: '5' } })
    expect(headTransform().position[1]).toBe(SLOT_POSITION_BOUNDS.head.max[1])
  })

  it('resets the part to its default transform', () => {
    render(<TransformControls slotType="head" entry={ENTRY} />)
    fireEvent.click(screen.getByRole('button', { name: /reset/i }))
    expect(headTransform()).toEqual(ENTRY.defaultTransform)
  })
})
