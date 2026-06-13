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
    await Promise.all(toApply.map((p) => saveProject(p)))
    await Promise.all(toPush.map((p) => projectsApi.upsert(p.id, toProjectInput(p))))
  } catch {
    // best-effort — IndexedDB remains the source of truth
  }
}
