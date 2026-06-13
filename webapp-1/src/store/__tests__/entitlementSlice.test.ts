import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/api', () => ({
  entitlementsApi: { get: vi.fn(), mockCheckout: vi.fn() },
}))

import { useAppStore } from '@/store'
import { entitlementsApi } from '@/lib/api'

beforeEach(() => {
  vi.clearAllMocks()
  useAppStore.setState({ entitled: false })
})

describe('entitlementSlice (server-backed)', () => {
  it('checkEntitlement sets + returns the server value', async () => {
    vi.mocked(entitlementsApi.get).mockResolvedValue({ entitled: true })
    const result = await useAppStore.getState().checkEntitlement()
    expect(result).toBe(true)
    expect(useAppStore.getState().entitled).toBe(true)
  })

  it('checkEntitlement keeps current value on network failure', async () => {
    useAppStore.setState({ entitled: false })
    vi.mocked(entitlementsApi.get).mockRejectedValue(new Error('offline'))
    await expect(useAppStore.getState().checkEntitlement()).resolves.toBe(false)
    expect(useAppStore.getState().entitled).toBe(false)
  })

  it('mockCheckout sets entitled from the response', async () => {
    vi.mocked(entitlementsApi.mockCheckout).mockResolvedValue({ entitled: true })
    const result = await useAppStore.getState().mockCheckout()
    expect(result).toBe(true)
    expect(useAppStore.getState().entitled).toBe(true)
  })
})
