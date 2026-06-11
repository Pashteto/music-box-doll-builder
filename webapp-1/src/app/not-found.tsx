import Link from 'next/link'

// Explicit App-Router 404 so `output: export` emits a clean out/404.html
// (avoids the pages-router _document fallback during export).
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-bold text-brand-primary">Page not found</h1>
      <Link href="/" className="rounded-lg bg-brand-primary px-4 py-2 text-white">
        Back home
      </Link>
    </main>
  )
}
