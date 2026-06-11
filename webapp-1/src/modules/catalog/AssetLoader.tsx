'use client'

import { Suspense, useEffect, useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import type { Group, Object3D } from 'three'
import type { Transform } from '@/lib/types'
import { disposeObject } from '@/modules/scene/useDispose'

// Draco decoder path — only fetched when a Draco-compressed mesh is actually loaded
// (placeholder GLBs are uncompressed, so no network hit here).
const DRACO_PATH = 'https://www.gstatic.com/draco/v1/decoders/'

// NOTE: KTX2/Basis texture transcoding is deferred until real KTX2 assets exist.
// Placeholders use embedded textures. When CDN assets arrive, attach a KTX2Loader
// via useGLTF's extendLoader callback (bind detectSupport to the R3F renderer).

interface AssetLoaderProps {
  url: string
  transform?: Transform
  onError?: (error: Error) => void
}

/** Inner loader — relies on Suspense (thrown by useGLTF) for the loading state. */
function GLTFModel({ url, transform }: AssetLoaderProps) {
  const groupRef = useRef<Group>(null)
  const { scene } = useGLTF(url, DRACO_PATH)

  // Dispose cloned resources when this asset unmounts or its URL changes.
  useEffect(() => {
    const node: Object3D | null = groupRef.current
    return () => {
      if (node) disposeObject(node)
    }
  }, [url])

  return (
    <group ref={groupRef}>
      <primitive
        object={scene.clone(true)}
        position={transform?.position ?? [0, 0, 0]}
        rotation={transform?.rotation ?? [0, 0, 0]}
        scale={transform?.scale ?? 1}
      />
    </group>
  )
}

/** Translucent placeholder shown while the GLB downloads/parses. */
function FallbackMesh() {
  return (
    <mesh>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color="#6366f1" wireframe transparent opacity={0.3} />
    </mesh>
  )
}

/**
 * Loads and renders a GLB at the given URL with a Suspense fallback (E3-T4).
 * Wrap usages in an ErrorBoundary at the scene level to catch load failures.
 */
export function AssetLoader(props: AssetLoaderProps) {
  return (
    <Suspense fallback={<FallbackMesh />}>
      <GLTFModel {...props} />
    </Suspense>
  )
}

export { FallbackMesh }
