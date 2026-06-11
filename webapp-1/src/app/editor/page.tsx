'use client'

import { useEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import { useCatalog, getAssetById } from '@/modules/catalog/useCatalog'
import { useAutosave } from '@/modules/storage/useAutosave'
import { createNewProject } from '@/modules/storage/useProjectLoader'
import { DollScene } from '@/modules/scene/DollScene'
import { DollComposition } from '@/modules/scene/DollComposition'
import { TransformControls } from '@/modules/scene/TransformControls'
import { SlotCatalog } from '@/modules/editor/SlotCatalog'
import { ProgressDots } from '@/modules/editor/ProgressDots'
import { SceneComposer } from '@/modules/scene-composer/SceneComposer'
import { MusicSelection } from '@/modules/music/MusicSelection'
import { RenderScreen } from '@/modules/render/RenderScreen'
import { useEntitlementInit } from '@/modules/paywall/useEntitlement'
import { PHASE1_SLOTS, SLOT_LABELS } from '@/modules/editor/slots'

function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-xl bg-brand-primary px-5 py-2.5 font-medium text-white active:scale-95 disabled:opacity-40"
    >
      {children}
    </button>
  )
}

function GhostButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl px-4 py-2.5 font-medium text-foreground/70 active:scale-95"
    >
      {children}
    </button>
  )
}

export default function EditorPage() {
  const { manifest, isLoading, error } = useCatalog()
  useAutosave()
  useEntitlementInit()

  const editorMode = useAppStore((s) => s.editorMode)
  const isReviewMode = useAppStore((s) => s.isReviewMode)
  const currentStep = useAppStore((s) => s.currentStep)
  const projectId = useAppStore((s) => s.projectId)
  const slotSelections = useAppStore((s) => s.slotSelections)
  const goToNextSlot = useAppStore((s) => s.goToNextSlot)
  const goToPrevSlot = useAppStore((s) => s.goToPrevSlot)
  const goToSlot = useAppStore((s) => s.goToSlot)
  const setEditorMode = useAppStore((s) => s.setEditorMode)
  const setReviewMode = useAppStore((s) => s.setReviewMode)

  // Initialize a project if the editor was opened directly (no landing flow yet).
  const initRef = useRef(false)
  useEffect(() => {
    if (!initRef.current && !projectId) {
      initRef.current = true
      void createNewProject()
    }
  }, [projectId])

  const currentSlot = PHASE1_SLOTS[currentStep] ?? PHASE1_SLOTS[0]!
  const currentSel = slotSelections.find((s) => s.slotType === currentSlot)
  const currentEntry = currentSel?.assetId
    ? (getAssetById(currentSel.assetId, manifest) ?? null)
    : null
  const inSlotEditor = editorMode === 'slot-editor' && !isReviewMode

  return (
    <main className="flex min-h-dvh flex-col bg-background">
      {/* 3D stage (hidden during render — RenderScreen owns its own offscreen canvas) */}
      {editorMode !== 'render' ? (
        <div className="flex-1 p-3 pb-0">
          <DollScene className="h-full min-h-[45dvh] w-full overflow-hidden rounded-2xl bg-[#1a1424]">
            <DollComposition
              manifest={manifest}
              selectedSlot={inSlotEditor ? currentSlot : null}
              showScene={!inSlotEditor}
            />
          </DollScene>
        </div>
      ) : null}

      {/* Bottom control panel */}
      <section className="flex flex-col gap-3 rounded-t-3xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.08)]">
        {isLoading ? (
          <p className="text-center text-sm text-foreground/60">Loading catalog…</p>
        ) : null}
        {error ? (
          <p className="text-center text-sm text-red-600">
            Catalog failed to load: {error.message}
          </p>
        ) : null}

        {/* Slot editor */}
        {inSlotEditor && !isLoading ? (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{SLOT_LABELS[currentSlot]}</h2>
              <span className="text-xs text-foreground/50">
                {currentStep + 1} / {PHASE1_SLOTS.length}
              </span>
            </div>
            <SlotCatalog slotType={currentSlot} manifest={manifest} />
            {currentEntry ? (
              <TransformControls slotType={currentSlot} entry={currentEntry} mode="slot" />
            ) : (
              <p className="text-xs text-foreground/50">Pick an item to place it on your doll.</p>
            )}
            <ProgressDots total={PHASE1_SLOTS.length} current={currentStep} onJump={goToSlot} />
            <div className="flex items-center justify-between">
              {currentStep > 0 ? (
                <GhostButton onClick={goToPrevSlot}>← Back</GhostButton>
              ) : (
                <span />
              )}
              <PrimaryButton onClick={goToNextSlot}>
                {currentStep === PHASE1_SLOTS.length - 1 ? 'Done →' : 'Next →'}
              </PrimaryButton>
            </div>
          </>
        ) : null}

        {/* Completion / review */}
        {editorMode === 'slot-editor' && isReviewMode ? (
          <>
            <h2 className="text-center text-lg font-semibold">Your doll is ready ✨</h2>
            <p className="text-center text-xs text-foreground/60">
              Drag to rotate. Continue to decorate the scene.
            </p>
            <div className="flex items-center justify-between">
              <GhostButton
                onClick={() => {
                  setReviewMode(false)
                  goToSlot(PHASE1_SLOTS.length - 1)
                }}
              >
                ← Back to slots
              </GhostButton>
              <PrimaryButton onClick={() => setEditorMode('scene')}>Continue →</PrimaryButton>
            </div>
          </>
        ) : null}

        {/* Scene composer */}
        {editorMode === 'scene' ? (
          <>
            <h2 className="text-lg font-semibold">Decorate the scene</h2>
            <SceneComposer manifest={manifest} />
            <div className="flex items-center justify-between">
              <GhostButton
                onClick={() => {
                  setEditorMode('slot-editor')
                  setReviewMode(true)
                }}
              >
                ← Back
              </GhostButton>
              <PrimaryButton onClick={() => setEditorMode('music')}>Continue →</PrimaryButton>
            </div>
          </>
        ) : null}

        {/* Music selection */}
        {editorMode === 'music' ? (
          <>
            <h2 className="text-lg font-semibold">Pick your music</h2>
            <MusicSelection manifest={manifest} onRender={() => setEditorMode('render')} />
            <GhostButton onClick={() => setEditorMode('scene')}>← Back to scene</GhostButton>
          </>
        ) : null}

        {/* Render + share */}
        {editorMode === 'render' || editorMode === 'share' ? (
          <>
            <h2 className="text-lg font-semibold">Your video</h2>
            <RenderScreen manifest={manifest} onBack={() => setEditorMode('music')} />
          </>
        ) : null}
      </section>
    </main>
  )
}
