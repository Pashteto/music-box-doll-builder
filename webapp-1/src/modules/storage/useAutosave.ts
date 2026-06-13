'use client'

import { useEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import { saveProject } from '@/modules/storage/projectStorage'
import { captureThumbnail } from '@/modules/storage/thumbnail'
import { projectsApi } from '@/lib/api'
import { toProjectInput } from '@/modules/sync/mapping'
import type { DollProject } from '@/lib/types'

/** Build a serializable project snapshot from the live store (null if no project open). */
function snapshot(): DollProject | null {
  const s = useAppStore.getState()
  if (!s.projectId) return null
  return {
    id: s.projectId,
    name: s.projectName,
    createdAt: s.projectCreatedAt || Date.now(),
    updatedAt: Date.now(),
    currentStep: s.currentStep,
    slotSelections: s.slotSelections,
    sceneBackground: s.sceneBackground,
    sceneForeground: s.sceneForeground,
    sceneProps: s.sceneProps,
    musicTrackId: s.musicTrackId,
    videoDuration: s.videoDuration,
    thumbnailDataUrl: captureThumbnail(),
  }
}

/**
 * Persist the current project: always to IndexedDB, and — when logged in —
 * additionally push to the server (best-effort). Exported for testing.
 */
export function flushProject(): void {
  const project = snapshot()
  if (!project) return
  void saveProject(project).catch(() => {})
  if (useAppStore.getState().user) {
    void projectsApi.upsert(project.id, toProjectInput(project)).catch(() => {})
  }
}

/**
 * Debounced autosave (E4-T2): persists 1s after any store change and immediately
 * on tab close. Silent on failure (IndexedDB / network may be unavailable).
 */
export function useAutosave(enabled = true): void {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    if (!enabled) return

    const schedule = () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(flushProject, 1000)
    }

    const unsubscribe = useAppStore.subscribe(schedule)
    window.addEventListener('beforeunload', flushProject)

    return () => {
      unsubscribe()
      window.removeEventListener('beforeunload', flushProject)
      if (timer.current) clearTimeout(timer.current)
    }
  }, [enabled])
}
