import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AuthForm } from '@/modules/auth/AuthForm'

describe('AuthForm', () => {
  it('renders the mode title', () => {
    render(<AuthForm mode="login" onSubmit={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Log in' })).toBeInTheDocument()
  })

  it('submits the typed email + password', () => {
    const onSubmit = vi.fn()
    render(<AuthForm mode="signup" onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password8' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(onSubmit).toHaveBeenCalledWith('a@b.com', 'password8')
  })

  it('shows an error message when provided', () => {
    render(<AuthForm mode="login" onSubmit={() => {}} error="Invalid email or password." />)
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password.')
  })

  it('disables the submit button while pending', () => {
    render(<AuthForm mode="login" onSubmit={() => {}} pending />)
    expect(screen.getByRole('button')).toBeDisabled()
  })
})
