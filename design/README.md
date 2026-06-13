# linden_tar — Design Language

> A tribute to the ceramic work of **Olga Grechanova** ([@linden_tar](https://instagram.com/linden_tar)).
> The Music Box Doll Builder lets people assemble a porcelain doll from her vocabulary of forms,
> set it turning inside a music box, and keep the short film it leaves behind.

These are **design templates pending sign-off** — a visual language, tokens, and static screen
mockups. Wiring them into the live app (Tailwind config + `globals.css` in `webapp-1/src`) is a
deliberate follow-up, not done here. Nothing under `webapp-1/` has been touched.

---

## 1. Brand premise

The entire app is devoted to one artist. Olga Grechanova works in *"ceramics, gypsum, and found
objects, focused on the human psyche."* Her dolls are fragile, glazed, sometimes cracked or melting,
and quietly unsettling — extra eyes, hands over faces, distorted features — staged in dim galleries
and vitrines like specimens. The product should feel like **handling one of her pieces in a darkened
room**: hushed, reverent, a little uneasy, never cute.

This is the opposite of a candy-colored toy builder. It is a **gallery, after hours.**

### Mood keywords
`porcelain` · `vitrine` · `melancholic` · `fairy-tale-horror` · `dim gallery light` · `crack &
glaze` · `antique serif` · `hushed`

### Design principles
1. **The gallery is dark; the porcelain glows.** Warm near-black grounds everything. Light is
   scarce and pointed, like a single overhead lamp on a specimen. Brightness is earned by the doll
   and the one crimson action, never spent on chrome.
2. **One loud color, used like blood.** Crimson is the cloak and the glazed lip — reserve it almost
   exclusively for the primary action and for moments of consequence. Everything else is bone, clay,
   and shadow. A second color anywhere on screen is a mistake unless it carries meaning.
3. **Refined, antique, literary.** Type carries the elegance. A high-contrast old-style serif for
   anything expressive; a calm sans that recedes for UI. Wide-tracked uppercase labels read like
   museum wall text.
4. **Beautiful unease, never broken UX.** Hairline cracks, melted edges, a doll that floats and an
   off-eye are welcome. Illegible text, mystery-meat icons, and sub-44px targets are not. The
   discomfort is aesthetic, never functional.
5. **Restrained motion.** Things drift, breathe, and reveal slowly — a vitrine light sweeping glass,
   a doll turning on its base. No bouncy, springy, "fun" motion. Honor `prefers-reduced-motion`.

---

## 2. Color palette

Dark-first. Backgrounds are **warm** near-black (a faint clay cast, never pure `#000`); whites are
**gypsum/bone**, never `#FFF`. Full token set in [`tokens/colors.json`](tokens/colors.json) and
[`tokens/tokens.css`](tokens/tokens.css).

### Semantic roles

| Role | Token | Hex | Use |
|------|-------|-----|-----|
| Background (base) | `--color-bg-base` | `#0B0907` | Outermost page / behind the app frame |
| Background (app) | `--color-bg` | `#12100D` | The gallery floor — primary canvas |
| Background (subtle) | `--color-bg-subtle` | `#1B1814` | Inset regions, scene backdrop |
| Surface (raised) | `--color-surface` | `#1B1814` | Cards, sheets, catalog tiles, panels |
| Surface (overlay) | `--color-surface-overlay` | `#26211B` | Modals, popovers, pressed tiles |
| Scrim | `--color-scrim` | `rgba(7,6,5,.72)` | Dim behind modals |
| Border (hairline) | `--color-border` | `#352E26` | 1px borders, dividers |
| Border (glaze) | `--color-border-glaze` | `rgba(246,241,233,.14)` | Porcelain top-edge highlight, vitrine frame |
| Text (primary) | `--color-text` | `#F6F1E9` | Body — warm bone white |
| Text (heading) | `--color-text-heading` | `#EBE3D7` | Display / headings |
| Text (secondary) | `--color-text-secondary` | `#D6CBBA` | Secondary copy |
| Text (muted) | `--color-text-muted` | `#B6A992` | Captions, labels |
| Text (faint) | `--color-text-faint` | `#8C7F6B` | Placeholder / disabled / non-essential |
| **Primary (crimson)** | `--color-primary` | `#A11D2C` | The one CTA — Begin, Continue, Unlock, Export |
| Primary hover | `--color-primary-hover` | `#C03A4A` | — |
| Primary active | `--color-primary-active` | `#841421` | — |
| Accent — ember | `--color-accent-ember` | `#C9743C` | Burnt-orange: warm highlight, eyebrows, warnings |
| Accent — verdigris | `--color-accent-verdigris` | `#5C8270` | Ceramic-green glaze: selected / success |
| Accent — clay | `--color-accent-clay` | `#A8835F` | Neutral warm: progress fill |
| State — danger | `--color-danger` | `#A11D2C` | Destructive / error (shares crimson) |

### Raw scales
`ink` 950→500 (warm near-blacks), `porcelain` 50→400 (gypsum/bone), `crimson` 300→700,
`ember` 300→500 (burnt-orange), `verdigris` 300→500 (ceramic-green), `clay` 300→400.

### Accessibility notes (text on `#12100D` app background)
All contrast ratios are against the primary app background unless noted.

- Primary `#F6F1E9` ≈ **13.4:1** — AAA.
- Heading `#EBE3D7` ≈ **12.0:1** — AAA.
- Secondary `#D6CBBA` ≈ **9.6:1** — AAA.
- Muted `#B6A992` ≈ **6.6:1** — AA for all text, AAA for large.
- Faint `#8C7F6B` ≈ **3.9:1** — passes AA for **large text (≥24px / ≥19px bold) and non-essential
  decoration only**. Do not use for small essential body copy.
- Text on crimson CTA: `#F6F1E9` on `#A11D2C` ≈ **6.3:1** — AA (incl. small text).
- Inline link `#D9596A` on app bg ≈ **4.9:1** — AA.

Do not place crimson `#A11D2C` text directly on the dark background for body copy (≈ 3:1 — fails);
crimson is a **fill** color (buttons), with text rendered on top of it. Use `crimson-300` for
inline links instead.

> Contrast values are computed estimates for design guidance; **re-verify with an automated checker
> (e.g. axe / Lighthouse) once wired into the app**, since final rendering and any opacity layering
> can shift effective contrast.

---

## 3. Typography

Echoing the **antique, high-contrast literary serif** of Olga's exhibition posters
(*"a goodnight kiss from the inhabitants of the inner forest"*), paired with a quiet workhorse sans
so the UI never competes with the serif.

| Role | Family | Why |
|------|--------|-----|
| **Display / headings** | **Fraunces** (variable, `opsz` 9–144, `wght` 300–600, italic) | A high-contrast old-style serif with optical sizing and a soft, slightly *uncanny* character — exactly the antique-but-alive tone of the posters. The 144 optical size gives dramatic thick/thin strokes at hero scale; the italic is poetic and a little eerie for captions/epigraphs. |
| **Body / UI** | **Mulish** (300–700, italic 400) | A clean, low-contrast humanist sans that recedes behind the serif. Deliberately **not** Inter/Roboto — Mulish runs a touch narrower and warmer, good for dense mobile UI without shouting. |
| **Numerals / technical** | **IBM Plex Mono** (400/500) | Step counters, price, export resolution, "vitrine · live" badges — gives them a quiet specimen-label precision. |

All three are free and on Google Fonts.

```html
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..600;1,9..144,300..500&family=Mulish:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />
```

Fallback alternates if Fraunces is ever dropped: **Cormorant Garamond** or **EB Garamond** (both
high-contrast literary serifs). Full type scale, line-heights, tracking in
[`tokens/typography.json`](tokens/typography.json).

### Type scale (mobile-first, root 16px)
`display-2xl` 52px / `display-xl` 40px / `display-lg` 30px / `display-md` 24px /
`serif-italic` 18px italic / `body-lg` 17px / `body-md` 15px / `body-sm` 13px /
`label` 12px uppercase tracked `0.16em` / `mono-sm` 12px. Display uses tight leading (~1.04) and
negative tracking; body uses generous leading (1.6). Uppercase labels carry the "museum wall text"
voice.

---

## 4. The dolls & the 3D scene

The 3D stage is the emotional center. It should read as **a single specimen under glass, lit from
above in a dark room.**

- **Material — gypsum / porcelain.** Base albedo is warm bone (`--stage-gypsum` `#EBE3D7`). Slightly
  rough, subsurface-soft, NOT glossy plastic. Glazed parts (lips, brows, painted accents) get a
  tighter, wetter highlight in crimson / ember / verdigris. Welcome the artist's signatures:
  hairline cracks, a faint seam, a melted edge, an off-register eye.
- **Lighting — dim gallery.** One soft, warm key from high front (`--stage-spotlight`, a faint
  radial top-center glow) and a cool, very dim fill. A subtle warm **rim light** (`--stage-rim`
  ember) grazes the silhouette so the doll separates from the near-black floor. Keep overall
  exposure low — the doll should feel *found*, not spotlit on a stage.
- **Vitrine framing.** The stage sits in a rounded container with a hairline `border-glaze` top edge
  and deep inner shadow at the base — the impression of glass and a plinth. An occasional slow
  diagonal **glass-reflection sweep** sells "behind glass" (see `landing.html`). The floor
  (`--stage-floor` `#0E0C0A`) is darker than the surrounding UI so the doll sits *in* a case, not
  *on* the page.
- **Motion.** The doll **floats/breathes** gently and, during render, **turns on its base** (the
  360° export rotation). Selection is shown by a soft dashed verdigris **halo** around the active
  slot, not a hard outline. Nothing snaps or bounces.

The HTML mockups fake the doll with layered CSS shapes purely to communicate proportion, palette,
and mood — the real thing is R3F/Three.js per `webapp-1/CLAUDE.md`. **Never hotlink the artist's
photographs**; ship original 3D forms and CSS/`placehold.co` placeholders only.

---

## 5. What's in this folder

```
design/
  README.md                 ← you are here (brand + design language)
  components.md             ← component spec: states + token usage
  tokens/
    colors.json             ← color tokens (raw scales + semantic), hex + usage + a11y notes
    typography.json         ← families, fluid scale, weights, tracking, leading
    tokens.css              ← all tokens as :root CSS custom properties (drop-in)
    tailwind.theme.cjs       ← Tailwind theme extension (+ a v4 @theme snippet)
  templates/
    landing.html            ← animated landing / vitrine hero
    editor.html             ← slot-based doll editor (stage + catalog + step dots)
    paywall.html            ← "unlock more films" paywall sheet
```

Open any HTML file directly in a browser — they are self-contained, load fonts from Google Fonts,
and link `../tokens/tokens.css`. Built mobile-first inside a ~430px frame; presentable on desktop.

---

## 6. How to adopt (follow-up, not done here)

These are **templates pending sign-off**. When approved, wiring is roughly:

1. Copy the `:root` block from `tokens/tokens.css` into `webapp-1/src/app/globals.css` (or `@import`
   it), and load the three font families via `next/font/google` (Fraunces, Mulish, IBM Plex Mono).
2. Adopt the palette/fonts in Tailwind. The app uses **Tailwind v4** — prefer the CSS-first
   `@theme` snippet exported from `tokens/tailwind.theme.cjs` (`tailwindV4Theme`), referencing the
   `tokens.css` variables for the full semantic set. The CJS `theme` object is provided for tooling
   or a v3 fallback.
3. Translate the HTML mockups into React components (`Button`, `Card`, `Sheet`, `SlotTile`,
   `StepDots`, `Stage` wrapper) following `components.md`. Map crimson → primary, verdigris →
   selected/success, ember → warning/accent.
4. Verify contrast and tap targets with Lighthouse/axe on real devices, and confirm
   `prefers-reduced-motion` disables the float/sweep/sweep animations.

> Open question for sign-off: confirm the **product name / wordmark** (using `linden_tar` as the
> brand mark and "Music Box Doll Builder" as the descriptor), and the **pricing string** shown in
> the paywall mockup (`$6.99` one-time) is a placeholder.
