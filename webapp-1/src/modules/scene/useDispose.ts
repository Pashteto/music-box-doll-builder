'use client'

import { useEffect, useRef } from 'react'
import type { Material, Object3D, Texture } from 'three'
import { Mesh } from 'three'

function disposeMaterial(material: Material): void {
  // Dispose any texture maps referenced by the material.
  const record = material as unknown as Record<string, unknown>
  for (const value of Object.values(record)) {
    if (value && typeof value === 'object' && 'isTexture' in value && value.isTexture) {
      ;(value as Texture).dispose()
    }
  }
  material.dispose()
}

/**
 * Recursively dispose every geometry, material, and texture under an Object3D
 * so removing an asset returns renderer.info to baseline (no GPU leak) — E5-T4.
 */
export function disposeObject(root: Object3D): void {
  root.traverse((child) => {
    if (child instanceof Mesh) {
      child.geometry?.dispose()
      const mat = child.material
      if (Array.isArray(mat)) mat.forEach(disposeMaterial)
      else if (mat) disposeMaterial(mat)
    }
  })
}

/** Hook that disposes the referenced object on unmount. */
export function useDispose<T extends Object3D>() {
  const ref = useRef<T>(null)
  useEffect(() => {
    const node = ref.current
    return () => {
      if (node) disposeObject(node)
    }
  }, [])
  return ref
}
