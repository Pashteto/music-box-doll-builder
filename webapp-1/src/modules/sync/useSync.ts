'use client'

import { projectsApi } from '@/lib/api'
import { saveProject, listProjects } from '@/modules/storage/projectStorage'
import { mergeProjects } from '@/modules/sync/merge'
import { fromServerProject, toProjectInput } from '@/modules/sync/mapping'

/**
 * Pull the user's server projects, last-write-wins merge with local IndexedDB
 * drafts, write the winners locally, and push local-only/locally-newer drafts.
 * Best-effort: any failure is swallowed so a backend hiccup never blocks the app.
 */
export async function syncOnLogin(): Promise<void> {
  try {
    const [local, serverRaw] = await Promise.all([listProjects(), projectsApi.list()])
    const server = serverRaw.map(fromServerProject)
    const { toApply, toPush } = mergeProjects(local, server)
    // Per-project best-effort: one failure (IndexedDB quota, a 5xx) must not drop
    // the rest of the batch, so allSettled rather than all.
    await Promise.allSettled(toApply.map((p) => saveProject(p)))
    await Promise.allSettled(toPush.map((p) => projectsApi.upsert(p.id, toProjectInput(p))))
  } catch {
    // best-effort — IndexedDB remains the source of truth
  }
}
