'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { AuthForm } from '@/modules/auth/AuthForm'
import { useSession } from '@/modules/auth/useSession'
import { ApiError } from '@/lib/api'

function LoginInner() {
  const router = useRouter()
  const params = useSearchParams()
  const { login } = useSession()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const next = params.get('next') || '/editor'

  const onSubmit = async (email: string, password: string) => {
    setPending(true)
    setError(null)
    try {
      await login(email, password)
      router.push(next)
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 401
          ? 'Invalid email or password.'
          : 'Something went wrong. Please try again.',
      )
    } finally {
      setPending(false)
    }
  }

  const signupHref = next === '/editor' ? '/signup' : `/signup?next=${encodeURIComponent(next)}`

  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-6 p-6">
      <AuthForm mode="login" onSubmit={onSubmit} error={error} pending={pending} />
      <Link href={signupHref} className="text-sm text-foreground/70 underline">
        Create an account
      </Link>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-full items-center justify-center">
          <span className="text-foreground/50">Loading…</span>
        </main>
      }
    >
      <LoginInner />
    </Suspense>
  )
}
