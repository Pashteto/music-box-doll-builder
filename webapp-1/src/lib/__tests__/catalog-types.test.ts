import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { isValidManifest } from '@/lib/catalog-types'

const validManifest = {
  version: '1.0.0',
  assets: [
    {
      assetId: 'head-round-01',
      slotType: 'head',
      displayName: 'Round Head',
      previewImage: '/p.svg',
      glbFile: '/m.glb',
      textureFormat: 'embedded',
      defaultTransform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 },
      minScale: 0.8,
      maxScale: 1.5,
      minRotation: [-0.3, -3.14, -0.3],
      maxRotation: [0.3, 3.14, 0.3],
      anchorPoint: [0, 0, 0],
      excludes: [],
      dependencies: [],
      fileSizeBytes: 1000,
      triangleCount: 500,
    },
  ],
  backgrounds: [],
  foregrounds: [],
  props: [],
  musicTracks: [{ trackId: 't1', displayName: 'Track', audioFile: '/a.wav', durationSeconds: 10 }],
}

describe('isValidManifest', () => {
  it('accepts a well-formed manifest', () => {
    expect(isValidManifest(validManifest)).toBe(true)
  })

  it('rejects malformed inputs', () => {
    expect(isValidManifest(null)).toBe(false)
    expect(isValidManifest({})).toBe(false)
    expect(isValidManifest({ ...validManifest, version: 123 })).toBe(false)
    expect(isValidManifest({ ...validManifest, assets: 'nope' })).toBe(false)
    // asset missing required field
    const badAsset = { ...validManifest.assets[0], minScale: undefined }
    expect(isValidManifest({ ...validManifest, assets: [badAsset] })).toBe(false)
    // bad transform
    const badTransform = { ...validManifest.assets[0], defaultTransform: { position: [0, 0] } }
    expect(isValidManifest({ ...validManifest, assets: [badTransform] })).toBe(false)
  })
})

describe('generated manifest.json', () => {
  it('validates against the schema and meets MVP minimums', () => {
    const path = resolve(__dirname, '../../../public/catalog/manifest.json')
    const data = JSON.parse(readFileSync(path, 'utf8'))
    expect(isValidManifest(data)).toBe(true)
    expect(data.assets.length).toBeGreaterThanOrEqual(14)
    expect(data.backgrounds.length).toBeGreaterThanOrEqual(1)
    expect(data.foregrounds.length).toBeGreaterThanOrEqual(1)
    expect(data.props.length).toBeGreaterThanOrEqual(2)
    expect(data.musicTracks.length).toBeGreaterThanOrEqual(1)
    // distinct slot types across ≥3 doll slots
    const slots = new Set(data.assets.map((a: { slotType: string }) => a.slotType))
    expect(slots.size).toBeGreaterThanOrEqual(3)
  })
})
