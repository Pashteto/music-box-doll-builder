import type { DollProject } from '@/lib/types'
import type { ServerProject, ProjectInput } from '@/lib/api'

/**
 * Client DollProject → server upsert payload. Epoch-ms `updatedAt` → RFC3339.
 * The full project rides in `data`, so its embedded `id`/`updatedAt`/`thumbnailDataUrl`
 * are informational only — the server columns (`uuid`/`updated_at`/`thumbnail`) are
 * authoritative on the way back (see fromServerProject).
 */
export function toProjectInput(p: DollProject): ProjectInput {
  return {
    name: p.name,
    data: p as unknown as Record<string, unknown>,
    thumbnail: p.thumbnailDataUrl ?? undefined,
    updated_at: new Date(p.updatedAt).toISOString(),
  }
}

/**
 * Server project → client DollProject. The full project rides in `data`; we
 * normalize id/name/thumbnail/updatedAt from the authoritative server columns.
 */
export function fromServerProject(sp: ServerProject): DollProject {
  const d = sp.data as unknown as DollProject
  return {
    ...d,
    id: sp.uuid,
    name: sp.name,
    thumbnailDataUrl: sp.thumbnail ?? null,
    updatedAt: Date.parse(sp.updated_at),
  }
}
