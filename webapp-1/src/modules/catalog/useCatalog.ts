'use client'

import { useEffect, useState } from 'react'
import {
  isValidManifest,
  type AssetManifestEntry,
  type CatalogManifest,
  type CatalogSlot,
  type MusicTrackEntry,
} from '@/lib/catalog-types'

// Module-level singleton cache so the manifest is fetched once across all components.
let cachedManifest: CatalogManifest | null = null
let fetchPromise: Promise<CatalogManifest> | null = null

function manifestUrl(): string {
  return process.env.NEXT_PUBLIC_CATALOG_URL ?? '/catalog/manifest.json'
}

async function fetchManifest(): Promise<CatalogManifest> {
  if (cachedManifest) return cachedManifest
  if (!fetchPromise) {
    fetchPromise = (async () => {
      const res = await fetch(manifestUrl())
      if (!res.ok) throw new Error(`Failed to load catalog manifest (${res.status})`)
      const data: unknown = await res.json()
      if (!isValidManifest(data)) throw new Error('Catalog manifest failed validation')
      cachedManifest = data
      return data
    })()
    // Allow retry on failure.
    fetchPromise.catch(() => {
      fetchPromise = null
    })
  }
  return fetchPromise
}

export interface UseCatalogResult {
  manifest: CatalogManifest | null
  isLoading: boolean
  error: Error | null
}

/** Loads and caches the catalog manifest on mount. */
export function useCatalog(): UseCatalogResult {
  const [manifest, setManifest] = useState<CatalogManifest | null>(cachedManifest)
  const [isLoading, setIsLoading] = useState(!cachedManifest)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (cachedManifest) return
    let active = true
    setIsLoading(true)
    fetchManifest()
      .then((m) => {
        if (active) {
          setManifest(m)
          setError(null)
        }
      })
      .catch((e: unknown) => {
        if (active) setError(e instanceof Error ? e : new Error(String(e)))
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  return { manifest, isLoading, error }
}

// ── Pure selector helpers (default to the module cache; pass a manifest in tests) ──
export function getAssetsForSlot(
  slotType: CatalogSlot,
  manifest: CatalogManifest | null = cachedManifest,
): AssetManifestEntry[] {
  if (!manifest) return []
  const all = [
    ...manifest.assets,
    ...manifest.backgrounds,
    ...manifest.foregrounds,
    ...manifest.props,
  ]
  return all.filter((a) => a.slotType === slotType)
}

export function getAssetById(
  assetId: string,
  manifest: CatalogManifest | null = cachedManifest,
): AssetManifestEntry | undefined {
  if (!manifest) return undefined
  const all = [
    ...manifest.assets,
    ...manifest.backgrounds,
    ...manifest.foregrounds,
    ...manifest.props,
  ]
  return all.find((a) => a.assetId === assetId)
}

export function getBackgrounds(
  manifest: CatalogManifest | null = cachedManifest,
): AssetManifestEntry[] {
  return manifest?.backgrounds ?? []
}

export function getForegrounds(
  manifest: CatalogManifest | null = cachedManifest,
): AssetManifestEntry[] {
  return manifest?.foregrounds ?? []
}

export function getProps(manifest: CatalogManifest | null = cachedManifest): AssetManifestEntry[] {
  return manifest?.props ?? []
}

export function getMusicTracks(
  manifest: CatalogManifest | null = cachedManifest,
): MusicTrackEntry[] {
  return manifest?.musicTracks ?? []
}

/** Test-only: reset the module cache between unit tests. */
export function __resetCatalogCache(): void {
  cachedManifest = null
  fetchPromise = null
}
