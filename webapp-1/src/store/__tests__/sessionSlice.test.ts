import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/api', () => ({
  authApi: {
    signup: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    me: vi.fn(),
  },
}))

import { useAppStore } from '@/store'
import { authApi } from '@/lib/api'

const USER = { uuid: 'u1', email: 'a@b.com', name: 'A', status: 'active' as const }

beforeEach(() => {
  vi.clearAllMocks()
  useAppStore.setState({ user: null, sessionLoading: false })
})

describe('sessionSlice', () => {
  it('login stores the returned user', async () => {
    vi.mocked(authApi.login).mockResolvedValue({ user: USER })
    await useAppStore.getState().login('a@b.com', 'pw')
    expect(useAppStore.getState().user).toEqual(USER)
  })

  it('signup stores the returned user', async () => {
    vi.mocked(authApi.signup).mockResolvedValue({ user: USER })
    await useAppStore.getState().signup('a@b.com', 'password8')
    expect(useAppStore.getState().user).toEqual(USER)
  })

  it('logout clears the user', async () => {
    useAppStore.setState({ user: USER })
    vi.mocked(authApi.logout).mockResolvedValue(null)
    await useAppStore.getState().logout()
    expect(useAppStore.getState().user).toBeNull()
  })

  it('fetchMe populates user on success', async () => {
    vi.mocked(authApi.me).mockResolvedValue(USER)
    await useAppStore.getState().fetchMe()
    expect(useAppStore.getState().user).toEqual(USER)
    expect(useAppStore.getState().sessionLoading).toBe(false)
  })

  it('fetchMe clears user on 401 (rejects)', async () => {
    useAppStore.setState({ user: USER })
    vi.mocked(authApi.me).mockRejectedValue(new Error('401'))
    await useAppStore.getState().fetchMe()
    expect(useAppStore.getState().user).toBeNull()
  })
})
