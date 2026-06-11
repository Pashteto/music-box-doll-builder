'use client'

import { useEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import { saveProject } from '@/modules/storage/projectStorage'
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
    thumbnailDataUrl: null,
  }
}

/**
 * Debounced autosave (E4-T2): persists the project 1s after any store change and
 * immediately on tab close. Silent on failure (IndexedDB may be unavailable).
 */
export function useAutosave(enabled = true): void {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    if (!enabled) return

    const flush = () => {
      const project = snapshot()
      if (project) void saveProject(project).catch(() => {})
    }
    const schedule = () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(flush, 1000)
    }

    const unsubscribe = useAppStore.subscribe(schedule)
    window.addEventListener('beforeunload', flush)

    return () => {
      unsubscribe()
      window.removeEventListener('beforeunload', flush)
      if (timer.current) clearTimeout(timer.current)
    }
  }, [enabled])
}
