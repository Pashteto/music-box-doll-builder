'use client'

import { useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { PerspectiveCamera } from 'three'
import type { Camera, Scene, WebGLRenderer } from 'three'
import { MotionTest } from '@/components/MotionTest'
import { renderSpikeMp4 } from '@/modules/render/spikeEncoder'

const RENDER_W = 1080
const RENDER_H = 1920
const FPS = 30
const DURATION = 4

interface SceneHandles {
  gl: WebGLRenderer
  scene: Scene
  camera: Camera
  mesh: { rotation: { y: number } } | null
}

// A spinning cube that also exposes the live three.js objects for offscreen capture.
function SpinningCube({ handles }: { handles: React.MutableRefObject<SceneHandles | null> }) {
  const meshRef = useRef<{ rotation: { y: number } }>(null)
  const { gl, scene, camera } = useThree()

  useFrame((_, delta) => {
    if (meshRef.current) meshRef.current.rotation.y += delta * 0.6
    handles.current = { gl, scene, camera, mesh: meshRef.current }
  })

  return (
    <mesh ref={meshRef as never}>
      <boxGeometry args={[2, 2, 2]} />
      <meshStandardMaterial color="#6366f1" />
    </mesh>
  )
}

export default function SpikePage() {
  const handles = useRef<SceneHandles | null>(null)
  const [status, setStatus] = useState('idle')
  const [progress, setProgress] = useState(0)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)

  async function handleExport() {
    const h = handles.current
    if (!h) {
      setStatus('scene not ready')
      return
    }
    const { gl, scene, camera } = h
    setStatus('rendering')
    setVideoUrl(null)

    // Render offscreen at the target portrait resolution without disturbing the visible canvas size.
    const prevSize = { w: gl.domElement.width, h: gl.domElement.height }
    gl.setSize(RENDER_W, RENDER_H, false)
    if (camera instanceof PerspectiveCamera) {
      camera.aspect = RENDER_W / RENDER_H
      camera.updateProjectionMatrix()
    }

    try {
      const { blob, codec, frames } = await renderSpikeMp4({
        width: RENDER_W,
        height: RENDER_H,
        fps: FPS,
        durationSeconds: DURATION,
        drawFrame: (i, total) => {
          if (h.mesh) h.mesh.rotation.y = (i / total) * Math.PI * 2
          gl.render(scene, camera)
          return gl.domElement
        },
        onProgress: (done, total) => setProgress(Math.round((done / total) * 100)),
      })
      const url = URL.createObjectURL(blob)
      setVideoUrl(url)
      setStatus(`done — ${codec}, ${frames} frames, ${(blob.size / 1024).toFixed(0)} KB`)

      const a = document.createElement('a')
      a.href = url
      a.download = 'spike.mp4'
      a.click()
    } catch (err) {
      setStatus(`FAILED: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      gl.setSize(prevSize.w, prevSize.h, false)
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center gap-4 p-6">
      <h1 className="text-xl font-bold">E10 render spike</h1>
      <MotionTest />
      <div className="aspect-[9/16] w-full max-w-[280px] overflow-hidden rounded-lg border border-black/10">
        <Canvas
          gl={{ preserveDrawingBuffer: true, antialias: true }}
          camera={{ position: [0, 0, 6], fov: 45 }}
        >
          <ambientLight intensity={0.5} />
          <directionalLight position={[5, 10, 5]} intensity={1} />
          <SpinningCube handles={handles} />
        </Canvas>
      </div>
      <button
        onClick={handleExport}
        className="rounded-lg bg-brand-primary px-5 py-2 font-medium text-white active:scale-95"
      >
        Export {DURATION}s MP4 ({RENDER_W}×{RENDER_H})
      </button>
      <p className="text-sm text-foreground/70">
        {status}
        {status === 'rendering' ? ` ${progress}%` : ''}
      </p>
      {videoUrl ? (
        <video src={videoUrl} controls playsInline className="w-full max-w-[280px] rounded-lg" />
      ) : null}
    </main>
  )
}
