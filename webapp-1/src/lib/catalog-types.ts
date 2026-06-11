// Asset catalog schema (E3-T1). Mirrors the CDN/static manifest that drives the
// editor, scene composer, and music selector.

import type { SlotType, Transform, Vec3 } from '@/lib/types'

/** Scene-level categories that live alongside doll slots in the manifest. */
export type SceneSlot = 'background' | 'foreground' | 'prop'

/** Any category a manifest asset can belong to. */
export type CatalogSlot = SlotType | SceneSlot

export interface AssetManifestEntry {
  assetId: string
  /** Doll slot type, or a scene category (background/foreground/prop). */
  slotType: CatalogSlot
  displayName: string
  /** Thumbnail URL (WebP in production; SVG placeholders in the MVP). */
  previewImage: string
  /** GLB model URL (Draco-compressed in production). */
  glbFile: string
  /** Whether textures are KTX2 (CDN assets) or embedded in the GLB (placeholders). */
  textureFormat: 'ktx2' | 'embedded'
  defaultTransform: Transform
  minScale: number
  maxScale: number
  minRotation: Vec3
  maxRotation: Vec3
  /** Reference anchor offset (the authoritative anchor map lives in scene/anchors.ts). */
  anchorPoint: Vec3
  /** assetIds that cannot coexist with this one. */
  excludes: string[]
  /** assetIds that must also be present for this one. */
  dependencies: string[]
  fileSizeBytes: number
  triangleCount: number
}

export interface MusicTrackEntry {
  trackId: string
  displayName: string
  audioFile: string
  durationSeconds: number
  previewImage?: string
}

export interface CatalogManifest {
  version: string
  assets: AssetManifestEntry[]
  backgrounds: AssetManifestEntry[]
  foregrounds: AssetManifestEntry[]
  props: AssetManifestEntry[]
  musicTracks: MusicTrackEntry[]
}

function isVec3(v: unknown): v is Vec3 {
  return Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number')
}

function isTransform(v: unknown): v is Transform {
  if (typeof v !== 'object' || v === null) return false
  const t = v as Record<string, unknown>
  return isVec3(t.position) && isVec3(t.rotation) && typeof t.scale === 'number'
}

function isAssetEntry(v: unknown): v is AssetManifestEntry {
  if (typeof v !== 'object' || v === null) return false
  const a = v as Record<string, unknown>
  return (
    typeof a.assetId === 'string' &&
    typeof a.slotType === 'string' &&
    typeof a.displayName === 'string' &&
    typeof a.previewImage === 'string' &&
    typeof a.glbFile === 'string' &&
    (a.textureFormat === 'ktx2' || a.textureFormat === 'embedded') &&
    isTransform(a.defaultTransform) &&
    typeof a.minScale === 'number' &&
    typeof a.maxScale === 'number' &&
    isVec3(a.minRotation) &&
    isVec3(a.maxRotation) &&
    isVec3(a.anchorPoint) &&
    Array.isArray(a.excludes) &&
    Array.isArray(a.dependencies) &&
    typeof a.fileSizeBytes === 'number' &&
    typeof a.triangleCount === 'number'
  )
}

function isMusicTrack(v: unknown): v is MusicTrackEntry {
  if (typeof v !== 'object' || v === null) return false
  const m = v as Record<string, unknown>
  return (
    typeof m.trackId === 'string' &&
    typeof m.displayName === 'string' &&
    typeof m.audioFile === 'string' &&
    typeof m.durationSeconds === 'number'
  )
}

/** Structural type guard for a fetched manifest — rejects malformed data loudly. */
export function isValidManifest(data: unknown): data is CatalogManifest {
  if (typeof data !== 'object' || data === null) return false
  const m = data as Record<string, unknown>
  if (typeof m.version !== 'string') return false
  const lists = [m.assets, m.backgrounds, m.foregrounds, m.props]
  if (!lists.every((l) => Array.isArray(l) && l.every(isAssetEntry))) return false
  if (!Array.isArray(m.musicTracks) || !m.musicTracks.every(isMusicTrack)) return false
  return true
}
