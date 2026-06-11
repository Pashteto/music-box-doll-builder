'use client'

// Placeholder paywall (E12-T8 shell). The real Stripe Checkout + Restore flow is
// deferred (backend stubbed) — this proves the gate fires after the first free export.
interface PaywallScreenProps {
  onClose: () => void
}

export function PaywallScreen({ onClose }: PaywallScreenProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-xl">
        <div className="mb-3 text-4xl">🔓</div>
        <h2 className="text-xl font-bold">Unlock more exports</h2>
        <p className="mt-2 text-sm text-foreground/60">
          Your first export was free. Unlimited exports will be a one-time purchase.
        </p>
        <button
          type="button"
          disabled
          className="mt-5 w-full rounded-xl bg-brand-primary px-4 py-3 font-semibold text-white opacity-50"
        >
          Unlock Export — coming soon
        </button>
        <button type="button" disabled className="mt-2 w-full py-2 text-sm text-foreground/40">
          Restore Purchase — coming soon
        </button>
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
