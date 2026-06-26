'use client'

import Link from 'next/link'
import { useSession } from '@/modules/auth/useSession'

/** Small header control: "Log in" link when guest, email + "Log out" when authed. */
export function AuthAffordance() {
  const { user, logout } = useSession()

  if (!user) {
    return (
      <Link
        href="/login"
        className="text-sm font-medium text-link underline decoration-brand-primary/30 underline-offset-4 transition-colors hover:decoration-brand-primary"
      >
        Log in
      </Link>
    )
  }

  return (
    <div className="flex items-center gap-2.5 text-sm">
      <span className="text-text-muted">{user.email}</span>
      <span className="h-3 w-px bg-border" aria-hidden="true" />
      <button
        type="button"
        onClick={() => void logout()}
        className="font-medium text-text-secondary transition-colors hover:text-foreground"
      >
        Log out
      </button>
    </div>
  )
}
