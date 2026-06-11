import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import {
  saveProject,
  listProjects,
  loadProject,
  deleteProject,
  getProjectCount,
  MAX_DRAFTS,
} from '@/modules/storage/projectStorage'
import { createEmptySlotSelections, type DollProject } from '@/lib/types'

function makeProject(id: string, updatedAt: number): DollProject {
  return {
    id,
    name: `Doll ${id}`,
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

async function clearAll() {
  for (const p of await listProjects()) await deleteProject(p.id)
}

beforeEach(clearAll)

describe('projectStorage', () => {
  it('round-trips a project', async () => {
    await saveProject(makeProject('a', 100))
    const loaded = await loadProject('a')
    expect(loaded?.name).toBe('Doll a')
  })

  it('lists projects newest-first', async () => {
    await saveProject(makeProject('old', 100))
    await saveProject(makeProject('new', 200))
    const list = await listProjects()
    expect(list.map((p) => p.id)).toEqual(['new', 'old'])
  })

  it(`evicts oldest beyond MAX_DRAFTS (${MAX_DRAFTS})`, async () => {
    for (let i = 0; i < MAX_DRAFTS + 2; i++) {
      await saveProject(makeProject(`p${i}`, 1000 + i))
    }
    expect(await getProjectCount()).toBe(MAX_DRAFTS)
    // The two oldest (p0, p1) should be gone.
    expect(await loadProject('p0')).toBeUndefined()
    expect(await loadProject('p1')).toBeUndefined()
    expect(await loadProject('p6')).toBeDefined()
  })

  it('updating an existing project does not grow the count', async () => {
    await saveProject(makeProject('x', 1))
    await saveProject(makeProject('x', 2))
    expect(await getProjectCount()).toBe(1)
  })
})
