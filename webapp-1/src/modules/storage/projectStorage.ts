'use client'

import type { DollProject } from '@/lib/types'
import { getDB, isStorageAvailable, PROJECT_STORE } from '@/modules/storage/db'

export const MAX_DRAFTS = 5

/** Persist (insert or update) a project, evicting the oldest drafts past MAX_DRAFTS. */
export async function saveProject(project: DollProject): Promise<void> {
  if (!isStorageAvailable()) return
  const db = await getDB()
  await db.put(PROJECT_STORE, project)

  // Enforce the draft cap: keep the most-recently-updated MAX_DRAFTS.
  const all = await db.getAllFromIndex(PROJECT_STORE, 'updatedAt')
  if (all.length > MAX_DRAFTS) {
    const toDelete = all.slice(0, all.length - MAX_DRAFTS) // index is ascending by updatedAt
    const tx = db.transaction(PROJECT_STORE, 'readwrite')
    await Promise.all([...toDelete.map((p) => tx.store.delete(p.id)), tx.done])
  }
}

export async function loadProject(id: string): Promise<DollProject | undefined> {
  if (!isStorageAvailable()) return undefined
  const db = await getDB()
  return db.get(PROJECT_STORE, id)
}

/** All drafts, newest first. */
export async function listProjects(): Promise<DollProject[]> {
  if (!isStorageAvailable()) return []
  const db = await getDB()
  const all = await db.getAllFromIndex(PROJECT_STORE, 'updatedAt')
  return all.reverse()
}

export async function deleteProject(id: string): Promise<void> {
  if (!isStorageAvailable()) return
  const db = await getDB()
  await db.delete(PROJECT_STORE, id)
}

export async function getProjectCount(): Promise<number> {
  if (!isStorageAvailable()) return 0
  const db = await getDB()
  return db.count(PROJECT_STORE)
}
