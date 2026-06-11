'use client'

import { Canvas, useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Group } from 'three'
import { AssetLoader } from '@/modules/catalog/AssetLoader'

// A few placeholder parts assembled into a gently spinning demo doll for the landing.
const DEMO_PARTS = [
  { url: '/assets/models/head-round-01.glb', position: [0, 2.2, 0] as const, scale: 1 },
  { url: '/assets/models/body-dress-01.glb', position: [0, 0.2, 0] as const, scale: 1.2 },
  { url: '/assets/models/wings-angel-01.glb', position: [0, 0.6, -0.5] as const, scale: 1.3 },
]

function SpinningDoll() {
  const group = useRef<Group>(null)
  useFrame((_, delta) => {
    if (group.current) group.current.rotation.y += delta * 0.5
  })
  return (
    <group ref={group}>
      {DEMO_PARTS.map((p) => (
        <group key={p.url} position={p.position}>
          <AssetLoader
            url={p.url}
            transform={{ position: [0, 0, 0], rotation: [0, 0, 0], scale: p.scale }}
          />
        </group>
      ))}
    </group>
  )
}

/** Lazy-loaded R3F demo doll for the landing (E1-T2) — code-split off the SSR shell. */
export default function LandingScene() {
  return (
    <Canvas dpr={[1, 2]} camera={{ position: [0, 0.8, 9], fov: 42 }}>
      <ambientLight intensity={0.6} />
      <hemisphereLight args={['#ffffff', '#40304a', 0.5]} />
      <directionalLight position={[5, 10, 6]} intensity={1.1} />
      <SpinningDoll />
    </Canvas>
  )
}
