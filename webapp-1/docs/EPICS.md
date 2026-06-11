# Epics & Tasks -- Music Box Doll Builder (Phase 1)

This document breaks the Phase 1 prototype into implementation epics and tasks. Each task is designed to be delegated to an agent with enough context to work autonomously.

**Key references:**
- `docs/web-app-research.md` -- tech decisions, risks, roadmap (English)
- `docs/web-master-spec-ru.md` -- full spec: requirements (REQ-*), architecture, data models, API, flows, acceptance criteria (AC-*) (Russian)
- `CLAUDE.md` -- project overview, stack, conventions, constraints

**Notation:**
- REQ-XX = requirement from spec
- AC-XX = acceptance criterion from spec
- [blocked-by: E{n}] = must be done after epic N
- Priority: P0 = critical path, P1 = important, P2 = can defer

---

## Implementation Status (2026-06-11)

The **lean core-loop MVP** is built and live at https://lindentar.pashteto.com. Status per epic:

| Epic | Status | Notes |
|------|--------|-------|
| E0 Scaffolding | ✅ frontend (T1–T4) | T5–T7 (Go backend, docker-compose, CI) deferred |
| E1 Landing | ✅ | SSR shell + lazy R3F demo + Create/Continue |
| E2 Zustand state | ✅ | store + constraint clamps |
| E3 Catalog | ✅ | static `public/catalog/manifest.json` (no backend endpoint) |
| E4 IndexedDB storage | ✅ | save / autosave / resume |
| E5 3D scene | ✅ | transforms via sliders (not pinch/drag) |
| E6 Slot editor | ✅ | 5 active slots |
| E7 Global adjustment | ⛔ deferred | |
| E8 Scene composer | ◑ partial | bg/fg done; floating props (T3) deferred |
| E9 Music selection | ✅ | Howler preview + duration |
| E10 Video render | ✅ | WebCodecs H.264+AAC / MediaRecorder fallback |
| E11 Share | ✅ | Web Share + download |
| E12 Paywall & Stripe | ◑ stub | first-free gate + placeholder UI; **no Stripe/backend** |
| E13 Analytics | ⛔ deferred | |
| E14 PWA / SW | ⛔ deferred | |
| E15 Backend catalog/sessions | ⛔ deferred | |
| E16 Polish & perf | ◑ partial | mobile viewport (T1) done; bundle/perf/browser audits deferred |

Deferred backend work must be built from the `go-microservice-template` as a single modular monolith (see `../CLAUDE.md`). Full handoff: `../HANDOFF.md`.

---

## E0: Project Scaffolding & Dev Infrastructure (P0)

Bootstrap the codebase so all subsequent epics have a working dev environment.

### E0-T1: Initialize Next.js 15 project
- Create Next.js 15 app with App Router, React 19, TypeScript strict mode
- Configure `tsconfig.json` with strict: true, path aliases (`@/`)
- Set up folder structure:
  ```
  src/
    app/           -- Next.js App Router pages
    components/    -- shared UI components
    modules/       -- feature modules (editor, scene, catalog, paywall, render, share, analytics, storage)
    lib/           -- utilities, helpers, types
    store/         -- Zustand store slices
    hooks/         -- custom React hooks
  public/
    assets/        -- static assets placeholder
  docs/            -- specs (already here)
  ```
- **Ref:** spec "Tech Stack" table, CLAUDE.md "Tech Stack / Frontend"

### E0-T2: Configure Tailwind CSS
- Install Tailwind CSS v4 (or latest stable) + PostCSS
- Configure for mobile-first responsive design
- Set up base theme tokens (colors, spacing, typography -- placeholder values OK for Phase 1)
- **Ref:** AC-06 (responsive, mobile-first, portrait-optimized)

### E0-T3: Configure ESLint + Prettier
- ESLint with Next.js recommended + TypeScript rules
- Prettier for consistent formatting
- Lint-staged + husky for pre-commit hooks

### E0-T4: Set up Framer Motion
- Install framer-motion
- Verify it works with Next.js App Router (client components)
- **Ref:** spec "UI Animation" -- Framer Motion for landing animation, page transitions

### E0-T5: Initialize Go backend project
- Create `backend/` directory with Go module
- Set up project structure: `cmd/api/`, `internal/` (auth, entitlements, checkout, catalog, analytics, admin)
- Basic HTTP server with health endpoint (`GET /api/v1/health`)
- Dockerfile for the Go service
- **Ref:** spec "Go Backend API", API endpoints table

### E0-T6: Docker Compose for local dev
- docker-compose.yml with: PostgreSQL, Redis, Go backend
- Environment variables template (`.env.example`)
- Database initialization script (empty schema placeholder)

### E0-T7: CI/CD pipeline (GitHub Actions)
- Lint + type-check + build for frontend
- Lint + test + build for backend
- Deploy triggers (Vercel for frontend, container for backend) -- placeholder configs
- **Ref:** spec "CI/CD" -- GitHub Actions

---

## E1: Landing Page (P0)

The entry point. Must load fast, show animated demo doll, offer "Create New" and "Continue Draft".

**Depends on:** E0 (scaffolding)

### E1-T1: Landing page route and SSR shell
- Create `app/page.tsx` as the landing route
- SSR-rendered lightweight shell (title, CTA button placeholders)
- Target: First Contentful Paint < 1.5s on 4G
- **Ref:** REQ-01, AC-01

### E1-T2: R3F canvas with demo doll (lazy loaded)
- Dynamic import of R3F `<Canvas>` component (code-split so landing shell loads fast)
- Load a single demo GLB model (placeholder/test asset OK)
- Basic lighting and camera setup
- Show loading skeleton while R3F initializes
- Target: 3D interactive within 3s on iPhone 12
- **Ref:** REQ-01, AC-01, spec "Entry Point / Landing" component

### E1-T3: Landing animation (Framer Motion)
- Animated entrance for the demo doll + UI elements
- Smooth transitions for CTA buttons appearing
- **Ref:** REQ-01, spec "Entry Point / Landing"

### E1-T4: "Create New" and "Continue Draft" buttons
- "Create New" button always visible -- navigates to editor (E5)
- "Continue Draft" section shown only when IndexedDB has saved drafts (depends on E4 storage module)
- Show thumbnail preview for each draft
- If no drafts, only show "Create New"
- **Ref:** REQ-01, REQ-12, AC-02, AC-03, spec "Flow 1: App Launch"

---

## E2: Zustand State Management (P0)

Central state layer that all editor modules read/write.

**Depends on:** E0

### E2-T1: Composition state store
- Define TypeScript types for all data models: `DollProject`, `SlotSelection`, `AssetReference`, `PropPlacement`, `SlotType` enum
- Create Zustand store with slices:
  - `compositionSlice`: slotSelections[], sceneBackground, sceneForeground, sceneProps, musicTrackId, videoDuration
  - `editorSlice`: currentStep (slot navigation), editorMode (slot-editor | global-adjust | scene | music | render)
  - `entitlementSlice`: entitled boolean, firstExportUsed flag
- Actions: selectAsset(slot, assetId), updateTransform(slot, transform), setBackground(), setMusic(), etc.
- **Ref:** spec "Data Model" section (DollProject, SlotSelection tables), spec "Patterns" section

### E2-T2: Transform constraint enforcement
- Utility functions that clamp position/rotation/scale to asset metadata bounds
- Applied inside store actions so no component can set out-of-bounds transforms
- **Ref:** REQ-05, AC-09, AC-10, spec "Constrained transform envelope" pattern

---

## E3: Catalog Module (P0)

Loads and serves asset metadata to editor, scene composer, and music selector.

**Depends on:** E0

### E3-T1: Asset manifest schema and types
- Define TypeScript types for `AssetManifestEntry` matching the spec exactly (assetId, slotType, displayName, previewImage, glbFile, defaultTransform, minScale, maxScale, minRotation, maxRotation, anchorPoint, excludes, dependencies, fileSizeBytes, triangleCount)
- Define manifest structure: `{ version: string, assets: AssetManifestEntry[] }`
- **Ref:** spec "AssetManifestEntry" data model table

### E3-T2: Create placeholder manifest JSON
- Create `public/catalog/manifest.json` with test data for 3-5 slots and a few assets per slot
- Create placeholder WebP thumbnails and GLB references (can be dummy URLs initially)
- Include at least: 1 background, 1 foreground, 1 music track entry
- **Ref:** REQ-13, AC-26

### E3-T3: Manifest loader hook
- `useCatalog()` hook that fetches and caches the manifest on app init
- Filter assets by slotType for each editor step
- Handle loading/error states
- **Ref:** spec "Catalog Module" component description

### E3-T4: GLB asset loading with R3F
- Integrate Drei's `useGLTF` with React Suspense for on-demand GLB loading
- Show loading indicator per asset while GLB downloads
- Configure Draco and KTX2 loaders (Three.js extensions)
- **Ref:** AC-08, AC-33, spec "Web-Specific Optimizations"

---

## E4: Project Storage -- IndexedDB (P1)

Local draft persistence. Required before landing "Continue Draft" works and before autosave.

**Depends on:** E2 (needs store types)

### E4-T1: IndexedDB setup with idb
- Create `doll-builder` database with `projects` object store (keyed by UUID)
- Implement CRUD: `saveProject()`, `loadProject(id)`, `listProjects()`, `deleteProject(id)`
- Enforce max 5 drafts limit on save
- **Ref:** spec "Project Storage Module", REQ-12, AC-04

### E4-T2: Autosave integration
- Subscribe to Zustand store changes
- Debounced save (1 second) on every meaningful state change
- `beforeunload` handler for immediate save on page exit
- **Ref:** AC-12, spec "Flow 7: Draft Save/Resume"

### E4-T3: Draft resume flow
- `listProjects()` returns drafts with thumbnails for landing page
- `loadProject(id)` hydrates Zustand store and navigates to saved `currentStep`
- **Ref:** AC-02, AC-03, spec "Flow 1: App Launch"

---

## E5: 3D Scene Foundation (R3F) (P0)

The shared 3D canvas used by editor, scene composer, and render engine.

**Depends on:** E0, E3 (for GLB loading)

### E5-T1: Base R3F scene component
- Reusable `<DollScene>` component wrapping R3F `<Canvas>`
- Camera setup for portrait view (9:16 aspect)
- Lighting rig (ambient + directional, tuned for doll aesthetics)
- Orbit controls for user preview (bounded, not full free orbit)
- **Ref:** spec architecture diagram -- R3F Scene is shared across editor, composer, render engine

### E5-T2: Slot anchor system
- Define anchor points in 3D space for each SlotType
- When an asset is selected for a slot, place it at the slot's anchor with defaultTransform
- Support hierarchical attachment (e.g., hair anchored relative to head)
- **Ref:** REQ-05, AC-08, spec "Slot-based composition model" pattern

### E5-T3: Constrained transform controls
- Touch/mouse interaction for rotation and scale on selected asset
- Pinch-to-scale, drag-to-rotate on mobile
- All transforms clamped to asset metadata bounds (use E2-T2 utilities)
- Visual feedback when hitting constraint boundaries
- **Ref:** REQ-05, REQ-06, AC-09, AC-10

### E5-T4: Performance optimization baseline
- Object disposal on unmount (geometries, materials, textures)
- Monitor memory usage target: < 300 MB
- Ensure 30+ fps on iPhone 12 Safari with 5 loaded assets
- **Ref:** AC-30, AC-31, AC-34, spec "Mobile Web Performance Requirements"

---

## E6: Step-by-Step Slot Editor (P0)

The core creation flow -- user walks through slots choosing assets.

**Depends on:** E2 (store), E3 (catalog), E5 (3D scene)

### E6-T1: Editor page and slot navigation
- Create editor route (`app/editor/page.tsx`)
- Slot step sequencer: ordered list of active slots, current step indicator
- Next/Back buttons to navigate between slots
- Progress indicator showing which slots are done
- **Ref:** REQ-02, REQ-04, AC-05, spec "Flow 2: Step-by-Step Editor"

### E6-T2: Scrollable asset catalog per slot
- Horizontal scrollable panel showing asset thumbnails (WebP) for current slot
- First item is always "empty/none" option
- Selecting an asset updates Zustand store and triggers GLB load in 3D scene
- Selecting "empty" removes the asset from the slot
- Highlight currently selected asset
- **Ref:** REQ-02, REQ-03, AC-07

### E6-T3: Asset placement on selection
- On asset select: load GLB via Suspense, place at slot anchor, apply defaultTransform
- Show loading spinner while GLB loads
- If replacing an existing asset in slot, dispose old one first
- **Ref:** AC-08, spec "Flow 2" step 4

### E6-T4: In-slot transform adjustments
- After asset is placed, show subtle controls for rotation and scale
- Touch gestures: pinch for scale, drag for rotation
- All clamped to asset metadata constraints
- **Ref:** REQ-05, AC-09, spec "Flow 2" step 5

### E6-T5: Editor completion screen
- After last slot: show fully assembled doll
- "Continue" button (to global adjustment or scene composer)
- "Back to Slots" button to revisit any slot
- **Ref:** spec "Flow 2" step 8

---

## E7: Global Adjustment Mode (P1)

Post-editor fine-tuning of the assembled doll.

**Depends on:** E6 (editor must be done first in flow)

### E7-T1: Global adjustment view
- Show fully assembled doll with all placed assets
- Each placed element is tappable/clickable for selection
- Visual highlight on selected element (glow, outline, etc.)
- **Ref:** REQ-06, AC-11, spec "Flow 3: Global Adjustment"

### E7-T2: Per-element transform controls
- On element select: show UI controls (scale slider, rotation sliders, position offset)
- Position offset available here (not in slot editor) but still constrained
- All transforms clamped to metadata bounds
- **Ref:** REQ-06, AC-10, AC-11

### E7-T3: Navigation from global adjustment
- "Back to Slots" -- returns to slot editor preserving all state
- "Continue" -- proceeds to scene composer
- Autosave on every adjustment
- **Ref:** spec "Flow 3" steps 5-6

---

## E8: Scene Composer (P1)

Background, foreground, and floating decorations for the music-box scene.

**Depends on:** E3 (catalog), E5 (3D scene), E6 (doll must be assembled)

### E8-T1: Background selection
- Show background catalog (from manifest, slotType = background)
- Include "empty" option
- On selection: load and apply background asset to scene
- Real-time preview update
- **Ref:** REQ-07, AC-13, spec "Flow 4: Scene Decoration"

### E8-T2: Foreground selection
- Same pattern as background but for foreground layer
- **Ref:** REQ-07, AC-13

### E8-T3: Floating props placement
- Show decorative props catalog
- User can place/remove floating props
- Props have constrained positions
- "Skip" option to place no props
- **Ref:** REQ-07, AC-13

### E8-T4: Scene composer navigation
- "Continue" to music selection
- "Back" to global adjustment
- Autosave all scene selections
- **Ref:** spec "Flow 4" step 5

---

## E9: Music Selection (P1)

Choose a music track and set video duration.

**Depends on:** E3 (catalog for track list)

### E9-T1: Music track catalog UI
- Display available tracks from manifest
- Each track shows name and play button
- **Ref:** REQ-08, AC-14, spec "Flow 5: Music Selection"

### E9-T2: Audio preview with Howler.js
- Install and configure Howler.js
- Play track preview on user tap (satisfies mobile autoplay policy)
- Stop previous track when new one is selected
- **Ref:** REQ-08, AC-14, spec "Howler.js" in tech stack

### E9-T3: Duration slider
- Slider to adjust video render duration (default 10s)
- Persist to Zustand store + autosave
- **Ref:** AC-14, AC-15, spec "Flow 5" step 3

### E9-T4: "Render" button
- Prominent CTA to start video generation
- Navigates to render flow (E10)
- **Ref:** spec "Flow 5" step 5

---

## E10: Video Render Engine (P0 -- critical path, highest risk)

In-browser video generation. This is the hardest technical piece.

**Depends on:** E5 (3D scene), E9 (music selected)

### E10-T1: WebCodecs feature detection
- Detect `VideoEncoder` availability
- Select primary (WebCodecs + mp4-muxer) or fallback (MediaRecorder) pipeline
- **Ref:** spec "Render Engine Module" implementation steps, AC-20

### E10-T2: Frame capture pipeline
- Offscreen render loop: advance scene rotation by `2pi / totalFrames` per frame
- Capture each frame from Three.js canvas
- Target: 1080x1920, 30fps
- Progress callback for UI (% complete)
- **Ref:** REQ-09, AC-16, spec "Rendering Strategy" section

### E10-T3: WebCodecs encoding path (primary)
- Install mp4-muxer package
- Configure VideoEncoder: H.264, 1080x1920, 30fps
- Decode audio track via Web Audio API
- Mux encoded video frames + AAC audio into MP4 via mp4-muxer
- Output: `Blob` of type `video/mp4`
- **Ref:** spec "Option A: WebCodecs API + MP4 Muxer", spec "Render Engine" implementation

### E10-T4: MediaRecorder fallback path
- `canvas.captureStream(30)` + audio stream mixed via Web Audio API
- MediaRecorder outputs WebM (Chrome) or MP4 (Safari)
- Same progress reporting interface
- **Ref:** spec "Option B: MediaRecorder API (Fallback)", AC-20

### E10-T5: Render UI (progress + preview)
- Render progress screen with progress bar/percentage
- On completion: show `<video>` element playing the rendered MP4
- "Share" and "Save to Device" buttons
- **Ref:** AC-16, AC-17, AC-18, spec "Flow 6" steps 5-6

---

## E11: Share Flow (P1)

Deliver the rendered video to the user.

**Depends on:** E10 (rendered video blob)

### E11-T1: Web Share API integration
- Check `navigator.canShare({ files: [...] })`
- If supported: `navigator.share()` with MP4 file -- opens native share sheet
- Must work for Instagram Reels/Stories as destinations
- **Ref:** REQ-10, AC-19, spec "Sharing Strategy", spec "Share Flow Module"

### E11-T2: Download fallback
- If Web Share API unavailable (desktop): create temp object URL, trigger `<a download>` click
- "Save to Device" button always visible as alternative
- **Ref:** REQ-10, AC-19, spec "Share Flow" implementation step 3

---

## E12: Paywall & Stripe Integration (P0)

Monetization gate after first free export.

**Depends on:** E0-T5 (Go backend), E10 (render flow)

### E12-T1: Go backend -- Stripe Checkout session endpoint
- `POST /api/v1/checkout/session` -- create Stripe Checkout session for one-time purchase
- Accept sessionId, productId, successUrl, cancelUrl
- Return checkoutUrl
- Configure Stripe SDK in Go
- **Ref:** spec "Checkout" API table, spec "Paywall Module" implementation step 3

### E12-T2: Go backend -- Stripe webhook handler
- `POST /api/v1/webhooks/stripe` -- handle `checkout.session.completed`, `payment_intent.succeeded`, `charge.refunded`
- On successful payment: create Entitlement record in PostgreSQL
- Verify webhook signature
- **Ref:** spec "Stripe Webhooks" API table

### E12-T3: Go backend -- Entitlement check endpoint
- `GET /api/v1/entitlements/{sessionId}` -- return `{ entitled: true/false }`
- Query PostgreSQL, cache in Redis (short TTL)
- **Ref:** spec "Entitlements" API table

### E12-T4: Go backend -- Purchase restore endpoint
- `POST /api/v1/entitlements/restore` -- lookup by email, return entitlement status
- **Ref:** REQ-15, AC-24

### E12-T5: PostgreSQL schema for entitlements
- Create migration: `entitlements` table (id, sessionId, email, stripeCustomerId, stripePaymentId, productId, status, createdAt)
- Create migration: `sessions` table (id/UUID, createdAt, userAgent)
- **Ref:** spec "Entitlement" data model table

### E12-T6: Redis setup for entitlement cache
- Cache entitlement check results (TTL ~60s)
- Rate limiting middleware for API endpoints
- **Ref:** spec "Redis should store" section

### E12-T7: Frontend -- First-free-export logic
- On first render: allow export, set `localStorage` flag `firstExportUsed = true`, show notice about future paywall
- On subsequent renders: call `GET /api/v1/entitlements/{sessionId}` before allowing share
- **Ref:** REQ-11, AC-21, AC-22, spec "Paywall Module" implementation steps 1-2

### E12-T8: Frontend -- Paywall UI screen
- Shown when user tries to export without entitlement (after first free)
- "Unlock Export" button -- redirects to Stripe Checkout
- "Restore Purchase" link -- email lookup flow
- "Cancel" returns to video preview (video not lost, export blocked)
- **Ref:** REQ-11, AC-22, AC-23, AC-25, spec "Flow 6" steps 7-9

### E12-T9: Frontend -- Post-purchase verification
- On return from Stripe (success URL): re-check entitlement via API
- Unlock export on confirmed entitlement
- **Ref:** AC-23, spec "Flow 6" step 9

---

## E13: Analytics (P2)

Event tracking across the full funnel. Can be done later but should be wired early.

**Depends on:** E0

### E13-T1: PostHog SDK setup
- Install PostHog JS SDK
- Initialize with anonymous ID (matching backend session UUID)
- Respect Do Not Track
- **Ref:** spec "Analytics Module", AC-29

### E13-T2: Funnel event instrumentation
- Track events (no PII): page_load, editor_start, slot_completed (per slot), global_adjust_enter, scene_complete, music_selected, render_start, render_complete, paywall_shown, purchase_complete, share_initiated
- **Ref:** AC-29

### E13-T3: Go backend -- Analytics ingestion
- `POST /api/v1/analytics/events` -- accept batch events, forward to PostHog or store
- **Ref:** spec "Analytics" API table

---

## E14: PWA & Service Worker (P2)

Progressive Web App capabilities for offline editing and install-to-home.

**Depends on:** E0, E3 (assets to cache)

### E14-T1: PWA manifest
- Create `manifest.json` with app name, icons, theme color, display: standalone
- Configure `<meta>` tags for iOS Safari (apple-mobile-web-app-capable, status bar style)
- **Ref:** REQ-16, AC-06, spec "PWA Considerations"

### E14-T2: Service Worker with Workbox
- Install next-pwa or configure Workbox manually
- Cache strategy: GLB assets cached on first load (cache-first), manifest cached with stale-while-revalidate
- Audio files cached on first play
- **Ref:** REQ-13, AC-27, spec "PWA" section

### E14-T3: Offline editing verification
- After initial asset load and SW caching, full creation flow works without network (except paywall/Stripe)
- **Ref:** AC-27

---

## E15: Backend Catalog & Session Management (P1)

Backend support for catalog delivery and anonymous sessions.

**Depends on:** E0-T5 (Go backend)

### E15-T1: Catalog manifest endpoint
- `GET /api/v1/catalog/manifest` -- return JSON manifest or redirect to CDN URL with cache headers
- **Ref:** spec "Catalog" API table

### E15-T2: Anonymous session management
- Generate session UUID on first visit (set as cookie)
- Store session in PostgreSQL (id, createdAt, userAgent)
- All entitlements keyed to this session
- **Ref:** REQ-14, AC-28, spec "guest session handling"

---

## E16: Polish & Performance (P1)

Cross-cutting quality tasks.

**Depends on:** E5, E6, E10 (core features must exist)

### E16-T1: Mobile viewport and touch handling
- Handle `dvh` for 100vh Safari bug
- Safe area insets for notch devices
- Touch event handling for 3D interactions (prevent scroll conflicts)
- **Ref:** spec "Mobile Browser Gotchas", AC-06

### E16-T2: Code splitting audit
- Verify Three.js/R3F only loads on editor entry
- Landing page JS bundle should be minimal
- Editor route bundle < 500 KB gzipped
- **Ref:** AC-32, spec "Code splitting" pattern

### E16-T3: Memory and performance profiling
- Test full creation-to-export flow on iPhone 12 Safari
- Verify memory stays < 300 MB
- Verify 30+ fps in editor
- Verify render completes < 60s
- **Ref:** AC-30, AC-31, AC-34, AC-17

### E16-T4: Browser compatibility testing
- Test matrix: Safari iOS 16.4+, Safari iOS 17+, Chrome Android, Chrome Desktop, Firefox Desktop
- Verify WebCodecs/MediaRecorder fallback works
- Verify Web Share API / download fallback works
- **Ref:** spec "Browser Compatibility Matrix"

---

## Implementation Order (Recommended)

```
Phase A -- Foundation (do first, in parallel where possible):
  E0  Project Scaffolding        [no deps]
  E2  Zustand State Management   [after E0]
  E3  Catalog Module             [after E0]

Phase B -- Core 3D + Editor (main product):
  E5  3D Scene Foundation        [after E0, E3]
  E6  Step-by-Step Slot Editor   [after E2, E3, E5]
  E4  Project Storage (IndexedDB)[after E2]

Phase C -- Full Flow:
  E1  Landing Page               [after E4, E5]
  E7  Global Adjustment Mode     [after E6]
  E8  Scene Composer             [after E3, E5, E6]
  E9  Music Selection            [after E3]

Phase D -- Export & Monetization (critical path):
  E10 Video Render Engine        [after E5, E9]  <-- highest risk
  E11 Share Flow                 [after E10]
  E12 Paywall & Stripe           [after E0-T5, E10]

Phase E -- Polish & Supporting:
  E13 Analytics                  [after E0, can start early]
  E14 PWA & Service Worker       [after E0, E3]
  E15 Backend Catalog/Sessions   [after E0-T5]
  E16 Polish & Performance       [after core features]
```

---

## Risk Notes

1. **E10 (Video Render) is the highest-risk epic.** WebCodecs on Safari is the #1 technical risk. Spike/prototype this early even if other epics aren't done. See spec "Risks to Plan For" and research doc "Video Export Strategy" section.

2. **3D performance on mobile Safari** -- WebGL memory limits are aggressive. E5-T4 and E16-T3 are critical quality gates. See research doc "Mobile Browser Gotchas".

3. **Chrome on iOS = WebKit** -- no way to escape Safari's rendering engine on iPhone. All browsers share the same limits. Test primarily in Safari.

4. **IndexedDB is not durable on iOS** -- data can be purged. Phase 1 accepts this risk (no server sync). Phase 2 adds cloud persistence.

5. **Stripe mobile UX** -- poor checkout flow = abandoned purchases. E12-T8 paywall screen must be clean and native-feeling.
