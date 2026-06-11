import { LandingClient } from '@/modules/landing/LandingClient'
import { APP_NAME } from '@/lib/hello'

// Landing (E1-T1): SSR shell renders the hero text immediately for fast FCP; the
// 3D demo + interactive actions are a client island (code-split, ssr:false).
export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <header className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-3xl font-bold text-brand-primary md:text-4xl">{APP_NAME}</h1>
        <p className="max-w-xs text-sm text-foreground/60">
          Build a doll, set it spinning to music, and share your video.
        </p>
      </header>
      <LandingClient />
    </main>
  )
}
