# Bounded move & rotate for doll parts — design

**Date:** 2026-06-27
**Status:** Approved (design); ready for implementation plan
**Area:** Frontend editor (`webapp-1`), 3D composition + transform controls

## Goal

Let users **move and rotate each doll part within tight, tasteful limits** — enough
to personalize a pose ("cock the head", "nudge the hat") but never enough to break
the doll. The constraints must make nonsense impossible by construction: the head
can't be placed below the feet, hair can't drift away from the head.

This is a "nudge for polish" feature, not free placement. Ranges are deliberately
small.

## Current state (what already exists)

- **Bounded transforms are already architected.** Every slot selection stores a
  `Transform { position: Vec3, rotation: Vec3, scale: number }`, and *all* edits
  funnel through one clamp layer — `applyConstraints` in `src/lib/constraints.ts`,
  applied inside the `updateTransform` store action. Out-of-bounds values cannot be
  persisted.
- **Users only get two sliders today:** *Rotate* (Y-axis only) and *Size*, rendered
  inline per slot by `TransformControls` (`mode="slot"`).
- **Position editing exists in code but is never surfaced.** `TransformControls`
  has a `mode="global"` branch with Left/Right + Up/Down sliders, but the editor
  only ever invokes `mode="slot"`. That branch also uses a uniform hardcoded
  `±0.6` box for every part and has no depth (Z) axis.
- **Parts render independently.** Each slot renders flat at an absolute anchor
  (`SLOT_ANCHORS` in `src/modules/scene/anchors.ts`). A `SLOT_PARENT` map
  (`hair→head`, `hat→head`, `horns→head`, `halo→head`, `collar→bodyShell`,
  `innerInsert→bodyShell`) exists but is **unused** — moving the head leaves the
  hair behind.
- **Rotation bounds for all three axes already live in the manifest.** Each asset
  carries `minRotation [-0.3, -π, -0.3]` / `maxRotation [0.3, π, 0.3]`
  (±~17° tilt on X and Z, full spin on Y) and `minScale`/`maxScale`. Only the Y
  slider is currently shown.

So the feature is ~40% built structurally: the clamp layer and the data model are
done; what's missing is exposing the axes, tuning per-part position bounds, and
activating parenting.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Interaction model | **Panel sliders** (extend existing `TransformControls`) | Lowest risk; reuses the clamp layer; reliable on mobile Safari. Direct 3D drag/gizmo is deferred. |
| Constraint model | **Parts follow their parent** (activate `SLOT_PARENT`) | Children render relative to their parent, so a child can never drift from its parent and a parent move carries its children along. |
| Degrees of freedom | **Full 3D (6-DOF) + size** = 7 controls | 3 position (L/R, U/D, Fwd/Back) + 3 rotation (spin Y, tilt X, tilt Z) + size. Maximum expressiveness; mitigated with grouping (see UI). |
| Placement in flow | **Inline per slot step** | The panel already renders inline today; no new editor mode needed; smallest scope. |
| Position-bound storage | **Per-slot-type table co-located with `SLOT_ANCHORS`** | Position offset limits describe a part's *role in the doll*, not a specific mesh. Rotation/scale bounds stay per-asset in the manifest. |
| Scale propagation to children | **No** — children inherit parent position + rotation only | Resizing the head must not balloon the hair. |

## Detailed design

### 1. UI — the Adjust panel

Below the part catalog in each slot step, render 7 controls in three labeled
clusters so they don't read as a wall of sliders:

```
── Move ──              ── Rotate ──          ── Size ──
Left / Right   ──O──    Spin    ───O──        Size  ──O──
Up / Down      ──O──    Tilt ↕  ──O───        [↺ Reset part]
Forward / Back ─O───    Tilt ↻  ──O───
```

- Each slider's `min`/`max` is the part's bound on that axis, so the thumb **cannot
  travel anywhere illegal** — the limit is the track itself, never a validation
  error or a snap-back.
- **Reset part** button restores the selected part to its `defaultTransform`
  (anchor identity).
- Styling follows the `linden_tar` system already used across the editor
  (`accent-brand-primary` ranges, porcelain labels, uppercase cluster headings).
- Reduced-motion and keyboard focus already covered by the global base styles;
  sliders are native `<input type="range">` so they are keyboard-accessible.

### 2. Constraint model — where bounds come from

- **Rotation + scale:** unchanged. Read per-asset from the manifest
  (`minRotation`/`maxRotation` for all three axes, `minScale`/`maxScale`). The X
  and Z tilt sliders simply expose values that already exist.
- **Position:** new per-slot-type table, `SLOT_POSITION_BOUNDS`, co-located with
  `SLOT_ANCHORS` in `anchors.ts`. Each entry is an offset box around the anchor.
  Initial tuning (final values tuned by eye during implementation):

  | Slot | L/R (x) | Up/Down (y) | Fwd/Back (z) |
  |---|---|---|---|
  | head | ±0.20 | ±0.25 | ±0.15 |
  | hair / hat / horns / halo (children of head) | ±0.12 | ±0.15 | ±0.12 |
  | collar / innerInsert (children of body) | ±0.12 | ±0.12 | ±0.10 |
  | leftHand / rightHand | ±0.30 | ±0.25 | ±0.20 |
  | leftSleeve / rightSleeve | ±0.15 | ±0.15 | ±0.12 |
  | bodyShell / lowerBody / feetBase | ±0.10 | ±0.10 | ±0.10 |
  | wings / tail | ±0.15 | ±0.15 | ±0.15 |

  Because the head's box (`y = 2.2 ± 0.25`) cannot reach the feet anchor
  (`y = −2.1`), **"head below feet" is impossible by geometry** — no special rule
  required. All position edits flow through the existing `clampPosition` /
  `applyConstraints`.

### 3. Rendering — parts follow their parent

Rebuild `DollComposition` + `SlotMesh` into a small **recursive frame renderer**
driven by `SLOT_PARENT`:

- Build a tree: roots (head, bodyShell, hands, etc.) and their children
  (hair/hat/horns/halo under head; collar/innerInsert under body).
- **Roots** render at their absolute `SLOT_ANCHORS` position.
- **Children** render nested *inside the parent's transform group*, with their
  anchor expressed **relative to the parent's anchor** (`childAnchor − parentAnchor`).
  Consequence: with zero nudges nothing moves visually, but the parent's position +
  rotation nudge now propagates to children. Hair can never drift from the head.
- **Scale is isolated:** the parent's scale applies only to the parent's own mesh,
  not to the child group. Children inherit parent **position + rotation only**.

Per-slot frame shape:

```
<group position={anchorRelativeToParent}>          // anchor frame
  <group position={nudge.position} rotation={nudge.rotation}>   // user nudge (pos+rot)
    <AssetLoader … scale={nudge.scale} />           // mesh, scaled in isolation
    {children…}                                     // nested child frames
  </group>
</group>
```

**Implementation checkpoint:** the video render path must compose through this same
tree. Confirm `RenderScreen` renders via `DollComposition` (or refactor it to do
so) so exported video matches the live preview.

### 4. Data & persistence

**No schema change.** `Transform` already carries a full position `Vec3` and
rotation `Vec3`; these are already autosaved to IndexedDB and synced. The feature
only *uses* fields that already persist, so existing drafts remain valid and
re-open with their nudges intact.

## Files touched

- `src/modules/scene/anchors.ts` — add `SLOT_POSITION_BOUNDS`; add a parent-tree
  builder helper (roots + children from `SLOT_PARENT`) and a relative-anchor
  helper.
- `src/modules/scene/DollComposition.tsx` — recursive, parent-aware rendering.
- `src/modules/scene/SlotMesh.tsx` — render a single frame (anchor → nudge → mesh)
  and its nested children; isolate scale from children.
- `src/modules/scene/TransformControls.tsx` — 7 grouped sliders + Reset; position
  bounds from `SLOT_POSITION_BOUNDS`, rotation/scale from the manifest; collapse
  the `slot`/`global` mode split into one always-on combined panel.
- `src/lib/constraints.ts` — position clamp already exists; make position bounds
  always applied (not gated on `mode="global"`).
- `src/app/editor/page.tsx` — `TransformControls` already renders inline; point it
  at the new combined mode.

## Testing

**Unit (extend `src/lib/__tests__/constraints.test.ts` and store tests):**
- `clampPosition` rejects out-of-box values on each of X/Y/Z independently.
- A reset returns a part to its `defaultTransform`.
- Parent-tree builder produces correct relative offsets; at zero nudge a child's
  world position equals its original absolute anchor.
- A head position nudge shifts a child's world position by the same delta; a head
  *scale* change does **not** change the child's world scale.

**Manual:**
- Nudge the head → hair/hat/horns/halo follow.
- Each slider bottoms out exactly at its box edge with no snap-back.
- Reset restores the part.
- Save a draft, reload, re-open → nudges persist.
- Exported video matches the adjusted preview.

## Out of scope (YAGNI)

- Direct 3D drag / gizmo manipulation.
- A dedicated whole-doll "adjust pass" / global-adjust mode (tap any part on the
  assembled doll). The inline-per-step panel covers the need for now.
- Per-asset (rather than per-slot) position bounds.
- Physics / collision between parts.

## Risks

- **7 sliders on a small screen.** Mitigated by clustering (Move / Rotate / Size)
  and tight ranges; revisit if it feels cramped on an iPhone SE.
- **Parenting refactor touches the render path.** `DollComposition`/`SlotMesh` are
  central; the recursive rewrite must preserve the existing re-key-by-slot behavior
  (changing one slot never disturbs others) and the selection highlight.
- **Scale-isolation correctness.** Nesting in three.js propagates scale by default;
  the isolation (mesh-only scale) must be verified visually, not just in unit math.
