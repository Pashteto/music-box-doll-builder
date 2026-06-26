import Link from 'next/link'

// Explicit App-Router 404 so `output: export` emits a clean out/404.html
// (avoids the pages-router _document fallback during export).
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 p-8 text-center">
      <span className="inline-flex items-center gap-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-brand-secondary">
        <span className="h-px w-5 bg-border" aria-hidden="true" />
        empty vitrine
        <span className="h-px w-5 bg-border" aria-hidden="true" />
      </span>
      <h1 className="font-display text-3xl font-normal leading-[1.05] tracking-tight text-text-heading">
        Nothing on this shelf
      </h1>
      <p className="max-w-[34ch] text-[0.9375rem] leading-relaxed text-text-secondary">
        The page you were looking for isn’t here. Let’s get you back to the workshop.
      </p>
      <Link
        href="/"
        className="inline-flex min-h-11 items-center justify-center gap-2.5 rounded-full bg-brand-primary px-6 py-3.5 text-[0.9375rem] font-semibold text-foreground shadow-[0_0_0_1px_rgba(192,58,74,0.30),0_8px_28px_-6px_rgba(161,29,44,0.45),inset_0_1px_0_rgba(246,241,233,0.1)] transition-colors hover:bg-brand-primary-hover active:translate-y-px active:scale-[0.99]"
      >
        Back to the workshop
      </Link>
    </main>
  )
}
