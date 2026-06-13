import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import { AuthAffordance } from '@/modules/auth/AuthAffordance'
import { useAppStore } from '@/store'

beforeEach(() => {
  useAppStore.setState({ user: null, logout: vi.fn().mockResolvedValue(undefined) })
})

describe('AuthAffordance', () => {
  it('shows a Log in link when logged out', () => {
    render(<AuthAffordance />)
    expect(screen.getByRole('link', { name: /log in/i })).toHaveAttribute('href', '/login')
  })

  it('shows the email + a Log out button when logged in', async () => {
    const logout = vi.fn().mockResolvedValue(undefined)
    useAppStore.setState({
      user: { uuid: 'u', email: 'me@x.com', name: 'n', status: 'active' },
      logout,
    })
    render(<AuthAffordance />)
    expect(screen.getByText('me@x.com')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /log out/i }))
    await waitFor(() => expect(logout).toHaveBeenCalled())
  })
})
