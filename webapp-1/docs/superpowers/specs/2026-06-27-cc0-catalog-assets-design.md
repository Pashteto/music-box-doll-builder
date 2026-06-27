# CC0 Catalog Assets — Replace Primitive Placeholders with Real Models

**Date:** 2026-06-27
**Status:** Design (pending user review)
**Area:** `webapp-1` frontend catalog / 3D assets

## Problem

Every doll part and scene object in the catalog is currently a flat-colored
Three.js primitive. `scripts/gen-placeholder-assets.mjs` maps each `assetId` to
one of `sphere | box | flatbox | cone | cylinder | torus | plane`, serializes it
to a tiny GLB (1.6–20.8 KB), writes an SVG initials thumbnail, and emits
`public/catalog/manifest.json`. The result reads as "simple geometric figures":
heads are spheres, hair is a torus, dresses are cones, wings are flat boxes.

We want the catalog populated with real, recognizable 3D models while keeping the
existing slot/anchor/constraint system intact.

## Decisions (locked with user)

- **Scope:** Full set — all ~14 doll-part slot assets + 3 props + background +
  foreground, aiming for a single coherent visual theme.
- **License:** **CC0 / public-domain only.** No CC-BY, no attribution-required
  assets. Every shipped model gets recorded provenance.
- **Source path:** **No-key.** Download whole CC0 packs directly from
  `kenney.nl` and `quaternius.com` (no account, no API key), extract the
  individual GLBs that map to slots, and normalize them. (Poly Pizza API path was
  rejected because it requires a signup-gated key.)

## Core Constraint & Strategy

The catalog's body-part slots are *decomposed* parts placed at fixed anchors
(head at y=2.2, body at y=0.2, feet at y=-2.1; hair parents to head). Most CC0
packs ship *whole* objects, not doll sub-parts. Therefore:

| Slot group | Source strategy | Confidence |
|---|---|---|
| Props (`prop-star`, `prop-note`, `prop-flower`) | Standalone CC0 models map 1:1 | High |
| Scene (`bg-music-box`, `fg-curtain`) | Standalone decoration/furniture models | Medium |
| Hair (`hair-*`) | Quaternius *Universal Base Characters* — 20 standalone hairstyle meshes (CC0) | Medium-High |
| Body / dress (`body-*`), feet (`feet-*`) | Quaternius *Modular Character Outfits* — 62 separate parts (CC0) | Medium |
| Head (`head-*`), wings (`wings-*`) | Hardest — no clean standalone CC0 mesh expected | Low |

**Fallback rule:** any slot with no acceptable CC0 match **keeps its current
procedural placeholder**, and that fact is logged + recorded in provenance. We do
not ship a mismatched or low-quality model just to fill a slot. The end state is
"as many slots as cleanly possible replaced," not "100% replaced at any cost."

This is a **discover → map → normalize → regenerate** pipeline, not a blind
download. We inventory what the packs actually contain before committing mappings.

## Architecture

Nothing in the runtime app changes. The manifest schema
(`src/lib/catalog-types.ts`), anchors (`src/modules/scene/anchors.ts`), loader
(`AssetLoader.tsx`), and slot system are untouched. We only change **what bytes
live at each `glbFile` path** and the **accurate metadata** (`triangleCount`,
`fileSizeBytes`) in the manifest.

### New / changed files

```
webapp-1/
  scripts/
    gen-placeholder-assets.mjs     # KEEP — still the fallback generator
    fetch-cc0-assets.mjs           # NEW — download + extract packs to vendor dir
    normalize-asset.mjs            # NEW — recenter/rescale/orient one GLB to a slot
    build-catalog.mjs              # NEW — orchestrates: real-or-fallback per slot,
                                   #       writes models + manifest + provenance
  assets-src/                      # NEW, gitignored — downloaded pack ZIPs + extracted GLBs
    .gitignore
  public/assets/models/*.glb       # OVERWRITTEN with normalized real models (or fallback)
  public/assets/previews/*.svg     # KEEP svg for now (real thumbnails are a later step)
  public/catalog/manifest.json     # REGENERATED with accurate metadata
  docs/catalog/ASSET-PROVENANCE.md # NEW — per-asset source URL, creator, license, pack
```

### Pipeline stages

1. **Fetch** (`fetch-cc0-assets.mjs`): download a fixed allow-list of CC0 pack
   ZIPs (exact URLs resolved during implementation and pinned in the script) into
   `assets-src/`, verify each pack's license is CC0 before extracting, unzip, and
   print an inventory of every `.glb`/`.gltf` found with its tri count + bbox.
   ZIP URLs and SHA-256 of each download are recorded so the fetch is reproducible.

2. **Map** (a hand-authored table in `build-catalog.mjs`): for each `assetId`,
   either a `{ pack, file, transform }` real-asset mapping or `{ fallback: true }`.
   The mapping is decided by a human reading the stage-1 inventory, not guessed.

3. **Normalize** (`normalize-asset.mjs`, uses `@gltf-transform/core` +
   `@gltf-transform/functions`): for a mapped GLB — drop animations/rigs/cameras,
   weld + dedup, recenter to origin, uniformly scale so its bounding box fits the
   slot's expected footprint (derived from the current placeholder's default
   scale + `SLOT_POSITION_BOUNDS`), apply any orientation fix, optionally Draco-
   compress, and assert the output is < 500 KB (the project's per-GLB budget).

4. **Regenerate** (`build-catalog.mjs`): write each model to
   `public/assets/models/<id>.glb` (real or fallback), copy to `out/` mirror,
   regenerate `manifest.json` reusing the **existing** anchors, default
   transforms, scale/rotation bounds, excludes, and dependencies — only
   `glbFile`, `triangleCount`, `fileSizeBytes` change for real assets. Emit
   `ASSET-PROVENANCE.md` with source URL + creator + license + pack + SHA for
   every real asset, and "procedural fallback" for the rest.

### Licensing / compliance

- Only CC0 sources. `ASSET-PROVENANCE.md` is the audit record (source URL,
  creator, license = CC0, pack name, download SHA-256) — satisfies the
  "cite sources / license-cleared" requirement for a commercial product.
- No third-party account creation. No assets posted to external services.
- Raw pack ZIPs and extracted source GLBs live in `assets-src/` and are
  **gitignored** — only the normalized per-slot GLBs we actually use are committed
  under `public/assets/models/`.
- New dev dependencies: `@gltf-transform/core`, `@gltf-transform/functions`
  (and a small unzip lib if Node's built-ins are insufficient). Dev-only — not
  shipped to the browser bundle.

## Testing / Verification

1. **Schema check:** regenerated `manifest.json` validates against
   `catalog-types.ts` (assetId/slotType/paths present, every `glbFile` exists on
   disk, every referenced `excludes`/`dependencies` id resolves).
2. **Budget check:** every committed GLB < 500 KB; script fails the build if not.
3. **Load check:** each GLB parses via `@gltf-transform` NodeIO (valid glTF 2.0,
   non-empty mesh) — catches corrupt/empty downloads.
4. **Visual check:** run the editor (`npm run dev`), step through slots, and
   screenshot the doll to confirm real models render at sane scale/orientation in
   their anchors (not floating, inverted, or oversized). This is the real
   acceptance gate — the others are necessary but not sufficient.
5. **Idempotence:** re-running `build-catalog.mjs` produces byte-stable output.

## Out of Scope (YAGNI)

- Real raster (WebP) thumbnails — keep SVG initials for now.
- KTX2 texture compression — models ship `embedded` like today.
- Uploading assets to R2/CDN — local `public/` paths only, as today.
- Per-asset rigging/animation — static meshes only.
- Changing the slot taxonomy, anchors, or constraint envelopes.

## Open Questions (resolve during implementation)

- Exact pinned ZIP URLs for the chosen Quaternius/Kenney packs (resolved in
  stage 1; some Quaternius packs route through itch.io download pages — if a
  direct URL can't be obtained without an account, that pack is dropped and its
  slots fall back).
- Whether heads/wings get any real model or stay procedural (decided from the
  stage-1 inventory).
