// Generates placeholder catalog assets for the lean MVP:
//   - GLB models (real three.js primitives → exercises the full GLB load path)
//   - SVG thumbnails
//   - a synthesized "music box" WAV track
//   - public/catalog/manifest.json (single source of truth, matches catalog-types.ts)
//
// Real scanned/Draco-compressed assets swap into the manifest later.
// Run: node scripts/gen-placeholder-assets.mjs

import { writeFileSync, mkdirSync, statSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BoxGeometry, SphereGeometry, ConeGeometry, CylinderGeometry, TorusGeometry } from 'three'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const MODELS_DIR = resolve(ROOT, 'public/assets/models')
const PREVIEWS_DIR = resolve(ROOT, 'public/assets/previews')
const AUDIO_DIR = resolve(ROOT, 'public/assets/audio')
const CATALOG_DIR = resolve(ROOT, 'public/catalog')
for (const d of [MODELS_DIR, PREVIEWS_DIR, AUDIO_DIR, CATALOG_DIR])
  mkdirSync(d, { recursive: true })

// ── GLB serialization (single mesh: POSITION + NORMAL, indexed) ──────────────
function geometryFor(shape) {
  switch (shape) {
    case 'sphere':
      return new SphereGeometry(1, 18, 14)
    case 'box':
      return new BoxGeometry(1, 1, 1)
    case 'flatbox':
      return new BoxGeometry(2.4, 1.4, 0.15)
    case 'cone':
      return new ConeGeometry(0.8, 1.7, 18)
    case 'cylinder':
      return new CylinderGeometry(0.7, 0.85, 1.6, 18)
    case 'torus':
      return new TorusGeometry(0.8, 0.32, 14, 28)
    case 'plane':
      return new BoxGeometry(8, 12, 0.2)
    default:
      return new BoxGeometry(1, 1, 1)
  }
}

function pad4(len) {
  return (4 - (len % 4)) % 4
}

function buildGlb(shape, colorHex) {
  const geo = geometryFor(shape)
  const pos = geo.attributes.position.array // Float32Array
  const nrm = geo.attributes.normal.array // Float32Array
  const idxRaw = geo.index.array
  const idx = idxRaw instanceof Uint32Array ? idxRaw : new Uint32Array(idxRaw)

  // Position min/max (required on the POSITION accessor).
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < pos.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = pos[i + k]
      if (v < min[k]) min[k] = v
      if (v > max[k]) max[k] = v
    }
  }

  const idxBytes = Buffer.from(idx.buffer, idx.byteOffset, idx.byteLength)
  const posBytes = Buffer.from(pos.buffer, pos.byteOffset, pos.byteLength)
  const nrmBytes = Buffer.from(nrm.buffer, nrm.byteOffset, nrm.byteLength)

  const idxOffset = 0
  const posOffset = idxBytes.length
  const nrmOffset = posOffset + posBytes.length
  const binLen = nrmOffset + nrmBytes.length

  const r = parseInt(colorHex.slice(1, 3), 16) / 255
  const g = parseInt(colorHex.slice(3, 5), 16) / 255
  const b = parseInt(colorHex.slice(5, 7), 16) / 255

  const gltf = {
    asset: { version: '2.0', generator: 'doll-placeholder-gen' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [
      {
        primitives: [{ attributes: { POSITION: 1, NORMAL: 2 }, indices: 0, material: 0, mode: 4 }],
      },
    ],
    materials: [
      {
        pbrMetallicRoughness: {
          baseColorFactor: [r, g, b, 1],
          metallicFactor: 0.05,
          roughnessFactor: 0.85,
        },
      },
    ],
    accessors: [
      { bufferView: 0, componentType: 5125, count: idx.length, type: 'SCALAR' },
      {
        bufferView: 1,
        componentType: 5126,
        count: pos.length / 3,
        type: 'VEC3',
        min,
        max,
      },
      { bufferView: 2, componentType: 5126, count: nrm.length / 3, type: 'VEC3' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: idxOffset, byteLength: idxBytes.length, target: 34963 },
      { buffer: 0, byteOffset: posOffset, byteLength: posBytes.length, target: 34962 },
      { buffer: 0, byteOffset: nrmOffset, byteLength: nrmBytes.length, target: 34962 },
    ],
    buffers: [{ byteLength: binLen }],
  }

  const bin = Buffer.concat([idxBytes, posBytes, nrmBytes])
  const binPadded = Buffer.concat([bin, Buffer.alloc(pad4(bin.length), 0)])

  let json = Buffer.from(JSON.stringify(gltf), 'utf8')
  json = Buffer.concat([json, Buffer.alloc(pad4(json.length), 0x20)])

  const totalLen = 12 + 8 + json.length + 8 + binPadded.length
  const header = Buffer.alloc(12)
  header.writeUInt32LE(0x46546c67, 0) // 'glTF'
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(totalLen, 8)

  const jsonChunkHeader = Buffer.alloc(8)
  jsonChunkHeader.writeUInt32LE(json.length, 0)
  jsonChunkHeader.writeUInt32LE(0x4e4f534a, 4) // 'JSON'

  const binChunkHeader = Buffer.alloc(8)
  binChunkHeader.writeUInt32LE(binPadded.length, 0)
  binChunkHeader.writeUInt32LE(0x004e4942, 4) // 'BIN\0'

  return {
    glb: Buffer.concat([header, jsonChunkHeader, json, binChunkHeader, binPadded]),
    triangles: idx.length / 3,
  }
}

// ── SVG thumbnail ────────────────────────────────────────────────────────────
function buildThumbnail(label, colorHex) {
  const initials = label
    .split(/[\s-]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
  <rect width="160" height="160" rx="20" fill="${colorHex}"/>
  <circle cx="80" cy="64" r="34" fill="rgba(255,255,255,0.25)"/>
  <text x="80" y="74" font-family="system-ui,sans-serif" font-size="34" font-weight="700"
    fill="#fff" text-anchor="middle">${initials}</text>
  <text x="80" y="132" font-family="system-ui,sans-serif" font-size="14"
    fill="rgba(255,255,255,0.9)" text-anchor="middle">${label}</text>
</svg>
`
}

// ── Synthesized "music box" WAV ───────────────────────────────────────────────
function buildMusicWav(durationSec) {
  const sr = 44100
  const total = Math.floor(sr * durationSec)
  const data = Buffer.alloc(total * 2)
  // Pentatonic-ish music-box motif (C5 E5 G5 A5 C6 ...), plucky decay.
  const notes = [523.25, 659.25, 783.99, 880.0, 1046.5, 880.0, 783.99, 659.25]
  const noteDur = 0.4
  for (let i = 0; i < total; i++) {
    const t = i / sr
    const noteIdx = Math.floor(t / noteDur) % notes.length
    const f = notes[noteIdx]
    const tInNote = t - Math.floor(t / noteDur) * noteDur
    const env = Math.exp(-tInNote * 5.5)
    const s = env * (Math.sin(2 * Math.PI * f * t) * 0.55 + Math.sin(2 * Math.PI * f * 2 * t) * 0.2)
    const v = Math.max(-1, Math.min(1, s)) * 0.6
    data.writeInt16LE((v * 32767) | 0, i * 2)
  }
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(1, 22) // mono
  header.writeUInt32LE(sr, 24)
  header.writeUInt32LE(sr * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

// ── Asset definitions ─────────────────────────────────────────────────────────
const SMALL_ROT = [0.3, Math.PI, 0.3]
const NEG_SMALL_ROT = [-0.3, -Math.PI, -0.3]

const slotAssets = [
  ['head', 'head-round-01', 'Round Head', 'sphere', '#f1c9a5', [0, 0, 0], 1.0],
  ['head', 'head-oval-01', 'Oval Head', 'sphere', '#e8b894', [0, 0, 0], 1.05],
  ['head', 'head-heart-01', 'Heart Head', 'sphere', '#f5d0c5', [0, 0, 0], 0.95],
  ['hair', 'hair-long-01', 'Long Hair', 'torus', '#3b2417', [0, 0.2, 0], 1.1],
  ['hair', 'hair-short-01', 'Short Hair', 'torus', '#6b4423', [0, 0.25, 0], 0.95],
  ['hair', 'hair-curly-01', 'Curly Hair', 'torus', '#1a1a1a', [0, 0.2, 0], 1.15],
  ['hair', 'hair-braids-01', 'Braids', 'torus', '#8b5a2b', [0, 0.2, 0], 1.0],
  ['bodyShell', 'body-dress-01', 'Dress', 'cone', '#d94f8a', [0, 0, 0], 1.2],
  ['bodyShell', 'body-coat-01', 'Coat', 'cylinder', '#4a6fa5', [0, 0, 0], 1.1],
  ['bodyShell', 'body-simple-01', 'Simple Body', 'cylinder', '#9b9b9b', [0, 0, 0], 1.0],
  ['wings', 'wings-butterfly-01', 'Butterfly Wings', 'flatbox', '#ff9ec7', [0, 0, 0], 1.2],
  ['wings', 'wings-angel-01', 'Angel Wings', 'flatbox', '#ffffff', [0, 0, 0], 1.3],
  ['feetBase', 'feet-boots-01', 'Boots', 'box', '#3a2a1a', [0, 0, 0], 1.0],
  ['feetBase', 'feet-ballet-01', 'Ballet Shoes', 'box', '#ffc0cb', [0, 0, 0], 0.9],
]

const sceneAssets = {
  backgrounds: [['background', 'bg-music-box-classic', 'Classic Music Box', 'plane', '#2a1a3a']],
  foregrounds: [['foreground', 'fg-curtain-red', 'Red Curtain', 'flatbox', '#7a1f2b']],
  props: [
    ['prop', 'prop-star-01', 'Star', 'cone', '#ffd700'],
    ['prop', 'prop-note-01', 'Music Note', 'torus', '#6366f1'],
    ['prop', 'prop-flower-01', 'Flower', 'sphere', '#ec4899'],
  ],
}

function relSize(absPath) {
  return statSync(absPath).size
}

function makeEntry(slotType, id, name, shape, color, pos = [0, 0, 0], scale = 1, extra = {}) {
  const { glb, triangles } = buildGlb(shape, color)
  const modelPath = resolve(MODELS_DIR, `${id}.glb`)
  writeFileSync(modelPath, glb)
  writeFileSync(resolve(PREVIEWS_DIR, `${id}.svg`), buildThumbnail(name, color))
  return {
    assetId: id,
    slotType,
    displayName: name,
    previewImage: `/assets/previews/${id}.svg`,
    glbFile: `/assets/models/${id}.glb`,
    textureFormat: 'embedded',
    defaultTransform: { position: pos, rotation: [0, 0, 0], scale },
    minScale: 0.8,
    maxScale: 1.5,
    minRotation: NEG_SMALL_ROT,
    maxRotation: SMALL_ROT,
    anchorPoint: [0, 0, 0],
    excludes: extra.excludes ?? [],
    dependencies: extra.dependencies ?? [],
    fileSizeBytes: relSize(modelPath),
    triangleCount: triangles,
  }
}

const manifest = {
  version: '1.0.0',
  assets: slotAssets.map(([slot, id, name, shape, color, pos, scale]) =>
    makeEntry(
      slot,
      id,
      name,
      shape,
      color,
      pos,
      scale,
      // Seed one excludes + one dependencies example (enforcement deferred post-MVP).
      id === 'hair-curly-01'
        ? { excludes: ['hair-long-01'] }
        : id === 'wings-angel-01'
          ? { dependencies: ['body-simple-01'] }
          : {},
    ),
  ),
  backgrounds: sceneAssets.backgrounds.map(([slot, id, name, shape, color]) =>
    makeEntry(slot, id, name, shape, color, [0, 0, -3], 1),
  ),
  foregrounds: sceneAssets.foregrounds.map(([slot, id, name, shape, color]) =>
    makeEntry(slot, id, name, shape, color, [0, -2, 2], 1.5),
  ),
  props: sceneAssets.props.map(([slot, id, name, shape, color]) =>
    makeEntry(slot, id, name, shape, color, [0, 0, 0], 0.4),
  ),
  musicTracks: [],
}

// Music track
const wavName = 'track-music-box-waltz'
const wavDuration = 12
writeFileSync(resolve(AUDIO_DIR, `${wavName}.wav`), buildMusicWav(wavDuration))
writeFileSync(resolve(PREVIEWS_DIR, `${wavName}.svg`), buildThumbnail('Music Box Waltz', '#6366f1'))
manifest.musicTracks.push({
  trackId: wavName,
  displayName: 'Music Box Waltz',
  audioFile: `/assets/audio/${wavName}.wav`,
  durationSeconds: wavDuration,
  previewImage: `/assets/previews/${wavName}.svg`,
})

writeFileSync(resolve(CATALOG_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2))

const counts = {
  slotAssets: manifest.assets.length,
  backgrounds: manifest.backgrounds.length,
  foregrounds: manifest.foregrounds.length,
  props: manifest.props.length,
  musicTracks: manifest.musicTracks.length,
}
console.log('Generated placeholder assets:', JSON.stringify(counts))
