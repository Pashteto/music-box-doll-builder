'use client'

import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { DollProject } from '@/lib/types'

const DB_NAME = 'doll-builder'
const DB_VERSION = 1
export const PROJECT_STORE = 'projects'

interface DollDB extends DBSchema {
  projects: {
    key: string
    value: DollProject
    indexes: { updatedAt: number }
  }
}

let dbPromise: Promise<IDBPDatabase<DollDB>> | null = null

/** Returns true when IndexedDB is usable (false in private mode / SSR). */
export function isStorageAvailable(): boolean {
  return typeof indexedDB !== 'undefined'
}

export function getDB(): Promise<IDBPDatabase<DollDB>> {
  if (!isStorageAvailable()) {
    return Promise.reject(new Error('IndexedDB is not available'))
  }
  if (!dbPromise) {
    dbPromise = openDB<DollDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore(PROJECT_STORE, { keyPath: 'id' })
        store.createIndex('updatedAt', 'updatedAt')
      },
    })
  }
  return dbPromise
}
