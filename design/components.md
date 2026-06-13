# Component Spec — linden_tar

Written spec for the core UI primitives, their states, and which tokens they use. All values
reference [`tokens/tokens.css`](tokens/tokens.css). Dark-first, mobile-first. **Minimum tap target
is 44×44px (`--tap-min`)** for every interactive element. Honor `prefers-reduced-motion`.

Token shorthand below: `bg` = `--color-bg`, `surface` = `--color-surface`, `text` =
`--color-text`, `primary` = `--color-primary` (crimson), etc.

---

## Buttons

Shape: pill (`--radius-pill`), min-height `--tap-min`, `--font-body` `--fw-semibold`,
`--fs-body-md`. Press: `transform: translateY(1px) scale(.99)` over `--dur-fast`. Focus-visible:
2px ring in `--color-primary-ring` (offset 2px) on every variant.

### Primary (crimson) — the one call to action
Use once per screen for the consequential action (Begin, Continue, Unlock, Export). Never two
primary buttons competing.

| State | Tokens |
|-------|--------|
| Default | fill `linear-gradient(180deg, crimson-500, crimson-600)`, text `--color-text-on-crimson`, shadow `--glow-crimson` + `--shadow-glaze` |
| Hover | fill `linear-gradient(180deg, crimson-400, crimson-500)` |
| Active | fill `--color-primary-active` (`crimson-600`), translateY(1px) |
| Focus | + ring `--color-primary-ring` |
| Disabled | fill `--ink-700`, text `--color-text-faint`, no shadow, `cursor: not-allowed`, opacity unchanged (don't fade — desaturate) |
| Loading | text → centered spinner (1.2px ring, `currentColor`, top transparent), keep width |

### Secondary / ghost
Bordered, transparent fill — for "Skip", "Wander first", "Back".
- Default: `transparent`, text `--color-text-secondary`, 1px `--color-border`, `--shadow-glaze`.
- Hover: border `--color-border-glaze`, text `--color-text`.
- Active: bg `--color-surface`.

### Text / quiet
No border/fill — "Restore purchase", "Skip for now".
- Default text `--color-text-muted`; hover `--color-text-secondary`. Underline only on hover.

### Icon button
44×44, pill, 1px `--color-border`, bg `--color-surface`, icon `--color-text-secondary`,
`--shadow-glaze`. Hover border `--color-border-glaze`. Used for back/save/close in headers.

---

## Cards / Surfaces

Base card: bg `--color-surface`, 1px `--color-border`, `--radius-lg`, `--shadow-md` +
`--shadow-glaze` (the inset top porcelain edge is what makes it read as "ceramic, lit from above").
Optional film-grain overlay (`.tex-grain` / inline SVG noise at ~4–5% `overlay`) to break flat
fields.

- **Raised card** — content containers, offer card. As above.
- **Inset / well** — bg `--color-bg-subtle`, inner shadow, no glaze edge. For the 3D stage and
  recessed regions.
- **Hover (interactive cards)** — border → `--color-border-glaze`, `translateY(-2px)` over
  `--dur-base` `--ease-standard`.

### Slot catalog tile (`SlotTile`)
Square (`aspect-ratio:1`), `--radius-md`, bg `--color-surface-overlay` with a faint radial
porcelain highlight top-center. Shows a part preview (3D thumbnail / `placehold.co`) + uppercase
`label-sm` name at the base.

| State | Treatment |
|-------|-----------|
| Default | 1px `--color-border`, `--shadow-glaze` |
| Hover | border `--color-border-glaze`, `translateY(-2px)` |
| **Selected** | border `--color-accent-verdigris` + 1px verdigris ring; ✓ badge top-right filled `--color-accent-verdigris` with `--ink-950` glyph |
| **Locked / premium** | preview `grayscale(.4) brightness(.7)`, ember `♦` glyph top-right, name `--color-text-faint`; tapping opens the paywall |
| Disabled (incompatible) | opacity 0.4, no pointer, optional small "—" |

Selection uses **verdigris (glaze-green)**, never crimson — crimson is reserved for actions.

---

## Modal / Bottom Sheet

Mobile pattern is a **bottom sheet** rising from the base (paywall, confirmations, music picker).

- **Scrim**: `--color-scrim` (`rgba(7,6,5,.72)`) + optional `backdrop-filter: blur(3px)`. Fades in
  over `--dur-base`. Tap scrim or the close (×) icon button to dismiss.
- **Sheet**: bg `linear-gradient(180deg, surface, ink-900)`, top corners `--radius-xl`, top edge
  1px `--color-border-glaze`, `box-shadow: 0 -28px 60px -20px #000`. A soft crimson glow at the top
  edge (`radial-gradient` of `crimson` at low alpha) for moments of consequence (paywall). Rises
  with `translateY(40px)→0` + fade over `--dur-slow` `--ease-emphasis`, `transform-origin: bottom`.
- **Grab handle**: 42×4px pill `--ink-600`, centered, top.
- **Structure**: optional `eyebrow` (ember uppercase `label`) → serif `display-xl/md` title (italic
  emphasis allowed) → `body-md` `--color-text-secondary` subtext → content → primary button →
  text button → fine print (`body-sm` `--color-text-faint`, links `--color-link`).
- **A11y**: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` the title; focus trap; `Esc`
  closes; restore focus to trigger on close.

Centered dialog variant (desktop / destructive confirm): same surface, `--radius-lg`, centered,
max-width ~`min(92vw, 380px)`, `--shadow-lg`.

---

## Inputs

Phase 1 is guest-only with few forms (mainly the optional email for purchase restore), but specify
for consistency.

- **Text field**: bg `--color-surface-overlay`, 1px `--color-border`, `--radius-md`, min-height
  `--tap-min`, padding `--space-3 --space-4`, text `--color-text`, `--font-body` `--fs-body-md`.
  Placeholder `--color-text-faint`.
- **Label**: `label` style (uppercase, tracked `--tracking-wider`, `--color-text-muted`) above the
  field, `--space-2` gap.
- **Focus**: border `--color-border-focus` (`crimson-400`) + 3px ring `--color-primary-ring`.
- **Error**: border `--color-danger`, helper text `--color-danger` `--fs-body-sm` below; error
  message announced via `aria-live="polite"`, field gets `aria-invalid`.
- **Success**: border `--color-accent-verdigris`.
- **Disabled**: bg `--ink-800`, text `--color-text-faint`, no pointer.
- **Helper text**: `--fs-body-sm` `--color-text-muted` below the field.

---

## Navigation & progress

### Header bar
Three-zone flex: leading icon button (back) · centered title block (mono `step` counter in
`--color-accent-ember` + serif `display-md` title) · trailing icon button (save/close). Padding
`--space-4`, transparent over the page bg. No heavy bar fill.

### Step dots (`StepDots`)
Horizontal row, `--space-2` gap, centered. One per assembly step (Phase 1: 6 steps).
- Upcoming: 7px circle `--ink-600`.
- Done: 7px circle `--color-accent-clay`.
- **Active**: 7px → 26px pill `--crimson-500` + 4px `--color-primary-subtle` halo; width animates
  over `--dur-base` `--ease-standard`.
Provide an `aria-label` ("Step 2 of 6") on the container; dots are decorative.

### Bottom action bar (editor)
Fixed to sheet base, `--space-4` padding + `env(safe-area-inset-bottom)`, fades from transparent to
`--ink-950`. Typically `[ Secondary "Skip" ] [ Primary "Continue · Next →" (flex:1) ]`.

---

## Badges, chips, tags

- **Spec / mono tag** ("vitrine · live", resolution): `--font-mono` `--fs-mono-sm`,
  `--color-text-faint`, 1px `--color-border`, pill, padding `4px 9px`.
- **Promo tag** ("one-time"): filled `--color-accent-ember`, glyph color `--ink-950`, `label-sm`
  uppercase, `--fw-bold`, small radius — high emphasis, use sparingly.
- **Selected chip / soft badge**: `--color-primary-subtle` (or `--color-accent-verdigris-subtle`)
  fill, matching-color text, pill.
- **Status dot**: 7px circle in `--color-success` / `--color-warning` / `--color-danger`.

---

## Motion summary

| Moment | Animation | Token |
|--------|-----------|-------|
| Page/section load | staggered rise + fade (`translateY(14px)→0`) | `--dur-veil` `--ease-emphasis`, delays 50–700ms |
| Vitrine glass sweep | slow diagonal highlight sweep, looped | ~7s `--ease-standard` |
| Doll idle | gentle float/breathe (±7–10px) | ~6s loop |
| Doll render | 360° turn on base | render duration (~10s) |
| Selection halo | soft dashed verdigris pulse | ~2.4s ease-in-out |
| Button press | `translateY(1px) scale(.99)` | `--dur-fast` |
| Sheet open | rise + fade from bottom | `--dur-slow` `--ease-emphasis` |
| Step-dot change | width/color tween | `--dur-base` `--ease-standard` |

All of the above must collapse to instant under `prefers-reduced-motion: reduce` (handled globally
in `tokens.css`). No springy/bouncy easing anywhere — the tone is calm and slightly slow.
