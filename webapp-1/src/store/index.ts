import { create } from 'zustand'
import type { AppState } from '@/store/types'
import { createCompositionSlice } from '@/store/compositionSlice'
import { createEditorSlice } from '@/store/editorSlice'
import { createEntitlementSlice } from '@/store/entitlementSlice'

/** The single global app store, assembled from feature slices. */
export const useAppStore = create<AppState>()((...a) => ({
  ...createCompositionSlice(...a),
  ...createEditorSlice(...a),
  ...createEntitlementSlice(...a),
}))

export type { AppState }
