'use client'

import { useState, type FormEvent } from 'react'

interface AuthFormProps {
  mode: 'login' | 'signup'
  onSubmit: (email: string, password: string) => void
  error?: string | null
  pending?: boolean
}

// Shared field treatment — a glazed dark well with a crimson focus glaze, matching
// the vitrine surfaces on the landing/editor.
const FIELD =
  'rounded-xl border border-border bg-surface px-4 py-3 text-base text-foreground shadow-[inset_0_1px_0_rgba(246,241,233,0.06)] transition-colors placeholder:text-text-faint focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/40'
const LABEL =
  'flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-text-muted'

export function AuthForm({ mode, onSubmit, error, pending }: AuthFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const isLogin = mode === 'login'
  // Heading + submit label are pinned strings (covered by tests); the personality
  // lives in the eyebrow and subtitle around them.
  const title = isLogin ? 'Log in' : 'Create account'
  const eyebrow = isLogin ? 'the collector returns' : 'open the cabinet'
  const subtitle = isLogin
    ? 'Sign in to find the dolls you’ve already made.'
    : 'Keep your films and unlock more than the first.'

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    onSubmit(email, password)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full max-w-sm flex-col gap-5 rounded-2xl border border-border bg-background-subtle p-7 shadow-[inset_0_1px_0_rgba(246,241,233,0.12),0_24px_60px_-16px_rgba(0,0,0,0.72)]"
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="inline-flex items-center gap-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-brand-secondary">
          <span className="h-px w-5 bg-border" aria-hidden="true" />
          {eyebrow}
          <span className="h-px w-5 bg-border" aria-hidden="true" />
        </span>
        <h1 className="font-display text-3xl font-normal leading-[1.05] tracking-tight text-text-heading">
          {title}
        </h1>
        <p className="max-w-[30ch] text-sm leading-relaxed text-text-secondary">{subtitle}</p>
      </div>

      <label className={LABEL}>
        Email
        <input
          aria-label="Email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={`${FIELD} font-normal normal-case tracking-normal`}
        />
      </label>
      <label className={LABEL}>
        Password
        <input
          aria-label="Password"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={`${FIELD} font-normal normal-case tracking-normal`}
        />
      </label>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2.5 rounded-full bg-brand-primary px-6 py-3.5 text-[0.9375rem] font-semibold text-foreground shadow-[0_0_0_1px_rgba(192,58,74,0.30),0_8px_28px_-6px_rgba(161,29,44,0.45),inset_0_1px_0_rgba(246,241,233,0.1)] transition-colors hover:bg-brand-primary-hover active:translate-y-px active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-surface-overlay disabled:text-text-faint disabled:shadow-none"
      >
        {pending ? 'One moment…' : title}
      </button>
    </form>
  )
}
