import { describe, it, expect } from 'vitest'
import { toProjectInput, fromServerProject } from '@/modules/sync/mapping'
import { createEmptySlotSelections, type DollProject } from '@/lib/types'
import type { ServerProject } from '@/lib/api'

const local: DollProject = {
  id: 'p1',
  name: 'My Doll',
  createdAt: 0,
  updatedAt: Date.parse('2026-06-13T10:00:00Z'),
  currentStep: 2,
  slotSelections: createEmptySlotSelections(),
  sceneBackground: null,
  sceneForeground: null,
  sceneProps: [],
  musicTrackId: null,
  videoDuration: 10,
  thumbnailDataUrl: 'data:image/jpeg;base64,xxx',
}

describe('project mapping', () => {
  it('toProjectInput converts epoch-ms updatedAt to RFC3339 + carries data/thumbnail', () => {
    const input = toProjectInput(local)
    expect(input.name).toBe('My Doll')
    expect(input.updated_at).toBe('2026-06-13T10:00:00.000Z')
    expect(input.thumbnail).toBe('data:image/jpeg;base64,xxx')
    expect((input.data as unknown as DollProject).currentStep).toBe(2)
  })

  it('fromServerProject normalizes uuid→id and parses updated_at to epoch ms', () => {
    const sp: ServerProject = {
      uuid: 'server-uuid',
      name: 'Server Doll',
      data: { ...local, id: 'server-uuid', name: 'Server Doll' } as unknown as Record<
        string,
        unknown
      >,
      thumbnail: 'data:image/jpeg;base64,yyy',
      updated_at: '2026-06-13T12:00:00Z',
      created_at: '2026-06-13T09:00:00Z',
    }
    const dp = fromServerProject(sp)
    expect(dp.id).toBe('server-uuid')
    expect(dp.name).toBe('Server Doll')
    expect(dp.updatedAt).toBe(Date.parse('2026-06-13T12:00:00Z'))
    expect(dp.thumbnailDataUrl).toBe('data:image/jpeg;base64,yyy')
  })
})
