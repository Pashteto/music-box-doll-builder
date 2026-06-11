import type { StateCreator } from 'zustand'
import type { AppState } from '@/store/types'

// Entitlement state. In the lean MVP this is a STUB: the first export is always
// free and no Stripe/backend is wired (see Milestone 4 / E12-T7). The async
// checkEntitlement is kept as the seam where the real entitlements API plugs in.
export interface EntitlementSlice {
  entitled: boolean
  firstExportUsed: boolean
  entitlementLoading: boolean

  setEntitled: (entitled: boolean) => void
  markFirstExportUsed: () => void
  setFirstExportUsed: (used: boolean) => void
  checkEntitlement: (sessionId: string) => Promise<boolean>
}

export const createEntitlementSlice: StateCreator<AppState, [], [], EntitlementSlice> = (
  set,
  get,
) => ({
  entitled: false,
  firstExportUsed: false,
  entitlementLoading: false,

  setEntitled: (entitled) => set({ entitled }),
  markFirstExportUsed: () => set({ firstExportUsed: true }),
  setFirstExportUsed: (used) => set({ firstExportUsed: used }),

  // STUB: no network. Real impl (Milestone 4+) calls GET /api/v1/entitlements/{id}.
  checkEntitlement: async () => {
    return get().entitled
  },
})
