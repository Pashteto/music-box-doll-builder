import type { StateCreator } from 'zustand'
import type { AppState } from '@/store/types'
import { authApi, type ApiUser } from '@/lib/api'

export interface SessionSlice {
  user: ApiUser | null
  sessionLoading: boolean
  setUser: (user: ApiUser | null) => void
  signup: (email: string, password: string) => Promise<void>
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  fetchMe: () => Promise<void>
}

export const createSessionSlice: StateCreator<AppState, [], [], SessionSlice> = (set) => ({
  user: null,
  sessionLoading: false,
  setUser: (user) => set({ user }),
  signup: async (email, password) => {
    const { user } = await authApi.signup(email, password)
    set({ user })
  },
  login: async (email, password) => {
    const { user } = await authApi.login(email, password)
    set({ user })
  },
  logout: async () => {
    // Best-effort: clear locally even if the server call fails (cookie session may
    // already be gone) so the logout button never appears to do nothing.
    try {
      await authApi.logout()
    } catch {
      /* ignore network/5xx — clear local session regardless */
    }
    set({ user: null })
  },
  fetchMe: async () => {
    set({ sessionLoading: true })
    try {
      const user = await authApi.me()
      set({ user })
    } catch {
      set({ user: null }) // not authenticated (401) or offline
    } finally {
      set({ sessionLoading: false })
    }
  },
})
