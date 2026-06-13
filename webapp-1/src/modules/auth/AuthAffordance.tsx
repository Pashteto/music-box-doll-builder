'use client'

import Link from 'next/link'
import { useSession } from '@/modules/auth/useSession'

/** Small header control: "Log in" link when guest, email + "Log out" when authed. */
export function AuthAffordance() {
  const { user, logout } = useSession()

  if (!user) {
    return (
      <Link href="/login" className="text-sm font-medium text-foreground/70 underline">
        Log in
      </Link>
    )
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-foreground/60">{user.email}</span>
      <button
        type="button"
        onClick={() => void logout()}
        className="font-medium text-foreground/70 underline"
      >
        Log out
      </button>
    </div>
  )
}
