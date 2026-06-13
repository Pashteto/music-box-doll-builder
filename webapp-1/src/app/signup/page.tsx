'use client'

import { Suspense, useState } from 'react'
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
      <a href={loginHref} className="text-sm text-foreground/70 underline">
        Already have an account? Log in
      </a>
    </main>
  )
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupInner />
    </Suspense>
  )
}
