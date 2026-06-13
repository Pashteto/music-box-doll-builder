'use client'

import { useState, type FormEvent } from 'react'

interface AuthFormProps {
  mode: 'login' | 'signup'
  onSubmit: (email: string, password: string) => void
  error?: string | null
  pending?: boolean
}

export function AuthForm({ mode, onSubmit, error, pending }: AuthFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const title = mode === 'login' ? 'Log in' : 'Create account'

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    onSubmit(email, password)
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4">
      <h1 className="text-3xl">{title}</h1>
      <label className="flex flex-col gap-1 text-sm text-foreground/70">
        Email
        <input
          aria-label="Email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-xl border border-foreground/15 bg-surface px-4 py-3 text-foreground"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-foreground/70">
        Password
        <input
          aria-label="Password"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-xl border border-foreground/15 bg-surface px-4 py-3 text-foreground"
        />
      </label>
      {error ? (
        <p role="alert" className="text-sm text-brand-primary">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-brand-primary px-4 py-3 font-semibold text-white disabled:opacity-50"
      >
        {pending ? '…' : title}
      </button>
    </form>
  )
}
