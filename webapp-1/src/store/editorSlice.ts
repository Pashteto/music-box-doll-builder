import type { StateCreator } from 'zustand'
import type { AppState } from '@/store/types'
import { SLOT_TYPES, type EditorMode, type SlotType } from '@/lib/types'

export interface ProjectMeta {
  id: string
  name: string
  createdAt: number
}

export interface EditorSlice {
  /** Index into `activeSlots` the user is currently editing. */
  currentStep: number
  editorMode: EditorMode
  /** True once the user has passed the final slot (completion/review screen). */
  isReviewMode: boolean
  /** The ordered slot sequence the editor walks (set by the editor; defaults to all). */
  activeSlots: SlotType[]

  /** Persistence identity of the project currently open in the editor. */
  projectId: string | null
  projectName: string
  projectCreatedAt: number

  setActiveSlots: (slots: SlotType[]) => void
  setCurrentStep: (step: number) => void
  goToNextSlot: () => void
  goToPrevSlot: () => void
  goToSlot: (step: number) => void
  setEditorMode: (mode: EditorMode) => void
  setReviewMode: (review: boolean) => void
  setProjectMeta: (meta: ProjectMeta) => void
}

export const createEditorSlice: StateCreator<AppState, [], [], EditorSlice> = (set) => ({
  currentStep: 0,
  editorMode: 'slot-editor',
  isReviewMode: false,
  activeSlots: [...SLOT_TYPES],
  projectId: null,
  projectName: 'My Doll',
  projectCreatedAt: 0,

  setActiveSlots: (slots) => set({ activeSlots: slots }),
  setProjectMeta: (meta) =>
    set({ projectId: meta.id, projectName: meta.name, projectCreatedAt: meta.createdAt }),
  setCurrentStep: (step) => set({ currentStep: step }),

  goToNextSlot: () =>
    set((state) => {
      const last = state.activeSlots.length - 1
      if (state.currentStep >= last) {
        // Past the final slot → show the completion/review screen.
        return { isReviewMode: true }
      }
      return { currentStep: state.currentStep + 1, isReviewMode: false }
    }),

  goToPrevSlot: () =>
    set((state) => {
      if (state.isReviewMode) return { isReviewMode: false }
      return { currentStep: Math.max(0, state.currentStep - 1) }
    }),

  goToSlot: (step) =>
    set((state) => ({
      currentStep: Math.min(Math.max(0, step), Math.max(0, state.activeSlots.length - 1)),
      isReviewMode: false,
    })),

  setEditorMode: (mode) => set({ editorMode: mode }),
  setReviewMode: (review) => set({ isReviewMode: review }),
})
