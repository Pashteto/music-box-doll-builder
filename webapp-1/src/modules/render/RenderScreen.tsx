'use client'

import { useEffect, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { PerspectiveCamera } from '@react-three/drei'
import { useGLTF } from '@react-three/drei'
import type { Group } from 'three'
import { useAppStore } from '@/store'
import { getAssetById } from '@/modules/catalog/useCatalog'
import { DollComposition } from '@/modules/scene/DollComposition'
import {
  createFrameDrawer,
  RENDER_FPS,
  RENDER_HEIGHT,
  RENDER_WIDTH,
} from '@/modules/render/frameCapturer'
import { detectRenderPipeline } from '@/modules/render/codecDetection'
import { renderWebCodecsMp4 } from '@/modules/render/webcodecsPipeline'
import { renderMediaRecorderVideo } from '@/modules/render/mediaRecorderPipeline'
import { shareVideo, downloadVideo } from '@/modules/share/shareVideo'
import { useExportGate } from '@/modules/paywall/useEntitlement'
import { PaywallScreen } from '@/modules/paywall/PaywallScreen'
import type { RenderHandles } from '@/modules/render/frameCapturer'
import type { RenderResult } from '@/modules/render/renderTypes'
import type { CatalogManifest } from '@/lib/catalog-types'

type Status = 'preparing' | 'rendering' | 'done' | 'error'

interface RenderScreenProps {
  manifest: CatalogManifest | null
  onBack: () => void
}

/** Captures the live three.js objects into a ref once mounted. */
function RigCapture({
  groupRef,
  onReady,
}: {
  groupRef: React.RefObject<Group | null>
  onReady: (h: RenderHandles) => void
}) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    if (groupRef.current) onReady({ gl, scene, camera, group: groupRef.current })
  }, [gl, scene, camera, groupRef, onReady])
  return null
}

export function RenderScreen({ manifest, onBack }: RenderScreenProps) {
  const musicTrackId = useAppStore((s) => s.musicTrackId)
  const videoDuration = useAppStore((s) => s.videoDuration)

  const { canExport, consume } = useExportGate()
  const handlesRef = useRef<RenderHandles | null>(null)
  const startedRef = useRef(false)
  const [status, setStatus] = useState<Status>('preparing')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [showPaywall, setShowPaywall] = useState(false)
  const [result, setResult] = useState<{
    url: string
    blob: Blob
    mime: string
    codec: string
    hasAudio: boolean
  } | null>(null)

  const audioUrl = manifest?.musicTracks.find((t) => t.trackId === musicTrackId)?.audioFile ?? null

  // Preload selected GLBs so the offscreen scene is populated before capture.
  useEffect(() => {
    const s = useAppStore.getState()
    const urls = new Set<string>()
    for (const sel of s.slotSelections) {
      if (sel.assetId) {
        const e = getAssetById(sel.assetId, manifest)
        if (e) urls.add(e.glbFile)
      }
    }
    for (const id of [s.sceneBackground, s.sceneForeground]) {
      if (id) {
        const e = getAssetById(id, manifest)
        if (e) urls.add(e.glbFile)
      }
    }
    urls.forEach((u) => useGLTF.preload(u))
  }, [manifest])

  // Warn before closing the tab mid-render (E10-T5).
  useEffect(() => {
    if (status !== 'rendering') return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [status])

  async function runRender() {
    const handles = handlesRef.current
    if (!handles) return
    setStatus('rendering')
    setError(null)

    const caps = await detectRenderPipeline(RENDER_WIDTH, RENDER_HEIGHT, RENDER_FPS)
    if (caps.pipeline === 'none') {
      setError('Video rendering is not supported in this browser.')
      setStatus('error')
      return
    }

    const drawer = createFrameDrawer(handles, RENDER_WIDTH, RENDER_HEIGHT)
    try {
      const params = {
        width: RENDER_WIDTH,
        height: RENDER_HEIGHT,
        fps: RENDER_FPS,
        durationSeconds: videoDuration,
        audioUrl,
        drawFrame: drawer.drawFrame,
        onProgress: (f: number) => setProgress(f),
      }
      const res: RenderResult =
        caps.pipeline === 'webcodecs'
          ? await renderWebCodecsMp4(params)
          : await renderMediaRecorderVideo(params)

      const url = URL.createObjectURL(res.blob)
      setResult({
        url,
        blob: res.blob,
        mime: res.mimeType,
        codec: res.codec,
        hasAudio: res.hasAudio,
      })
      setStatus('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    } finally {
      drawer.restore()
    }
  }

  // First export is free; subsequent exports hit the (stubbed) paywall.
  function gatedExport(action: () => void) {
    if (!canExport) {
      setShowPaywall(true)
      return
    }
    action()
    consume()
  }

  function handleReady(h: RenderHandles) {
    handlesRef.current = h
    if (startedRef.current) return
    startedRef.current = true
    // Let assets settle in the scene graph for a few frames before capturing.
    setTimeout(() => void runRender(), 400)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Offscreen render rig (visually hidden, real WebGL context). */}
      <div
        aria-hidden
        style={{
          position: 'fixed',
          left: 0,
          top: 0,
          width: 2,
          height: 2,
          opacity: 0,
          overflow: 'hidden',
          pointerEvents: 'none',
        }}
      >
        <div style={{ width: 18, height: 32 }}>
          <Canvas frameloop="never" gl={{ preserveDrawingBuffer: true, antialias: true }}>
            <PerspectiveCamera makeDefault position={[0, 0.4, 9]} fov={42} />
            <ambientLight intensity={0.55} />
            <hemisphereLight args={['#ffffff', '#40304a', 0.5]} />
            <directionalLight position={[5, 10, 6]} intensity={1.1} />
            <directionalLight position={[-6, 4, -4]} intensity={0.4} />
            <RenderRigGroup manifest={manifest} onReady={handleReady} />
          </Canvas>
        </div>
      </div>

      {status === 'preparing' || status === 'rendering' ? (
        <div className="flex flex-col items-center gap-3 py-6">
          <p className="font-medium">
            {status === 'preparing' ? 'Preparing…' : 'Rendering your video…'}
          </p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-black/10">
            <div
              className="h-full bg-brand-primary transition-all"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <p className="text-sm text-foreground/60">{Math.round(progress * 100)}%</p>
        </div>
      ) : null}

      {status === 'done' && result ? (
        <>
          <video
            src={result.url}
            controls
            autoPlay
            muted
            loop
            playsInline
            data-testid="render-result"
            data-has-audio={result.hasAudio}
            data-codec={result.codec}
            data-size={result.blob.size}
            className="mx-auto max-h-[50dvh] rounded-xl"
          />
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => gatedExport(() => void shareVideo(result.blob, result.mime))}
              className="flex-1 rounded-xl bg-brand-primary px-4 py-3 font-semibold text-white active:scale-95"
            >
              Share
            </button>
            <button
              type="button"
              onClick={() => gatedExport(() => downloadVideo(result.blob, result.mime))}
              className="flex-1 rounded-xl border-2 border-brand-primary px-4 py-3 font-semibold text-brand-primary active:scale-95"
            >
              Save
            </button>
          </div>
          <button type="button" onClick={onBack} className="text-sm text-foreground/60">
            ← Re-render
          </button>
        </>
      ) : null}

      {showPaywall ? <PaywallScreen onClose={() => setShowPaywall(false)} /> : null}

      {status === 'error' ? (
        <div className="flex flex-col items-center gap-3 py-6">
          <p className="text-center text-sm text-red-600">{error}</p>
          <button
            type="button"
            onClick={onBack}
            className="rounded-xl bg-brand-primary px-5 py-2.5 font-medium text-white"
          >
            ← Back
          </button>
        </div>
      ) : null}
    </div>
  )
}

/** The rotating group containing the assembled doll, plus the ref capture. */
function RenderRigGroup({
  manifest,
  onReady,
}: {
  manifest: CatalogManifest | null
  onReady: (h: RenderHandles) => void
}) {
  const groupRef = useRef<Group>(null)
  return (
    <>
      <group ref={groupRef}>
        <DollComposition manifest={manifest} showScene />
      </group>
      <RigCapture groupRef={groupRef} onReady={onReady} />
    </>
  )
}
