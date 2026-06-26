'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { AuthForm } from '@/modules/auth/AuthForm'
import { useSession } from '@/modules/auth/useSession'
import { ApiError } from '@/lib/api'

function SignupInner() {
  const router = useRouter()
  const params = useSearchParams()
  const { signup } = useSession()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const next = params.get('next') || '/editor'

  const onSubmit = async (email: string, password: string) => {
    setPending(true)
    setError(null)
    try {
      await signup(email, password)
      router.push(next)
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 409
          ? 'That email is already registered.'
          : 'Something went wrong. Please try again.',
      )
    } finally {
      setPending(false)
    }
  }

  const loginHref = next === '/editor' ? '/login' : `/login?next=${encodeURIComponent(next)}`

  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-6 p-6">
      <AuthForm mode="signup" onSubmit={onSubmit} error={error} pending={pending} />
      <p className="text-sm text-text-muted">
        Already have an account?{' '}
        <Link
          href={loginHref}
          className="text-link underline decoration-brand-primary/30 underline-offset-4 transition-colors hover:decoration-brand-primary"
        >
          Log in
        </Link>
      </p>
    </main>
  )
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-full items-center justify-center">
          <span className="text-foreground/50">Loading…</span>
        </main>
      }
    >
      <SignupInner />
    </Suspense>
  )
}
