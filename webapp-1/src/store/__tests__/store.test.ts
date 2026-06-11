import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from '@/store'
import { SLOT_TYPES } from '@/lib/types'
import type { ConstraintMetadata } from '@/lib/constraints'

function resetStore() {
  const s = useAppStore.getState()
  s.resetComposition()
  useAppStore.setState({ currentStep: 0, isReviewMode: false, activeSlots: [...SLOT_TYPES] })
}

beforeEach(resetStore)

describe('compositionSlice', () => {
  it('initializes one empty selection per slot type', () => {
    const { slotSelections } = useAppStore.getState()
    expect(slotSelections).toHaveLength(SLOT_TYPES.length)
    expect(slotSelections.every((s) => s.assetId === null)).toBe(true)
  })

  it('selectAsset sets assetId + transform, clearSlot resets it', () => {
    useAppStore.getState().selectAsset('head', 'head-round-01', {
      position: [0, 1, 0],
      rotation: [0, 0, 0],
      scale: 1.2,
    })
    let head = useAppStore.getState().slotSelections.find((s) => s.slotType === 'head')
    expect(head?.assetId).toBe('head-round-01')
    expect(head?.transform.scale).toBe(1.2)

    useAppStore.getState().clearSlot('head')
    head = useAppStore.getState().slotSelections.find((s) => s.slotType === 'head')
    expect(head?.assetId).toBeNull()
  })

  it('updateTransform clamps to the asset envelope', () => {
    const meta: ConstraintMetadata = {
      minScale: 0.8,
      maxScale: 1.5,
      minRotation: [-0.3, -Math.PI, -0.3],
      maxRotation: [0.3, Math.PI, 0.3],
    }
    useAppStore.getState().selectAsset('hair', 'hair-long-01')
    useAppStore
      .getState()
      .updateTransform('hair', { position: [0, 0, 0], rotation: [0, 0, 0], scale: 99 }, meta)
    const hair = useAppStore.getState().slotSelections.find((s) => s.slotType === 'hair')
    expect(hair?.transform.scale).toBe(1.5)
  })

  it('addProp/removeProp manage the props array', () => {
    const id = useAppStore.getState().addProp('prop-star-01')
    expect(useAppStore.getState().sceneProps).toHaveLength(1)
    useAppStore.getState().removeProp(id)
    expect(useAppStore.getState().sceneProps).toHaveLength(0)
  })

  it('setBackground / setMusicTrack / setVideoDuration update state', () => {
    useAppStore.getState().setBackground('bg-music-box-classic')
    useAppStore.getState().setMusicTrack('track-music-box-waltz')
    useAppStore.getState().setVideoDuration(15)
    const s = useAppStore.getState()
    expect(s.sceneBackground).toBe('bg-music-box-classic')
    expect(s.musicTrackId).toBe('track-music-box-waltz')
    expect(s.videoDuration).toBe(15)
  })
})

describe('editorSlice navigation', () => {
  it('advances through active slots and enters review at the end', () => {
    useAppStore.getState().setActiveSlots(['head', 'hair', 'bodyShell'])
    const { goToNextSlot } = useAppStore.getState()
    expect(useAppStore.getState().currentStep).toBe(0)
    goToNextSlot()
    expect(useAppStore.getState().currentStep).toBe(1)
    goToNextSlot()
    expect(useAppStore.getState().currentStep).toBe(2)
    expect(useAppStore.getState().isReviewMode).toBe(false)
    goToNextSlot() // past the last slot
    expect(useAppStore.getState().isReviewMode).toBe(true)
  })

  it('goToPrevSlot leaves review first, then decrements', () => {
    useAppStore.getState().setActiveSlots(['head', 'hair'])
    useAppStore.setState({ currentStep: 1, isReviewMode: true })
    useAppStore.getState().goToPrevSlot()
    expect(useAppStore.getState().isReviewMode).toBe(false)
    expect(useAppStore.getState().currentStep).toBe(1)
    useAppStore.getState().goToPrevSlot()
    expect(useAppStore.getState().currentStep).toBe(0)
  })
})
