# Music Box Doll Builder -- Web App (Phase 1)

## What Is This

A mobile-first web app where users assemble a customizable virtual doll from 3D-scanned parts, place it in a stylized music-box scene, render a short looping video, and share it. Monetization via Stripe after the first free export.

Primary target: iPhone users (Safari/Chrome). Web-first for instant URL distribution, no App Store dependency, no 30% Apple cut.

Phase 1 scope: 1 doll template, 3-5 active slots, 20-30 GLB assets, 1 scene template, 1 music track, local in-browser render, simple paywall.

## Reference Documents

- `docs/web-app-research.md` -- tech research, stack decisions, risks, phased roadmap
- `docs/web-master-spec-ru.md` -- full Phase 1 technical specification (Russian): requirements, architecture, data models, API design, flows, acceptance criteria
- `docs/EPICS.md` -- epics and tasks breakdown for step-by-step implementation

## Tech Stack

### Frontend
- **React 19** + **Next.js 15** (App Router) + **TypeScript** (strict)
- **Three.js** via **React Three Fiber (R3F)** + **Drei** -- 3D scene
- **Zustand** -- global state (composition, editor nav, entitlements)
- **Tailwind CSS** -- styling, mobile-first
- **Framer Motion** -- landing animation, UI transitions
- **Howler.js** -- cross-browser audio (mobile Safari workarounds)
- **idb** (IndexedDB wrapper) -- local draft persistence (max 5 drafts)
- **WebCodecs API + mp4-muxer** -- video export (primary)
- **MediaRecorder** -- video export (fallback)
- **Web Share API** -- native share sheet on mobile; download fallback on desktop
- **next-pwa / Workbox** -- Service Worker, asset caching, PWA manifest

### Backend
- **Golang** -- modular monolith (auth, entitlements, checkout, catalog, analytics, admin)
- **PostgreSQL** -- entitlements, purchases, sessions, catalog metadata
- **Redis** -- rate limits, entitlement cache, feature flags, hot catalog
- **Stripe** -- Checkout for one-time purchase, webhooks for entitlement sync

### Hosting
- **Vercel** -- frontend (Next.js optimized)
- **Fly.io / Railway** -- Go backend
- **Cloudflare CDN / R2** -- GLB assets, KTX2 textures, audio, static files

### Observability
- **OpenTelemetry** -- backend tracing
- **Sentry** -- frontend error tracking
- **PostHog** -- analytics, funnel, feature flags (privacy-first, no PII)

## 3D Asset Format

- **glTF 2.0 / GLB** (web standard, replaces USDZ from iOS plan)
- **Draco** mesh compression (80-90% geometry reduction)
- **KTX2 / Basis Universal** texture compression (4-8x smaller)
- Target: < 500 KB per asset GLB, < 5 MB total initial scene load
- Each asset carries metadata: anchor point, transform constraints (min/max scale, rotation), dependencies, exclusions

## Architecture Patterns

- **Slot-based composition** -- doll = typed array of slots, each with optional asset ref + constrained transform
- **Constrained transform envelope** -- each asset defines allowed ranges; editor enforces at UI level
- **Entitlement-gated export** -- paywall wraps render-share pipeline via single `checkEntitlement()` call
- **Code splitting** -- 3D editor/R3F/Three.js lazy-imported only on editor entry; landing stays lightweight
- **Offline-tolerant** -- GLB cached by Service Worker; projects saved in IndexedDB; creation flow works offline after initial asset load
- **Progressive enhancement** -- WebCodecs if available, MediaRecorder fallback; Web Share API if available, download fallback

## Product Flow

1. Animated landing (Framer Motion + R3F demo doll)
2. Step-by-step slot editor (head, hair, body, etc.)
3. Global adjustment mode (tap element, constrained transforms)
4. Scene decoration (background, foreground, floating props)
5. Music selection (Howler.js, tap-to-play)
6. Video render (360deg rotation, 1080x1920, 30fps, ~10s)
7. Share/export (Web Share API or download)
8. Paywall after first free export (Stripe Checkout)

## Key Data Models

- **DollProject** (IndexedDB) -- id, slots[], scene, music, duration, thumbnail, currentStep
- **SlotSelection** -- slotType, assetId, position, rotation, scale
- **AssetManifestEntry** (CDN JSON) -- assetId, slotType, glbFile, previewImage, constraints, dependencies
- **Entitlement** (PostgreSQL) -- sessionId, email, stripeCustomerId, productId, status

## API Endpoints (Go Backend)

- `GET /api/v1/entitlements/{sessionId}` -- check export entitlement
- `POST /api/v1/entitlements/restore` -- restore by email
- `POST /api/v1/checkout/session` -- create Stripe Checkout session
- `POST /api/v1/webhooks/stripe` -- Stripe webhook receiver
- `GET /api/v1/catalog/manifest` -- asset manifest (or CDN redirect)
- `POST /api/v1/analytics/events` -- batch event ingestion
- `GET /api/v1/health` -- healthcheck

## Conventions

- TypeScript strict mode everywhere
- Mobile-first responsive (Tailwind)
- No freeform 3D placement for core body parts -- snapping to anchors, bounded transforms
- Guest-only in Phase 1 (anonymous session UUID, cookie-based)
- All analytics events must be PII-free
- Performance budgets: landing FCP < 1.5s on 4G, editor TTI < 5s, 30+ fps in 3D preview, memory < 300 MB
- Individual GLB < 500 KB, editor JS bundle < 500 KB gzipped

## Phase 1 Constraints

- No user accounts / auth (guest-only via anonymous session)
- No cloud project sync (IndexedDB only)
- No server-side rendering of video
- No subscriptions (one-time purchase only)
- No multiple doll templates (one template)
- No subcategories in catalog (flat list per slot)
- Max 5 local draft projects
