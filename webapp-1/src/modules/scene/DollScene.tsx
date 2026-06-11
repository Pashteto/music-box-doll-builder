'use client'

import { Canvas } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera, Stats } from '@react-three/drei'
import type { ReactNode } from 'react'

interface DollSceneProps {
  children?: ReactNode
  /** Show the dev FPS counter (defaults to development only). */
  showStats?: boolean
  className?: string
}

/**
 * Reusable portrait (9:16) 3D stage shared by the editor, scene composer, and
 * render engine (E5-T1). Bounded orbit controls, soft lighting, pixel-ratio
 * clamped to ≤2 for mobile GPU memory.
 */
export function DollScene({ children, showStats, className }: DollSceneProps) {
  const stats = showStats ?? process.env.NODE_ENV === 'development'

  return (
    <div className={className ?? 'aspect-[9/16] w-full overflow-hidden rounded-2xl bg-[#1a1424]'}>
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        // preserveDrawingBuffer lets the render engine (E10) read frames back.
      >
        <PerspectiveCamera makeDefault position={[0, 0.4, 9]} fov={42} />
        <OrbitControls
          target={[0, 0.4, 0]}
          enablePan={false}
          enableDamping
          minDistance={4}
          maxDistance={16}
          minPolarAngle={0.25}
          maxPolarAngle={Math.PI - 0.25}
        />
        <ambientLight intensity={0.55} />
        <hemisphereLight args={['#ffffff', '#40304a', 0.5]} />
        <directionalLight position={[5, 10, 6]} intensity={1.1} castShadow={false} />
        <directionalLight position={[-6, 4, -4]} intensity={0.4} />
        {children}
        {stats ? <Stats /> : null}
      </Canvas>
    </div>
  )
}
