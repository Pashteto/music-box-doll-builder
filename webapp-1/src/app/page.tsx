import { APP_NAME } from '@/lib/hello'

// Placeholder landing — replaced by the real animated landing in Milestone 4 (E1).
export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-3xl font-bold text-brand-primary md:text-5xl">{APP_NAME}</h1>
      <p className="max-w-md text-sm text-foreground/70 md:text-lg">
        Scaffold is alive. Tailwind, the <code>@/</code> alias, and strict TypeScript are wired up.
      </p>
      <span className="rounded-lg bg-brand-primary px-4 py-2 text-white">Build me a doll →</span>
    </main>
  )
}
