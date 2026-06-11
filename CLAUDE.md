# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Music Box Doll Builder — a mobile-first web app where users assemble a customizable virtual doll from 3D-scanned parts, render a short looping video, and share it. Phase 1 is web-only (no App Store), targeting iPhone Safari/Chrome users, with Stripe monetization after the first free export.

The implementation target is `webapp-1/`. This root directory holds research docs, PDFs, and a reference 3D scene asset.

## Implementation Directory

All development happens in `webapp-1/`. That subdirectory has its own `CLAUDE.md` with the full tech stack, architecture patterns, data models, API endpoints, and conventions — read it before making any changes.

## Dev Commands (Expected Once Scaffolded per E0)

**Frontend** (`webapp-1/frontend/` or root of Next.js project):
```
npm run dev          # local dev server (Next.js)
npm run build        # production build
npm run lint         # ESLint + TypeScript check
npm run test         # Jest unit tests
npm run test -- -t "test name"   # single test
```

**Backend** (`webapp-1/backend/`):
```
go run ./cmd/api/    # start Go API server
go test ./...        # all backend tests
go test ./internal/entitlements/...  # single package
go build ./cmd/api/  # compile binary
```

**Local infra** (PostgreSQL + Redis + backend):
```
docker-compose up    # start all services
docker-compose up -d postgres redis   # deps only
```

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

Two Oracle Cloud instances for backend hosting:
- `oracle-1` — 129.146.183.89 (ARM, 7.7 GB RAM) — primary candidate for Go backend
- `oracle-2` — 129.146.130.46 (x86, 958 MB RAM) — lighter workloads

Frontend deploys to Vercel. GLB/texture assets served from Cloudflare R2.
