import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/api', () => ({
  projectsApi: { list: vi.fn(), upsert: vi.fn(), remove: vi.fn() },
}))

import { syncOnLogin } from '@/modules/sync/useSync'
import { projectsApi, type ServerProject } from '@/lib/api'
import { saveProject, listProjects, deleteProject } from '@/modules/storage/projectStorage'
import { createEmptySlotSelections, type DollProject } from '@/lib/types'

function local(id: string, updatedAt: number): DollProject {
  return {
    id,
    name: id,
    createdAt: updatedAt,
    updatedAt,
    currentStep: 0,
    slotSelections: createEmptySlotSelections(),
    sceneBackground: null,
    sceneForeground: null,
    sceneProps: [],
    musicTrackId: null,
    videoDuration: 10,
    thumbnailDataUrl: null,
  }
}

function server(id: string, iso: string): ServerProject {
  return {
    uuid: id,
    name: id,
    data: { ...local(id, Date.parse(iso)) } as unknown as Record<string, unknown>,
    updated_at: iso,
    created_at: iso,
  }
}

beforeEach(async () => {
  vi.clearAllMocks()
  for (const p of await listProjects()) await deleteProject(p.id)
})

describe('syncOnLogin', () => {
  it('pushes local-only drafts and applies server-only projects', async () => {
    await saveProject(local('local-only', 100))
    vi.mocked(projectsApi.list).mockResolvedValue([server('server-only', '2026-06-13T10:00:00Z')])
    vi.mocked(projectsApi.upsert).mockResolvedValue(server('local-only', '2026-06-13T09:00:00Z'))

    await syncOnLogin()

    const ids = (await listProjects()).map((p) => p.id).sort()
    expect(ids).toContain('server-only')
    expect(vi.mocked(projectsApi.upsert)).toHaveBeenCalledWith(
      'local-only',
      expect.objectContaining({ name: 'local-only' }),
    )
  })

  it('swallows API failures (best-effort)', async () => {
    await saveProject(local('x', 100))
    vi.mocked(projectsApi.list).mockRejectedValue(new Error('network'))
    await expect(syncOnLogin()).resolves.toBeUndefined()
  })
})
