import type { StateCreator } from 'zustand'
import type { AppState } from '@/store/types'
import { entitlementsApi } from '@/lib/api'

// Entitlement state. `entitled` now comes from the backend (Plan 3 contract).
// First-export-free remains a client-side localStorage gate (see useEntitlement).
export interface EntitlementSlice {
  entitled: boolean
  firstExportUsed: boolean
  entitlementLoading: boolean

  setEntitled: (entitled: boolean) => void
  markFirstExportUsed: () => void
  setFirstExportUsed: (used: boolean) => void
  /** Fetch entitlement for the current session; returns the (new) entitled value. */
  checkEntitlement: () => Promise<boolean>
  /** Mocked checkout — grants entitlement server-side (no Stripe). */
  mockCheckout: () => Promise<boolean>
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

  checkEntitlement: async () => {
    set({ entitlementLoading: true })
    try {
      const { entitled } = await entitlementsApi.get()
      set({ entitled })
      return entitled
    } catch {
      // Network/Plan-3-not-deployed: keep current value (client first-free gate still applies).
      return get().entitled
    } finally {
      set({ entitlementLoading: false })
    }
  },

  mockCheckout: async () => {
    const { entitled } = await entitlementsApi.mockCheckout()
    set({ entitled })
    return entitled
  },
})
