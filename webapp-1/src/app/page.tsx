import { LandingClient } from '@/modules/landing/LandingClient'

// Landing (E1-T1): the hero copy, 3D demo, and interactive actions all live in the
// LandingClient island (the 3D scene is code-split, ssr:false).
export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <LandingClient />
    </main>
  )
}
