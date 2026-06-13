'use client'

import { useAppStore } from '@/store'

/** Component-facing session accessor: current user + auth actions. */
export function useSession() {
  const user = useAppStore((s) => s.user)
  const sessionLoading = useAppStore((s) => s.sessionLoading)
  const login = useAppStore((s) => s.login)
  const signup = useAppStore((s) => s.signup)
  const logout = useAppStore((s) => s.logout)
  return { user, sessionLoading, login, signup, logout }
}
