import type { DollProject } from '@/lib/types'

export interface MergeResult {
  /** Server-or-newer projects to write into local IndexedDB. */
  toApply: DollProject[]
  /** Local-only or locally-newer projects to push to the server. */
  toPush: DollProject[]
}

/**
 * Last-write-wins per project id by `updatedAt` (epoch ms). Inputs are both in
 * client `DollProject` shape — the caller maps server projects first.
 */
export function mergeProjects(local: DollProject[], server: DollProject[]): MergeResult {
  const byId = new Map<string, { local?: DollProject; server?: DollProject }>()
  for (const p of local) byId.set(p.id, { ...byId.get(p.id), local: p })
  for (const p of server) byId.set(p.id, { ...byId.get(p.id), server: p })

  const toApply: DollProject[] = []
  const toPush: DollProject[] = []
  for (const { local: l, server: s } of byId.values()) {
    if (l && s) {
      if (l.updatedAt > s.updatedAt) toPush.push(l)
      else if (s.updatedAt > l.updatedAt) toApply.push(s)
      // equal → already in sync
    } else if (s) {
      toApply.push(s)
    } else if (l) {
      toPush.push(l)
    }
  }
  return { toApply, toPush }
}
