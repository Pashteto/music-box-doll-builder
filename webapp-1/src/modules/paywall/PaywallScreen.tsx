'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore } from '@/store'

// Paywall (Plan 3): real entitlement endpoint + real Stripe Checkout (test-mode).
// Logged-out users are routed to /login; logged-in users start a real checkout that
// redirects to Stripe. On return, /editor?checkout=success re-checks the entitlement.
interface PaywallScreenProps {
  onClose: () => void
}

export function PaywallScreen({ onClose }: PaywallScreenProps) {
  const router = useRouter()
  const user = useAppStore((s) => s.user)
  const startCheckout = useAppStore((s) => s.startCheckout)
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
      // Redirects to the Stripe-hosted page; the promise typically never resolves
      // because navigation happens first. If it throws, checkout is unavailable.
      await startCheckout()
    } catch {
      setError('Checkout is unavailable right now. Please try again later.')
      setPending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-background-subtle p-7 text-center shadow-[inset_0_1px_0_rgba(246,241,233,0.12),0_24px_60px_-16px_rgba(0,0,0,0.72)]">
        <span className="inline-flex items-center gap-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-brand-secondary">
          <span className="h-px w-5 bg-border" aria-hidden="true" />
          the first film is yours
          <span className="h-px w-5 bg-border" aria-hidden="true" />
        </span>
        <h2 className="mt-3 font-display text-2xl font-normal leading-tight tracking-tight text-text-heading">
          Keep the music box turning
        </h2>
        <p className="mx-auto mt-2 max-w-[32ch] text-sm leading-relaxed text-text-secondary">
          The first film was free. Unlock the rest and export every doll you make.
        </p>
        <button
          type="button"
          onClick={handleUnlock}
          disabled={pending}
          className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2.5 rounded-full bg-brand-primary px-6 py-3.5 text-[0.9375rem] font-semibold text-foreground shadow-[0_0_0_1px_rgba(192,58,74,0.30),0_8px_28px_-6px_rgba(161,29,44,0.45),inset_0_1px_0_rgba(246,241,233,0.1)] transition-colors hover:bg-brand-primary-hover active:translate-y-px active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-surface-overlay disabled:text-text-faint disabled:shadow-none"
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
          className="mt-2 w-full py-2 text-sm text-text-muted transition-colors hover:text-foreground"
        >
          Maybe later
        </button>
      </div>
    </div>
  )
}
