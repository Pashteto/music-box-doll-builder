import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

import { PaywallScreen } from '@/modules/paywall/PaywallScreen'
import { useAppStore } from '@/store'

beforeEach(() => {
  vi.clearAllMocks()
  useAppStore.setState({
    user: null,
    entitled: false,
    mockCheckout: vi.fn().mockResolvedValue(true),
  })
})

describe('PaywallScreen', () => {
  it('redirects to /login when unlocking while logged out', () => {
    render(<PaywallScreen onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /unlock/i }))
    expect(push).toHaveBeenCalledWith('/login?next=/editor')
  })

  it('calls mockCheckout when unlocking while logged in', async () => {
    const mockCheckout = vi.fn().mockResolvedValue(true)
    useAppStore.setState({
      user: { uuid: 'u', email: 'e', name: 'n', status: 'active' },
      mockCheckout,
    })
    const onClose = vi.fn()
    render(<PaywallScreen onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /unlock/i }))
    await waitFor(() => expect(mockCheckout).toHaveBeenCalled())
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })
})
