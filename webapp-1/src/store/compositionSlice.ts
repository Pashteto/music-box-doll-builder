import type { StateCreator } from 'zustand'
import type { AppState } from '@/store/types'
import {
  createEmptySlotSelections,
  IDENTITY_TRANSFORM,
  type DollProject,
  type PropPlacement,
  type SlotSelection,
  type SlotType,
  type Transform,
} from '@/lib/types'
import { applyConstraints, type ConstraintMetadata } from '@/lib/constraints'

export const DEFAULT_VIDEO_DURATION = 10

type ComposableProject = Pick<
  DollProject,
  | 'slotSelections'
  | 'sceneBackground'
  | 'sceneForeground'
  | 'sceneProps'
  | 'musicTrackId'
  | 'videoDuration'
>

export interface CompositionSlice {
  slotSelections: SlotSelection[]
  sceneBackground: string | null
  sceneForeground: string | null
  sceneProps: PropPlacement[]
  musicTrackId: string | null
  videoDuration: number

  selectAsset: (slotType: SlotType, assetId: string, defaultTransform?: Transform) => void
  clearSlot: (slotType: SlotType) => void
  updateTransform: (
    slotType: SlotType,
    transform: Transform,
    metadata?: ConstraintMetadata | null,
  ) => void
  setBackground: (assetId: string | null) => void
  setForeground: (assetId: string | null) => void
  addProp: (assetId: string, transform?: Transform) => string
  removeProp: (placementId: string) => void
  updatePropTransform: (
    placementId: string,
    transform: Transform,
    metadata?: ConstraintMetadata | null,
  ) => void
  setMusicTrack: (trackId: string | null) => void
  setVideoDuration: (seconds: number) => void
  resetComposition: () => void
  hydrateComposition: (project: ComposableProject) => void
}

function freshId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Math.floor(performance.now() * 1000)}`
}

export const createCompositionSlice: StateCreator<AppState, [], [], CompositionSlice> = (set) => ({
  slotSelections: createEmptySlotSelections(),
  sceneBackground: null,
  sceneForeground: null,
  sceneProps: [],
  musicTrackId: null,
  videoDuration: DEFAULT_VIDEO_DURATION,

  selectAsset: (slotType, assetId, defaultTransform) =>
    set((state) => ({
      slotSelections: state.slotSelections.map((s) =>
        s.slotType === slotType
          ? { slotType, assetId, transform: defaultTransform ?? { ...IDENTITY_TRANSFORM } }
          : s,
      ),
    })),

  clearSlot: (slotType) =>
    set((state) => ({
      slotSelections: state.slotSelections.map((s) =>
        s.slotType === slotType
          ? { slotType, assetId: null, transform: { ...IDENTITY_TRANSFORM } }
          : s,
      ),
    })),

  updateTransform: (slotType, transform, metadata) =>
    set((state) => ({
      slotSelections: state.slotSelections.map((s) =>
        s.slotType === slotType
          ? { ...s, transform: applyConstraints(transform, metadata ?? null) }
          : s,
      ),
    })),

  setBackground: (assetId) => set({ sceneBackground: assetId }),
  setForeground: (assetId) => set({ sceneForeground: assetId }),

  addProp: (assetId, transform) => {
    const id = freshId()
    set((state) => ({
      sceneProps: [
        ...state.sceneProps,
        { id, assetId, transform: transform ?? { ...IDENTITY_TRANSFORM } },
      ],
    }))
    return id
  },

  removeProp: (placementId) =>
    set((state) => ({ sceneProps: state.sceneProps.filter((p) => p.id !== placementId) })),

  updatePropTransform: (placementId, transform, metadata) =>
    set((state) => ({
      sceneProps: state.sceneProps.map((p) =>
        p.id === placementId
          ? { ...p, transform: applyConstraints(transform, metadata ?? null) }
          : p,
      ),
    })),

  setMusicTrack: (trackId) => set({ musicTrackId: trackId }),
  setVideoDuration: (seconds) => set({ videoDuration: seconds }),

  resetComposition: () =>
    set({
      slotSelections: createEmptySlotSelections(),
      sceneBackground: null,
      sceneForeground: null,
      sceneProps: [],
      musicTrackId: null,
      videoDuration: DEFAULT_VIDEO_DURATION,
    }),

  hydrateComposition: (project) =>
    set({
      slotSelections: project.slotSelections,
      sceneBackground: project.sceneBackground,
      sceneForeground: project.sceneForeground,
      sceneProps: project.sceneProps,
      musicTrackId: project.musicTrackId,
      videoDuration: project.videoDuration,
    }),
})
