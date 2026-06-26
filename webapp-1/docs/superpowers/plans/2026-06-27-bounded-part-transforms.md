# Bounded Move & Rotate for Doll Parts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users move (X/Y/Z), rotate (spin + 2 tilts), and scale each doll part within tight per-part limits, with child parts (hair, hat…) following their parent (head, body…).

**Architecture:** Extend the existing slider panel (`TransformControls`) to expose all 6 DOF + size, sourcing rotation/scale bounds from the manifest and position bounds from a new per-slot table. Activate the existing `SLOT_PARENT` map by rebuilding the doll renderer (`DollComposition` + `SlotMesh`) into a recursive tree where children render relative to their parent's anchor and inherit the parent's position + rotation (but not scale). All edits keep funneling through the existing `applyConstraints` clamp, so nothing can ever persist out of bounds.

**Tech Stack:** Next.js 15 / React 19 / TypeScript (strict), React Three Fiber + Drei (3D), Zustand (store), Tailwind v4, Vitest + Testing Library (tests).

## Global Constraints

- TypeScript strict mode; no `any`. Exact existing types: `Vec3 = [number, number, number]`, `Transform = { position: Vec3; rotation: Vec3; scale: number }`, `IDENTITY_TRANSFORM`, `SlotType`, `SLOT_TYPES` (16 entries) — all from `@/lib/types`.
- **No data-model / schema change.** `Transform` already carries full position + rotation and is already autosaved to IndexedDB and synced. The feature only *uses* fields that already persist.
- **Every transform edit must route through `updateTransform(slotType, transform, metadata)`**, which applies `applyConstraints` — UI must never persist an unclamped value.
- Position-offset bounds live **per slot type** (co-located with `SLOT_ANCHORS` in `src/modules/scene/anchors.ts`). Rotation + scale bounds continue to come from the manifest per asset (`minRotation`/`maxRotation`/`minScale`/`maxScale`).
- Children inherit parent **position + rotation only** — never scale.
- Styling follows the existing `linden_tar` system: `accent-brand-primary` ranges, porcelain text ramp, uppercase eyebrow labels (`text-xs font-semibold uppercase tracking-[0.12em] text-text-muted`).
- Mobile-first; sliders are native `<input type="range">` (keyboard-accessible). Reduced motion is already handled globally.
- Test runner: `npx vitest run <path>`. Typecheck: `npx tsc --noEmit`. Lint: `npm run lint`. Build: `npm run build`.
- Frequent commits — one per task.

**Out of scope (do not build):** direct 3D drag/gizmo, a dedicated whole-doll "adjust pass" / `global-adjust` editor mode, per-asset position bounds, collision/physics.

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/modules/scene/anchors.ts` | Anchors + per-slot position-bound table + pure parent-tree helpers | Modify |
| `src/modules/scene/transformBounds.ts` | Pure helpers: build clamp metadata for a slot; strip a transform to scale-only | Create |
| `src/modules/scene/SlotMesh.tsx` | Recursive `SlotFrame` — renders one slot's frame (relative anchor → nudge → scale-only mesh) and its nested children | Modify |
| `src/modules/scene/DollComposition.tsx` | Render root slots as `SlotFrame`s; scene bg/fg unchanged | Modify |
| `src/modules/scene/TransformControls.tsx` | 7 grouped sliders (Move / Rotate / Size) + Reset; uses `slotConstraints` | Modify |
| `src/app/editor/page.tsx` | Drop the removed `mode` prop on `TransformControls` | Modify (1 line) |
| `src/modules/scene/__tests__/anchors.test.ts` | Tests for bound table + tree helpers | Create |
| `src/modules/scene/__tests__/transformBounds.test.ts` | Tests for `slotConstraints` + `scaleOnlyTransform` | Create |
| `src/modules/scene/__tests__/TransformControls.test.tsx` | Component test: sliders render, clamp on commit, reset | Create |

**Task order:** Task 1 → Task 2 → Task 3 → Task 4. Tasks 3 and 4 both depend on 1 & 2 but are independent of each other.

---

### Task 1: Position-bound table + parent-tree helpers

Pure additions to `anchors.ts`. No rendering. These are the testable foundation for parenting and for the position clamp boxes.

**Files:**
- Modify: `src/modules/scene/anchors.ts`
- Test: `src/modules/scene/__tests__/anchors.test.ts` (create)

**Interfaces:**
- Consumes: `SlotType`, `Vec3`, `SLOT_TYPES` from `@/lib/types`; existing `SLOT_ANCHORS`, `SLOT_PARENT` in the same file.
- Produces:
  - `interface OffsetBox { min: Vec3; max: Vec3 }`
  - `const SLOT_POSITION_BOUNDS: Record<SlotType, OffsetBox>`
  - `const ROOT_SLOTS: SlotType[]` — slots with no parent
  - `function childrenOf(slot: SlotType): SlotType[]`
  - `function relativeAnchorPosition(slot: SlotType): Vec3`
  - `function relativeAnchorRotation(slot: SlotType): Vec3`

- [ ] **Step 1: Write the failing test**

Create `src/modules/scene/__tests__/anchors.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { SLOT_TYPES } from '@/lib/types'
import {
  SLOT_ANCHORS,
  SLOT_POSITION_BOUNDS,
  ROOT_SLOTS,
  childrenOf,
  relativeAnchorPosition,
  relativeAnchorRotation,
} from '@/modules/scene/anchors'

describe('SLOT_POSITION_BOUNDS', () => {
  it('defines a box for every slot type', () => {
    for (const slot of SLOT_TYPES) {
      expect(SLOT_POSITION_BOUNDS[slot]).toBeDefined()
      expect(SLOT_POSITION_BOUNDS[slot].min).toHaveLength(3)
      expect(SLOT_POSITION_BOUNDS[slot].max).toHaveLength(3)
    }
  })

  it('keeps the lowest possible head above the highest possible feet', () => {
    const headLowestY = SLOT_ANCHORS.head.position[1] + SLOT_POSITION_BOUNDS.head.min[1]
    const feetHighestY = SLOT_ANCHORS.feetBase.position[1] + SLOT_POSITION_BOUNDS.feetBase.max[1]
    expect(headLowestY).toBeGreaterThan(feetHighestY)
  })
})

describe('parent tree helpers', () => {
  it('roots exclude any parented slot', () => {
    expect(ROOT_SLOTS).toContain('head')
    expect(ROOT_SLOTS).not.toContain('hair')
    expect(ROOT_SLOTS).not.toContain('collar')
  })

  it('lists the head children', () => {
    expect(childrenOf('head').sort()).toEqual(['hair', 'halo', 'hat', 'horns'].sort())
  })

  it('returns an empty array for a childless slot', () => {
    expect(childrenOf('hair')).toEqual([])
  })

  it('expresses a child anchor relative to its parent', () => {
    // hair anchor [0,2.6,0] minus head anchor [0,2.2,0]
    expect(relativeAnchorPosition('hair')).toEqual([0, 0.6 - 0.2, 0])
  })

  it('returns the absolute anchor for a root slot', () => {
    expect(relativeAnchorPosition('head')).toEqual(SLOT_ANCHORS.head.position)
  })

  it('relative rotation of a child is zero (all anchors are unrotated)', () => {
    expect(relativeAnchorRotation('hair')).toEqual([0, 0, 0])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/scene/__tests__/anchors.test.ts`
Expected: FAIL — `SLOT_POSITION_BOUNDS`, `ROOT_SLOTS`, `childrenOf`, `relativeAnchorPosition`, `relativeAnchorRotation` are not exported.

- [ ] **Step 3: Implement the additions**

Edit `src/modules/scene/anchors.ts`. Change the import line to include `SLOT_TYPES`:

```ts
import { SLOT_TYPES, type SlotType, type Vec3 } from '@/lib/types'
```

Then append at the end of the file (after the existing `SLOT_PARENT` declaration):

```ts
/** An axis-aligned offset box around a slot's anchor (units), used to clamp position nudges. */
export interface OffsetBox {
  min: Vec3
  max: Vec3
}

/**
 * Per-slot position-offset limits (E-transform). Deliberately tight — this is a
 * "nudge for polish" feature, not free placement. Because anchors are fixed and
 * these boxes are small, nonsense placements are impossible by geometry (e.g. the
 * head can never reach the feet). Tune by eye; keep the head-above-feet invariant.
 */
export const SLOT_POSITION_BOUNDS: Record<SlotType, OffsetBox> = {
  head: { min: [-0.2, -0.25, -0.15], max: [0.2, 0.25, 0.15] },
  hair: { min: [-0.12, -0.15, -0.12], max: [0.12, 0.15, 0.12] },
  hat: { min: [-0.12, -0.15, -0.12], max: [0.12, 0.15, 0.12] },
  horns: { min: [-0.12, -0.15, -0.12], max: [0.12, 0.15, 0.12] },
  halo: { min: [-0.12, -0.15, -0.12], max: [0.12, 0.15, 0.12] },
  collar: { min: [-0.12, -0.12, -0.1], max: [0.12, 0.12, 0.1] },
  innerInsert: { min: [-0.12, -0.12, -0.1], max: [0.12, 0.12, 0.1] },
  bodyShell: { min: [-0.1, -0.1, -0.1], max: [0.1, 0.1, 0.1] },
  lowerBody: { min: [-0.1, -0.1, -0.1], max: [0.1, 0.1, 0.1] },
  feetBase: { min: [-0.1, -0.1, -0.1], max: [0.1, 0.1, 0.1] },
  leftHand: { min: [-0.3, -0.25, -0.2], max: [0.3, 0.25, 0.2] },
  rightHand: { min: [-0.3, -0.25, -0.2], max: [0.3, 0.25, 0.2] },
  leftSleeve: { min: [-0.15, -0.15, -0.12], max: [0.15, 0.15, 0.12] },
  rightSleeve: { min: [-0.15, -0.15, -0.12], max: [0.15, 0.15, 0.12] },
  wings: { min: [-0.15, -0.15, -0.15], max: [0.15, 0.15, 0.15] },
  tail: { min: [-0.15, -0.15, -0.15], max: [0.15, 0.15, 0.15] },
}

/** Slots with no parent — rendered at their absolute anchor. */
export const ROOT_SLOTS: SlotType[] = SLOT_TYPES.filter((s) => !SLOT_PARENT[s])

/** Direct children of a slot in the attachment hierarchy. */
export function childrenOf(slot: SlotType): SlotType[] {
  return SLOT_TYPES.filter((s) => SLOT_PARENT[s] === slot)
}

/** A slot's anchor position expressed relative to its parent (absolute if it has no parent). */
export function relativeAnchorPosition(slot: SlotType): Vec3 {
  const a = SLOT_ANCHORS[slot].position
  const parent = SLOT_PARENT[slot]
  if (!parent) return a
  const p = SLOT_ANCHORS[parent].position
  return [a[0] - p[0], a[1] - p[1], a[2] - p[2]]
}

/** A slot's anchor rotation expressed relative to its parent (absolute if it has no parent). */
export function relativeAnchorRotation(slot: SlotType): Vec3 {
  const a = SLOT_ANCHORS[slot].rotation
  const parent = SLOT_PARENT[slot]
  if (!parent) return a
  const p = SLOT_ANCHORS[parent].rotation
  return [a[0] - p[0], a[1] - p[1], a[2] - p[2]]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/scene/__tests__/anchors.test.ts`
Expected: PASS (8 assertions across the two describe blocks).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/modules/scene/anchors.ts src/modules/scene/__tests__/anchors.test.ts
git commit -m "feat(scene): per-slot position bounds + parent-tree anchor helpers"
```

---

### Task 2: Slot-aware clamp metadata + scale-only helper

Two small pure functions that bridge the manifest + the new bounds table. These remove the old `entryConstraints` (which hardcoded `±0.6` position bounds gated on a `mode` flag).

**Files:**
- Create: `src/modules/scene/transformBounds.ts`
- Test: `src/modules/scene/__tests__/transformBounds.test.ts` (create)

**Interfaces:**
- Consumes: `ConstraintMetadata` from `@/lib/constraints`; `AssetManifestEntry` from `@/lib/catalog-types`; `SlotType`, `Transform` from `@/lib/types`; `SLOT_POSITION_BOUNDS` from Task 1.
- Produces:
  - `function slotConstraints(entry: AssetManifestEntry, slotType: SlotType): ConstraintMetadata`
  - `function scaleOnlyTransform(t: Transform): Transform`

- [ ] **Step 1: Write the failing test**

Create `src/modules/scene/__tests__/transformBounds.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { AssetManifestEntry } from '@/lib/catalog-types'
import { slotConstraints, scaleOnlyTransform } from '@/modules/scene/transformBounds'
import { SLOT_POSITION_BOUNDS } from '@/modules/scene/anchors'

const ENTRY: AssetManifestEntry = {
  assetId: 'head-1',
  slotType: 'head',
  displayName: 'Head',
  previewImage: 'p.svg',
  glbFile: 'head.glb',
  textureFormat: 'embedded',
  defaultTransform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 },
  minScale: 0.8,
  maxScale: 1.5,
  minRotation: [-0.3, -Math.PI, -0.3],
  maxRotation: [0.3, Math.PI, 0.3],
  anchorPoint: [0, 0, 0],
  excludes: [],
  dependencies: [],
  fileSizeBytes: 1000,
  triangleCount: 100,
}

describe('slotConstraints', () => {
  it('takes scale + rotation from the manifest and position from the slot table', () => {
    const m = slotConstraints(ENTRY, 'head')
    expect(m.minScale).toBe(0.8)
    expect(m.maxScale).toBe(1.5)
    expect(m.minRotation).toEqual([-0.3, -Math.PI, -0.3])
    expect(m.maxRotation).toEqual([0.3, Math.PI, 0.3])
    expect(m.minPosition).toEqual(SLOT_POSITION_BOUNDS.head.min)
    expect(m.maxPosition).toEqual(SLOT_POSITION_BOUNDS.head.max)
  })
})

describe('scaleOnlyTransform', () => {
  it('zeroes position + rotation and keeps scale', () => {
    expect(
      scaleOnlyTransform({ position: [1, 2, 3], rotation: [0.1, 0.2, 0.3], scale: 1.4 }),
    ).toEqual({ position: [0, 0, 0], rotation: [0, 0, 0], scale: 1.4 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/scene/__tests__/transformBounds.test.ts`
Expected: FAIL — module `transformBounds` does not exist.

- [ ] **Step 3: Implement the module**

Create `src/modules/scene/transformBounds.ts`:

```ts
// Pure helpers bridging manifest constraints + the per-slot position bounds (E-transform).

import type { ConstraintMetadata } from '@/lib/constraints'
import type { AssetManifestEntry } from '@/lib/catalog-types'
import type { SlotType, Transform } from '@/lib/types'
import { SLOT_POSITION_BOUNDS } from '@/modules/scene/anchors'

/**
 * Full clamp envelope for an asset placed in a slot: scale + rotation come from the
 * asset's manifest entry; position-offset bounds come from the slot's role in the doll.
 */
export function slotConstraints(entry: AssetManifestEntry, slotType: SlotType): ConstraintMetadata {
  const box = SLOT_POSITION_BOUNDS[slotType]
  return {
    minScale: entry.minScale,
    maxScale: entry.maxScale,
    minRotation: entry.minRotation,
    maxRotation: entry.maxRotation,
    minPosition: box.min,
    maxPosition: box.max,
  }
}

/**
 * Strip a transform down to its scale. The parent "nudge" group already applies
 * position + rotation, so the mesh itself must only carry scale — and scale must
 * not propagate to child slots.
 */
export function scaleOnlyTransform(t: Transform): Transform {
  return { position: [0, 0, 0], rotation: [0, 0, 0], scale: t.scale }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/scene/__tests__/transformBounds.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/scene/transformBounds.ts src/modules/scene/__tests__/transformBounds.test.ts
git commit -m "feat(scene): slot-aware clamp metadata + scale-only transform helper"
```

---

### Task 3: Recursive parent-aware rendering

Rebuild `SlotMesh` into a recursive `SlotFrame` and point `DollComposition` at the root slots. After this task, moving the head carries hair/hat/horns/halo with it; resizing the head does not balloon them.

**Why no R3F unit test:** the scene components render WebGL via React Three Fiber, which the project does not exercise in jsdom (no existing scene-component tests). The math this task relies on is already unit-tested in Tasks 1–2 (`relativeAnchorPosition`, `scaleOnlyTransform`). This task's automated gate is typecheck + lint + build; visual correctness is the manual check in Step 5.

**Files:**
- Modify: `src/modules/scene/SlotMesh.tsx`
- Modify: `src/modules/scene/DollComposition.tsx`

**Interfaces:**
- Consumes: `relativeAnchorPosition`, `relativeAnchorRotation`, `childrenOf`, `ROOT_SLOTS` (Task 1); `scaleOnlyTransform` (Task 2); `AssetLoader`; `getAssetById` from `@/modules/catalog/useCatalog`; `IDENTITY_TRANSFORM`, `SlotSelection`, `SlotType` from `@/lib/types`; `CatalogManifest` from `@/lib/catalog-types`.
- Produces: `function SlotFrame(props: SlotFrameProps)` exported from `SlotMesh.tsx`, where
  ```ts
  interface SlotFrameProps {
    slotType: SlotType
    selections: SlotSelection[]
    manifest: CatalogManifest | null
    selectedSlot?: SlotType | null
    onSelectSlot?: (slot: SlotType) => void
  }
  ```

- [ ] **Step 1: Rewrite `SlotMesh.tsx` as a recursive frame**

Replace the entire contents of `src/modules/scene/SlotMesh.tsx`:

```tsx
'use client'

import { AssetLoader } from '@/modules/catalog/AssetLoader'
import { getAssetById } from '@/modules/catalog/useCatalog'
import {
  childrenOf,
  relativeAnchorPosition,
  relativeAnchorRotation,
} from '@/modules/scene/anchors'
import { scaleOnlyTransform } from '@/modules/scene/transformBounds'
import { IDENTITY_TRANSFORM, type SlotSelection, type SlotType } from '@/lib/types'
import type { CatalogManifest } from '@/lib/catalog-types'

interface SlotFrameProps {
  slotType: SlotType
  selections: SlotSelection[]
  manifest: CatalogManifest | null
  selectedSlot?: SlotType | null
  onSelectSlot?: (slot: SlotType) => void
}

/** Subtle wireframe box drawn around the selected slot as transform feedback. */
function SelectionHighlight() {
  return (
    <mesh>
      <boxGeometry args={[2.4, 2.4, 2.4]} />
      <meshBasicMaterial color="#f59e0b" wireframe transparent opacity={0.35} />
    </mesh>
  )
}

/**
 * Renders one slot's frame and, nested inside it, its child slots (E-transform).
 *
 * Frame layout (per slot):
 *   <group anchor-relative-to-parent>           // positions this slot's origin
 *     <group user position + rotation>          // the nudge — propagates to children
 *       <AssetLoader scale-only />              // mesh, scaled in isolation (not children)
 *       {children…}                             // inherit parent pos+rot, NOT scale
 *     </group>
 *   </group>
 *
 * Children render regardless of whether the parent slot is filled, so an empty
 * head still positions the hair correctly at its absolute anchor.
 */
export function SlotFrame({
  slotType,
  selections,
  manifest,
  selectedSlot,
  onSelectSlot,
}: SlotFrameProps) {
  const sel = selections.find((s) => s.slotType === slotType)
  const transform = sel?.transform ?? IDENTITY_TRANSFORM
  const assetId = sel?.assetId ?? null
  const glbFile = assetId ? (getAssetById(assetId, manifest)?.glbFile ?? null) : null
  const children = childrenOf(slotType)

  return (
    <group position={relativeAnchorPosition(slotType)} rotation={relativeAnchorRotation(slotType)}>
      <group
        position={transform.position}
        rotation={transform.rotation}
        onClick={
          onSelectSlot
            ? (e) => {
                e.stopPropagation()
                onSelectSlot(slotType)
              }
            : undefined
        }
      >
        {assetId && glbFile ? (
          <AssetLoader url={glbFile} transform={scaleOnlyTransform(transform)} />
        ) : null}
        {selectedSlot === slotType && assetId ? <SelectionHighlight /> : null}
        {children.map((child) => (
          <SlotFrame
            key={child}
            slotType={child}
            selections={selections}
            manifest={manifest}
            selectedSlot={selectedSlot}
            onSelectSlot={onSelectSlot}
          />
        ))}
      </group>
    </group>
  )
}
```

- [ ] **Step 2: Point `DollComposition` at the root slots**

Replace the entire contents of `src/modules/scene/DollComposition.tsx`:

```tsx
'use client'

import { useAppStore } from '@/store'
import { SlotFrame } from '@/modules/scene/SlotMesh'
import { AssetLoader } from '@/modules/catalog/AssetLoader'
import { getAssetById } from '@/modules/catalog/useCatalog'
import { ROOT_SLOTS } from '@/modules/scene/anchors'
import type { CatalogManifest } from '@/lib/catalog-types'
import type { SlotType } from '@/lib/types'

interface DollCompositionProps {
  manifest: CatalogManifest | null
  selectedSlot?: SlotType | null
  onSelectSlot?: (slot: SlotType) => void
  /** Include scene background/foreground (off during slot editing for clarity). */
  showScene?: boolean
}

/**
 * Renders the assembled doll from store state (E6-T3, E-transform): one recursive
 * SlotFrame per root slot (children nest inside their parent), plus optional scene
 * background/foreground. Re-keys by root slotType so changing one slot never
 * disturbs the others.
 */
export function DollComposition({
  manifest,
  selectedSlot,
  onSelectSlot,
  showScene = true,
}: DollCompositionProps) {
  const slotSelections = useAppStore((s) => s.slotSelections)
  const sceneBackground = useAppStore((s) => s.sceneBackground)
  const sceneForeground = useAppStore((s) => s.sceneForeground)

  const bg = showScene && sceneBackground ? getAssetById(sceneBackground, manifest) : undefined
  const fg = showScene && sceneForeground ? getAssetById(sceneForeground, manifest) : undefined

  return (
    <>
      {ROOT_SLOTS.map((slot) => (
        <SlotFrame
          key={slot}
          slotType={slot}
          selections={slotSelections}
          manifest={manifest}
          selectedSlot={selectedSlot}
          onSelectSlot={onSelectSlot}
        />
      ))}
      {bg ? <AssetLoader url={bg.glbFile} transform={bg.defaultTransform} /> : null}
      {fg ? <AssetLoader url={fg.glbFile} transform={fg.defaultTransform} /> : null}
    </>
  )
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors. (If lint flags the now-unused `SLOT_ANCHORS` import in `SlotMesh.tsx`, it was removed in the rewrite — confirm the new import block matches the code above.)

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build succeeds, static export emits (`✓ Exporting`).

- [ ] **Step 5: Manual visual verification**

Run: `npm run dev`, open the editor, and confirm:
- With nothing changed, the doll looks identical to before (no parts shifted).
- Select **Head**, drag **Up/Down** up → the hair/hat move up with the head.
- Drag head **Size** up → the head grows but the hair does **not** grow.
- Hair's own nudge still works and stays within its small box.

Note in the commit message that visual verification passed.

- [ ] **Step 6: Commit**

```bash
git add src/modules/scene/SlotMesh.tsx src/modules/scene/DollComposition.tsx
git commit -m "feat(scene): recursive parent-aware doll rendering (children follow parent, scale isolated)"
```

---

### Task 4: Seven-control Adjust panel + Reset, wired into the editor

Replace `TransformControls`'s two sliders (+ unused `global` mode) with the grouped 7-control panel, clamping via `slotConstraints`, plus a Reset button. Update the single editor caller.

**Files:**
- Modify: `src/modules/scene/TransformControls.tsx`
- Modify: `src/app/editor/page.tsx` (line 141 — remove the `mode` prop)
- Test: `src/modules/scene/__tests__/TransformControls.test.tsx` (create)

**Interfaces:**
- Consumes: `slotConstraints` (Task 2); `SLOT_POSITION_BOUNDS` (Task 1); `useAppStore`; `AssetManifestEntry`; `SlotType`, `Transform` from `@/lib/types`.
- Produces: `TransformControls({ slotType, entry }: { slotType: SlotType; entry: AssetManifestEntry })` — note the `mode` prop is **removed**. Old `entryConstraints` export is **deleted** (no external consumers — verified).

- [ ] **Step 1: Write the failing component test**

Create `src/modules/scene/__tests__/TransformControls.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useAppStore } from '@/store'
import { TransformControls } from '@/modules/scene/TransformControls'
import { SLOT_POSITION_BOUNDS } from '@/modules/scene/anchors'
import { createEmptySlotSelections } from '@/lib/types'
import type { AssetManifestEntry } from '@/lib/catalog-types'

const ENTRY = {
  assetId: 'head-1',
  slotType: 'head',
  displayName: 'Head',
  previewImage: 'p.svg',
  glbFile: 'head.glb',
  textureFormat: 'embedded',
  defaultTransform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 },
  minScale: 0.8,
  maxScale: 1.5,
  minRotation: [-0.3, -Math.PI, -0.3],
  maxRotation: [0.3, Math.PI, 0.3],
  anchorPoint: [0, 0, 0],
  excludes: [],
  dependencies: [],
  fileSizeBytes: 1000,
  triangleCount: 100,
} as unknown as AssetManifestEntry

function headTransform() {
  return useAppStore.getState().slotSelections.find((s) => s.slotType === 'head')!.transform
}

beforeEach(() => {
  // Seed a selected head with a non-default nudge so Reset has something to undo.
  const selections = createEmptySlotSelections().map((s) =>
    s.slotType === 'head'
      ? { ...s, assetId: 'head-1', transform: { position: [0.1, 0.1, 0], rotation: [0, 0.2, 0], scale: 1.2 } }
      : s,
  )
  useAppStore.setState({ slotSelections: selections })
})

describe('TransformControls', () => {
  it('renders all seven controls', () => {
    render(<TransformControls slotType="head" entry={ENTRY} />)
    for (const label of [
      'Left / Right',
      'Up / Down',
      'Forward / Back',
      'Spin',
      'Tilt forward',
      'Tilt sideways',
      'Size',
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument()
    }
  })

  it('clamps an out-of-box position commit to the slot bound', () => {
    render(<TransformControls slotType="head" entry={ENTRY} />)
    // Force a value above head's max Up/Down (0.25).
    fireEvent.change(screen.getByLabelText('Up / Down'), { target: { value: '5' } })
    expect(headTransform().position[1]).toBe(SLOT_POSITION_BOUNDS.head.max[1])
  })

  it('resets the part to its default transform', () => {
    render(<TransformControls slotType="head" entry={ENTRY} />)
    fireEvent.click(screen.getByRole('button', { name: /reset/i }))
    expect(headTransform()).toEqual(ENTRY.defaultTransform)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/scene/__tests__/TransformControls.test.tsx`
Expected: FAIL — current `TransformControls` has no `Forward / Back`, tilt sliders, or Reset; labels don't match.

- [ ] **Step 3: Rewrite `TransformControls.tsx`**

Replace the entire contents of `src/modules/scene/TransformControls.tsx`:

```tsx
'use client'

import { useAppStore } from '@/store'
import { slotConstraints } from '@/modules/scene/transformBounds'
import { SLOT_POSITION_BOUNDS } from '@/modules/scene/anchors'
import type { AssetManifestEntry } from '@/lib/catalog-types'
import type { SlotType, Transform, Vec3 } from '@/lib/types'

interface TransformControlsProps {
  slotType: SlotType
  entry: AssetManifestEntry
}

function Slider({
  label,
  min,
  max,
  value,
  onChange,
}: {
  label: string
  min: number
  max: number
  value: number
  onChange: (v: number) => void
}) {
  return (
    <label className="flex items-center gap-3 text-sm">
      <span className="w-24 shrink-0 text-text-secondary">{label}</span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={0.01}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-6 flex-1 accent-brand-primary"
      />
    </label>
  )
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
      {children}
    </span>
  )
}

/**
 * Constrained 6-DOF + scale sliders for the asset in a slot (E-transform). Position
 * bounds come from the slot's role (SLOT_POSITION_BOUNDS); rotation + scale bounds
 * from the asset manifest. Every commit routes through updateTransform → applyConstraints,
 * so the UI can never persist an out-of-bounds value. Reset restores the asset default.
 */
export function TransformControls({ slotType, entry }: TransformControlsProps) {
  const transform = useAppStore(
    (s) => s.slotSelections.find((x) => x.slotType === slotType)?.transform,
  )
  const updateTransform = useAppStore((s) => s.updateTransform)
  if (!transform) return null

  const metadata = slotConstraints(entry, slotType)
  const box = SLOT_POSITION_BOUNDS[slotType]
  const commit = (next: Transform) => updateTransform(slotType, next, metadata)

  const setPos = (axis: 0 | 1 | 2, v: number) => {
    const position = [...transform.position] as Vec3
    position[axis] = v
    commit({ ...transform, position })
  }
  const setRot = (axis: 0 | 1 | 2, v: number) => {
    const rotation = [...transform.rotation] as Vec3
    rotation[axis] = v
    commit({ ...transform, rotation })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <GroupLabel>Move</GroupLabel>
        <Slider
          label="Left / Right"
          min={box.min[0]}
          max={box.max[0]}
          value={transform.position[0]}
          onChange={(v) => setPos(0, v)}
        />
        <Slider
          label="Up / Down"
          min={box.min[1]}
          max={box.max[1]}
          value={transform.position[1]}
          onChange={(v) => setPos(1, v)}
        />
        <Slider
          label="Forward / Back"
          min={box.min[2]}
          max={box.max[2]}
          value={transform.position[2]}
          onChange={(v) => setPos(2, v)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <GroupLabel>Rotate</GroupLabel>
        <Slider
          label="Spin"
          min={entry.minRotation[1]}
          max={entry.maxRotation[1]}
          value={transform.rotation[1]}
          onChange={(v) => setRot(1, v)}
        />
        <Slider
          label="Tilt forward"
          min={entry.minRotation[0]}
          max={entry.maxRotation[0]}
          value={transform.rotation[0]}
          onChange={(v) => setRot(0, v)}
        />
        <Slider
          label="Tilt sideways"
          min={entry.minRotation[2]}
          max={entry.maxRotation[2]}
          value={transform.rotation[2]}
          onChange={(v) => setRot(2, v)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <GroupLabel>Size</GroupLabel>
        <Slider
          label="Size"
          min={entry.minScale}
          max={entry.maxScale}
          value={transform.scale}
          onChange={(v) => commit({ ...transform, scale: v })}
        />
      </div>

      <button
        type="button"
        onClick={() => commit(entry.defaultTransform)}
        className="self-start text-xs font-semibold uppercase tracking-[0.12em] text-link transition-colors hover:text-brand-primary-hover"
      >
        ↺ Reset part
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Update the editor caller**

In `src/app/editor/page.tsx`, change line ~141 from:

```tsx
              <TransformControls slotType={currentSlot} entry={currentEntry} mode="slot" />
```

to:

```tsx
              <TransformControls slotType={currentSlot} entry={currentEntry} />
```

- [ ] **Step 5: Run the component test to verify it passes**

Run: `npx vitest run src/modules/scene/__tests__/TransformControls.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Run the full suite + typecheck + lint**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: all tests pass (existing 65 + the new tests from Tasks 1, 2, 4), no type or lint errors.

- [ ] **Step 7: Commit**

```bash
git add src/modules/scene/TransformControls.tsx src/app/editor/page.tsx src/modules/scene/__tests__/TransformControls.test.tsx
git commit -m "feat(editor): 6-DOF + size adjust panel with reset, slot-aware clamping"
```

---

## Self-Review

**Spec coverage:**
- §1 Adjust panel (7 grouped controls + Reset) → Task 4. ✓
- §2 rotation/scale from manifest, position from per-slot table → Task 1 (`SLOT_POSITION_BOUNDS`) + Task 2 (`slotConstraints`) + Task 4 (wiring). ✓
- §2 head-can't-reach-feet invariant → Task 1 test. ✓
- §3 parent-following render, relative child anchors, scale isolation → Task 3 (`SlotFrame`, `scaleOnlyTransform`) + Task 2. ✓
- §3 render path uses `DollComposition` → confirmed (`RenderScreen` line 284); no change needed. ✓
- §4 no schema change → Global Constraints; nothing touches `Transform`/persistence. ✓
- §5 files touched → all listed in File Structure and per-task. ✓ (`constraints.ts` correctly NOT modified: it already supports position clamping; "always-on position bounds" is achieved by `slotConstraints` always supplying them.)
- §6 testing (clamp per axis, reset, tree builder, head-nudge-shifts-child) → covered by Tasks 1, 2, 4 unit tests; the head-nudge-shifts-child and no-scale-propagation guarantees are covered structurally by the unit-tested `relativeAnchorPosition` + `scaleOnlyTransform` plus the Task 3 manual check (R3F not unit-tested in this repo — stated explicitly).
- §7 out of scope → none built; `global-adjust` editor mode left untouched. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"/"write tests for the above". All steps show full code or exact commands. ✓

**Type consistency:** `slotConstraints(entry, slotType)`, `scaleOnlyTransform(t)`, `SlotFrame(props)`, `SLOT_POSITION_BOUNDS`, `ROOT_SLOTS`, `childrenOf`, `relativeAnchorPosition`, `relativeAnchorRotation` — names and signatures match across the tasks that define and consume them. `TransformControls` prop change (drop `mode`) is reflected in the only caller (Task 4 Step 4). Old `entryConstraints` removed with no remaining consumers (verified by grep). Slider labels in the component (`Left / Right`, `Up / Down`, `Forward / Back`, `Spin`, `Tilt forward`, `Tilt sideways`, `Size`) match the test's `getByLabelText` queries. ✓
