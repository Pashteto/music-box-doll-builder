'use client'

import { useAppStore } from '@/store'
import { DEFAULT_VIDEO_DURATION } from '@/store/compositionSlice'
import { createEmptySlotSelections, type DollProject } from '@/lib/types'
import { PHASE1_SLOTS } from '@/modules/editor/slots'
import { loadProject, saveProject } from '@/modules/storage/projectStorage'

function freshId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `proj-${Date.now()}`
}

/** Reset the store to a brand-new project and persist a skeleton record (E4-T3). */
export async function createNewProject(name = 'My Doll'): Promise<string> {
  const s = useAppStore.getState()
  s.resetComposition()
  const meta = { id: freshId(), name, createdAt: Date.now() }
  s.setProjectMeta(meta)
  useAppStore.setState({
    currentStep: 0,
    editorMode: 'slot-editor',
    isReviewMode: false,
    activeSlots: [...PHASE1_SLOTS],
  })

  const skeleton: DollProject = {
    id: meta.id,
    name: meta.name,
    createdAt: meta.createdAt,
    updatedAt: Date.now(),
    currentStep: 0,
    slotSelections: createEmptySlotSelections(),
    sceneBackground: null,
    sceneForeground: null,
    sceneProps: [],
    musicTrackId: null,
    videoDuration: DEFAULT_VIDEO_DURATION,
    thumbnailDataUrl: null,
  }
  await saveProject(skeleton).catch(() => {})
  return meta.id
}

/** Hydrate the store from a saved draft and resume at its saved step (E4-T3). */
export async function loadAndResume(id: string): Promise<boolean> {
  const project = await loadProject(id).catch(() => undefined)
  if (!project) return false

  const s = useAppStore.getState()
  s.hydrateComposition(project)
  s.setProjectMeta({ id: project.id, name: project.name, createdAt: project.createdAt })
  useAppStore.setState({
    currentStep: Math.min(Math.max(0, project.currentStep), PHASE1_SLOTS.length - 1),
    editorMode: 'slot-editor',
    isReviewMode: false,
    activeSlots: [...PHASE1_SLOTS],
  })
  return true
}
