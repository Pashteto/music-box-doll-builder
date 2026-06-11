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
  loading: () => <div className="h-full w-full animate-pulse rounded-3xl bg-white/5" />,
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
        initial: { opacity: 1, y: 16 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.5 },
      }

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-6">
      <div className="aspect-square w-full max-w-[320px] overflow-hidden rounded-3xl bg-[#1a1424]">
        <LandingScene />
      </div>

      <motion.div className="flex w-full flex-col gap-3" {...entrance}>
        <button
          type="button"
          onClick={startNew}
          disabled={busy}
          className="w-full rounded-2xl bg-brand-primary px-6 py-4 text-lg font-semibold text-white active:scale-95 disabled:opacity-50"
        >
          Create New
        </button>

        {drafts.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-foreground/60">Continue a draft</h2>
            {drafts.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => resume(d.id)}
                disabled={busy}
                className="flex items-center gap-3 rounded-xl border border-black/10 p-3 text-left active:scale-[0.99] disabled:opacity-50"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-brand-secondary/15 text-xl">
                  🎎
                </div>
                <div className="flex flex-col">
                  <span className="font-medium">{d.name}</span>
                  <span className="text-xs text-foreground/50">
                    Updated {formatDate(d.updatedAt)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </motion.div>
    </div>
  )
}
