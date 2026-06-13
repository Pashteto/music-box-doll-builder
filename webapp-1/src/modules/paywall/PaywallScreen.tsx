'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore } from '@/store'

// Mocked paywall (Plan 4): real entitlement endpoint, Stripe still mocked.
// Logged-out users are routed to /login; logged-in users hit mock-checkout.
interface PaywallScreenProps {
  onClose: () => void
}

export function PaywallScreen({ onClose }: PaywallScreenProps) {
  const router = useRouter()
  const user = useAppStore((s) => s.user)
  const mockCheckout = useAppStore((s) => s.mockCheckout)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleUnlock = async () => {
    if (!user) {
      router.push('/login?next=/editor')
      return
    }
    setPending(true)
    setError(null)
    try {
      await mockCheckout()
      onClose()
    } catch {
      // Entitlements backend may be unavailable (Plan 3 not deployed) — never crash.
      setError('Unlocking is unavailable right now. Please try again later.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-sm rounded-2xl border border-foreground/10 bg-surface-overlay p-6 text-center shadow-2xl">
        <div className="mb-3 text-4xl">🔒</div>
        <h2 className="text-2xl">Unlock more exports</h2>
        <p className="mt-2 text-sm text-foreground/60">
          Your first film was free. Unlock unlimited exports of your dolls.
        </p>
        <button
          type="button"
          onClick={handleUnlock}
          disabled={pending}
          className="mt-5 w-full rounded-xl bg-brand-primary px-4 py-3 font-semibold text-white disabled:opacity-50"
        >
          {pending ? 'Unlocking…' : user ? 'Unlock Export' : 'Log in to unlock'}
        </button>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full py-2 text-sm text-foreground/70"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
