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
    startCheckout: vi.fn().mockResolvedValue(undefined),
  })
})

describe('PaywallScreen', () => {
  it('redirects to /login when unlocking while logged out', () => {
    render(<PaywallScreen onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /unlock|log in to unlock/i }))
    expect(push).toHaveBeenCalledWith('/login?next=/editor')
  })

  it('starts real Stripe checkout when unlocking while logged in', async () => {
    const startCheckout = vi.fn().mockResolvedValue(undefined)
    useAppStore.setState({
      user: { uuid: 'u', email: 'e', name: 'n', status: 'active' },
      startCheckout,
    })
    render(<PaywallScreen onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /unlock/i }))
    await waitFor(() => expect(startCheckout).toHaveBeenCalled())
  })

  it('shows an error when checkout is unavailable', async () => {
    const startCheckout = vi.fn().mockRejectedValue(new Error('503'))
    useAppStore.setState({
      user: { uuid: 'u', email: 'e', name: 'n', status: 'active' },
      startCheckout,
    })
    render(<PaywallScreen onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /unlock/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/unavailable/i))
  })
})
