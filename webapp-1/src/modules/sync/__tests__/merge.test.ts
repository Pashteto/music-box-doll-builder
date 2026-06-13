import { describe, it, expect } from 'vitest'
import { mergeProjects } from '@/modules/sync/merge'
import { createEmptySlotSelections, type DollProject } from '@/lib/types'

function proj(id: string, updatedAt: number): DollProject {
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

describe('mergeProjects (last-write-wins)', () => {
  it('pushes a local-only project', () => {
    const { toApply, toPush } = mergeProjects([proj('a', 100)], [])
    expect(toPush.map((p) => p.id)).toEqual(['a'])
    expect(toApply).toEqual([])
  })

  it('applies a server-only project', () => {
    const { toApply, toPush } = mergeProjects([], [proj('b', 100)])
    expect(toApply.map((p) => p.id)).toEqual(['b'])
    expect(toPush).toEqual([])
  })

  it('on conflict, the newer side wins', () => {
    const localNewer = mergeProjects([proj('c', 200)], [proj('c', 100)])
    expect(localNewer.toPush.map((p) => p.id)).toEqual(['c'])
    expect(localNewer.toApply).toEqual([])

    const serverNewer = mergeProjects([proj('d', 100)], [proj('d', 200)])
    expect(serverNewer.toApply.map((p) => p.id)).toEqual(['d'])
    expect(serverNewer.toPush).toEqual([])
  })

  it('equal timestamps are a no-op', () => {
    const { toApply, toPush } = mergeProjects([proj('e', 100)], [proj('e', 100)])
    expect(toApply).toEqual([])
    expect(toPush).toEqual([])
  })
})
