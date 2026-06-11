# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Music Box Doll Builder — a mobile-first web app where users assemble a customizable virtual doll from 3D-scanned parts, render a short looping video, and share it. Phase 1 is web-only (no App Store), targeting iPhone Safari/Chrome users, with Stripe monetization after the first free export.

The implementation target is `webapp-1/`. This root directory holds research docs, PDFs, and a reference 3D scene asset.

## Current Status (2026-06-11)

**Lean core-loop MVP is built and deployed.** The full flow works end-to-end: landing → assemble doll (5 slots) → decorate scene → pick music → render an MP4 in-browser → share/download.

- **Live:** https://lindentar.pashteto.com (static export on oracle-2, served by Caddy with auto-HTTPS)
- **Code:** the Next.js app lives at the **`webapp-1/` root** (`package.json`, `src/`, `public/` directly under `webapp-1/`)
- **Branch / PR:** `feat/mvp-core-loop` → PR #1 on `Pashteto/music-box-doll-builder`
- **Deferred** (still spec'd in `webapp-1/docs/tasks/`): Go backend + real Stripe (E12 full), analytics (E13), PWA (E14), backend catalog/sessions (E15), global-adjust (E7), floating props (E8-T3)

See `webapp-1/HANDOFF.md` for the onboarding/handoff guide and `webapp-1/deploy/DEPLOY.md` for the deploy runbook.

## Implementation Directory

All development happens in `webapp-1/`. That subdirectory has its own `CLAUDE.md` (stack, architecture, data models, conventions, implementation status) — read it before making changes.

## Dev Commands

Run from `webapp-1/` (the Next.js project root):
```
npm run dev          # local dev server (http://localhost:3000)
npm run build        # production build → static export in out/
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm run test         # Vitest unit tests
npm run test -- -t "test name"        # single test
npm run format       # Prettier
node scripts/gen-placeholder-assets.mjs   # (re)generate placeholder catalog assets
./deploy/deploy.sh   # build + rsync out/ to oracle-2 (see deploy/DEPLOY.md)
```

> Test runner is **Vitest** (not Jest, despite older spec text). The **backend is not built yet** (deferred); when built, scaffold it from the Go monolith template (see Infrastructure below).

## Task Structure

Implementation is broken into 17 epics (E0–E16) in `webapp-1/docs/EPICS.md`. Each epic has individual task files at `webapp-1/docs/tasks/E{n}/E{n}-T{m}.md` with full context for autonomous execution.

Recommended implementation order: E0 → E2+E3 (parallel) → E5 → E6+E4 (parallel) → E1+E7+E8+E9 → E10 → E11+E12 → E13+E14+E15+E16. See `webapp-1/docs/EPICS.md` → "Implementation Order" for the full dependency graph.

**Highest-risk epic:** E10 (Video Render Engine) — WebCodecs on Safari. Prototype early.

## Key Reference Docs

| File | Contents |
|------|----------|
| `webapp-1/CLAUDE.md` | Stack, architecture, data models, API endpoints, conventions |
| `webapp-1/docs/EPICS.md` | Full epic/task breakdown with dependencies and acceptance criteria refs |
| `webapp-1/docs/web-app-research.md` | Tech decisions, risk analysis, phased roadmap (English) |
| `webapp-1/docs/web-master-spec-ru.md` | Full Phase 1 spec: REQ-*, AC-*, architecture, flows (Russian) |
| `webapp-1/servers/summary.md` | oracle-1 (ARM, 7.7 GB RAM) and oracle-2 (x86, 958 MB RAM) server specs |

## Infrastructure

Two Oracle Cloud instances (reachable via `ssh oracle-1` / `ssh oracle-2`):
- `oracle-1` — 129.146.183.89 (ARM, 7.7 GB RAM) — hosts `amphitheater.pashteto.com` and the Go bot; **leave untouched**
- `oracle-2` — 129.146.130.46 (x86, 958 MB RAM) — **hosts this frontend** at `lindentar.pashteto.com` (Caddy, web root `/srv/lindentar/out`)

The frontend is a **static export** served by Caddy on oracle-2 (not Vercel). DNS A record `lindentar → 129.146.130.46` lives in Namecheap (`pashteto.com`). The MVP uses placeholder GLB assets bundled in `public/`; production assets would later move to a CDN (Cloudflare R2).

VPN/proxy services that previously ran on oracle-2 (`xray`, `hysteria-server`, `tailscaled`) were stopped + disabled on 2026-06-11.

**Backend service template (REQUIRED):** Build any Go backend from the template at
`/Users/dodonovpavel/gateway_fm/go-microservice-template` — used as a **single modular monolith**,
not as separate microservices. All backend modules (auth, entitlements, checkout, catalog,
analytics, admin) live inside one service scaffolded from that template.
