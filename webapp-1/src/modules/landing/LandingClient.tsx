'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { motion, useReducedMotion } from 'motion/react'
import { createNewProject, loadAndResume } from '@/modules/storage/useProjectLoader'
import { listProjects } from '@/modules/storage/projectStorage'
import type { DollProject } from '@/lib/types'

// Code-split the 3D demo so the landing shell stays lightweight (E1-T2, AC-32).
const LandingScene = dynamic(() => import('@/modules/landing/LandingScene'), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-2xl bg-surface-overlay" />,
})

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function LandingClient() {
  const router = useRouter()
  const reduce = useReducedMotion()
  const [drafts, setDrafts] = useState<DollProject[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    listProjects()
      .then(setDrafts)
      .catch(() => setDrafts([]))
  }, [])

  async function startNew() {
    setBusy(true)
    await createNewProject()
    router.push('/editor')
  }

  async function resume(id: string) {
    setBusy(true)
    const ok = await loadAndResume(id)
    if (ok) router.push('/editor')
    else setBusy(false)
  }

  const entrance = reduce
    ? {}
    : {
        initial: { opacity: 0, y: 14 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] as const },
      }

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-7">
      {/* Vitrine / stage — the porcelain specimen under glass. Frames the R3F scene
          as a recessed case lit from above, with a hairline glaze top edge and a
          deep inner shadow at the plinth. */}
      <motion.div
        className="relative aspect-square w-full max-w-[320px] overflow-hidden rounded-2xl border border-border bg-background-subtle shadow-[inset_0_1px_0_rgba(246,241,233,0.12),inset_0_-40px_80px_-40px_rgba(0,0,0,0.9)]"
        {...entrance}
      >
        <div className="absolute inset-0">
          <LandingScene />
        </div>
        {/* Italic serif caption — the exhibition epigraph. */}
        <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center font-display text-lg italic text-text-muted">
          a goodnight kiss from the inner forest
        </p>
      </motion.div>

      {/* Hero copy + actions */}
      <motion.div className="flex w-full flex-col items-center gap-5 text-center" {...entrance}>
        <span className="inline-flex items-center gap-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-brand-secondary">
          <span className="h-px w-5 bg-border" aria-hidden="true" />
          after Olga Grechanova
          <span className="h-px w-5 bg-border" aria-hidden="true" />
        </span>

        <h2 className="font-display text-3xl font-normal leading-[1.05] tracking-tight text-text-heading">
          Assemble a doll
          <br />
          <em className="italic text-foreground">that remembers you</em>
        </h2>

        <p className="max-w-[34ch] text-[0.9375rem] leading-relaxed text-text-secondary">
          Choose her face, her hair, the glaze of her lips. Set her in the music box and let her
          turn — then keep the little film she leaves behind.
        </p>

        <div className="mt-1 flex w-full flex-col gap-3">
          <button
            type="button"
            onClick={startNew}
            disabled={busy}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2.5 rounded-full bg-brand-primary px-6 py-3.5 text-[0.9375rem] font-semibold text-foreground shadow-[0_0_0_1px_rgba(192,58,74,0.30),0_8px_28px_-6px_rgba(161,29,44,0.45),inset_0_1px_0_rgba(246,241,233,0.1)] transition-colors hover:bg-brand-primary-hover active:translate-y-px active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-surface-overlay disabled:text-text-faint disabled:shadow-none"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden="true" />
            Begin the assembly
          </button>

          {drafts.length > 0 ? (
            <div className="flex flex-col gap-2.5 text-left">
              <h3 className="px-1 text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                Continue a draft
              </h3>
              {drafts.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => resume(d.id)}
                  disabled={busy}
                  className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 text-left shadow-[inset_0_1px_0_rgba(246,241,233,0.1)] transition-colors hover:border-border-glaze active:scale-[0.99] disabled:opacity-50"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-overlay text-xl">
                    🎎
                  </div>
                  <div className="flex flex-col">
                    <span className="font-medium text-text-heading">{d.name}</span>
                    <span className="text-xs text-text-faint">
                      Updated {formatDate(d.updatedAt)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </motion.div>

      {/* Tribute footnote */}
      <motion.p className="text-center text-[0.8125rem] text-text-faint" {...entrance}>
        A tribute to the ceramic work of{' '}
        <span className="border-b border-brand-primary/30 text-link">@linden_tar</span>. First film
        is free.
      </motion.p>
    </div>
  )
}
