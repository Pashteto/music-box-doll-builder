# Web App Research Brief — Music Box Doll Builder

---

## Project Summary

This document captures the research and recommendations for building a **web application** that lets users create a customizable virtual doll, place it inside a stylized music-box scene, add decorative elements and music, render a short video, and share it externally.

The primary target is **iPhone users running Chrome or Safari**, replacing the originally planned native iOS app with a mobile-first web experience that runs on the same powerful Apple hardware. A web app broadens reach to Android and desktop users at zero marginal distribution cost.

The intended product flow is unchanged:
1. Animated landing screen
2. Step-by-step doll builder
3. Global constrained adjustment mode
4. Scene decoration and styling
5. Music selection
6. Local video render/export
7. Share flow
8. Paywall after the first successful share/export

---

## Why Web Instead of Native iOS

| Factor | Native iOS | Web App |
|---|---|---|
| Distribution | App Store only; review process, delays | Instant via URL; no gatekeeper |
| Monetization cut | 30% Apple commission (15% for small business) | 0% platform cut with direct payments (Stripe, etc.) |
| Reach | iPhone only | iPhone, Android, desktop — any modern browser |
| Discoverability | App Store search + ASO | SEO, social links, direct URL sharing |
| Update cycle | App Store review per release | Deploy instantly, no review |
| Install friction | Download → install → open | Tap link → use immediately |
| 3D capability | RealityKit (excellent) | Three.js / WebGPU (very good, some limits) |
| Video export | AVFoundation (native, fast) | WebCodecs / MediaRecorder / ffmpeg.wasm (workable, more complex) |
| Offline | Full native offline | Service Workers / PWA (good but limited) |
| Device API access | Full (haptics, ARKit, etc.) | Limited (Web Share API, vibration, limited file access) |
| Payments | StoreKit 2 only | Stripe, PayPal, any web payment provider |

### Key Advantages of Web-First

- **No 30% Apple tax** — direct payment processing keeps significantly more revenue
- **Zero install friction** — users tap a link and start building; critical for social/viral loops
- **Instant updates** — ship fixes and new content without App Store review
- **Cross-platform from day one** — Android users are reachable immediately
- **Link-friendly sharing** — every share can include a direct link back to the app
- **SEO and content marketing** — gallery pages, landing pages, creator profiles are all indexable

### Key Risks of Web-First

- **3D rendering performance ceiling** — WebGL on mobile Safari has known limits; WebGPU adoption is still early
- **Video export is harder** — no native AVFoundation; must use WebCodecs, MediaRecorder, or ffmpeg.wasm
- **Mobile Safari quirks** — audio autoplay restrictions, PWA limitations, inconsistent fullscreen behavior
- **No push notifications (Safari)** — limited re-engagement on iOS compared to native
- **Storage limits** — IndexedDB quotas on mobile browsers; less reliable than native persistence
- **No App Store presence** — loses the "browsing the store" discovery channel (mitigated by social/SEO)

---

## Recommended Core Tech Stack

### Frontend (Web App)

- **React 19** with **Next.js 15 (App Router)** — SSR for landing/marketing, CSR for the editor
- **TypeScript** — strict mode throughout
- **Three.js** via **React Three Fiber (R3F)** — 3D scene composition, slot anchoring, constrained transforms, on-screen rendering
- **Drei** — R3F utility library (orbit controls, loaders, helpers)
- **glTF / GLB** — standard web 3D format (replaces USDZ)
- **Zustand** — lightweight global state for editor composition state
- **Tailwind CSS** — utility-first styling, mobile-first responsive design
- **Framer Motion** — landing animation and UI transitions
- **Howler.js** — cross-browser audio playback with mobile Safari workarounds
- **IndexedDB** (via **idb** wrapper) — local draft project persistence
- **Web Share API** — native-feeling share sheet on mobile
- **Service Worker / PWA manifest** — offline-capable asset caching, add-to-home-screen

### Video Export Strategy (Critical Path)

Video export on the web is the hardest technical challenge. Three viable approaches, in recommended order:

#### Option A: WebCodecs API + MP4 Muxer (Recommended for V1)
- Use `WebCodecs` (VideoEncoder) to encode frames captured from the Three.js canvas
- Mux encoded frames + audio into MP4 using a library like **mp4-muxer** or **webm-muxer**
- **Pros:** Fast, runs on-device, no server needed, hardware-accelerated encoding
- **Cons:** WebCodecs not supported on Safari < 16.4 (iOS 16.4+); must detect and fallback
- **Browser support:** Chrome (excellent), Safari 16.4+ (good), Firefox (partial)

#### Option B: MediaRecorder API (Fallback)
- Use `MediaRecorder` to capture a stream from `canvas.captureStream()`
- Outputs WebM (Chrome) or MP4 (Safari)
- **Pros:** Simpler API, wider legacy support
- **Cons:** Less control over quality/bitrate; WebM requires conversion for Instagram; audio sync can be tricky

#### Option C: Server-Side Render (Deferred)
- Send composition state to backend; render with headless Three.js (or ffmpeg) on server
- Return MP4 to client
- **Pros:** Deterministic output, works on any browser, higher quality possible
- **Cons:** Requires server infrastructure, latency, cost per render, queue management

#### Recommendation
- **V1:** WebCodecs with MediaRecorder fallback for unsupported browsers
- **Later:** Optional server-side render for premium HD exports or older devices
- **Critical:** Test video export extensively on iPhone Safari and Chrome; this is the highest-risk area

### Backend

- **Golang** — API and backend services (same as iOS plan)
- **Redis** — cache, queues, rate limits, hot state, short-lived session data
- **PostgreSQL** — durable business data
- **S3-compatible object storage** — 3D assets (GLB), previews, exported media (if server-rendered)
- **CDN (CloudFront or Cloudflare)** — fast global asset delivery; critical for 3D model load times
- **Docker** — packaging
- **GitHub Actions** — CI/CD
- **OpenTelemetry** — observability

### Payments

- **Stripe** — primary payment processor (no platform commission beyond Stripe's ~2.9% + $0.30)
- **Stripe Checkout** or **Stripe Elements** — embedded payment UI
- Server-side entitlement sync/verification in Go backend
- Restore/reactivate via email-based account lookup

### Hosting / Deployment

- **Vercel** or **Cloudflare Pages** — frontend deployment (Next.js optimized)
- **Fly.io** or **Railway** — Go backend deployment
- **Cloudflare R2** or **AWS S3** — object storage for assets
- **Cloudflare CDN** — asset delivery edge caching

---

## Recommended Architecture Style

- **Frontend:** Next.js app with clear module boundaries (editor, scene composer, catalog, payments, analytics)
- **Backend:** Start with a **modular monolith** in Go (same as iOS plan)
- Do **not** start with microservices
- Split backend into internal modules:
  - auth (email/magic-link based)
  - catalog
  - projects/compositions
  - entitlements
  - analytics
  - admin/content operations
  - asset manifests

---

## Product Concept

Unchanged from iOS plan. The app lets users assemble a doll from predefined categories of parts using **typed slots** with constraints. This is not freeform 3D modeling.

### Suggested Doll Slots
- head
- hair
- hat
- horns
- halo
- body shell
- inner insert
- collar
- wings
- left hand
- right hand
- left sleeve
- right sleeve
- lower body
- feet/base
- tail
- optional decorative pieces
- background
- foreground
- floating props
- music track

---

## Customization Model

Identical to the iOS design. Each slot supports controlled customization through metadata.

### Per-slot metadata should define:
- allowed asset IDs
- default transform
- min/max scale
- min/max rotation
- anchor point
- collision bounds
- dependencies
- exclusions
- optional animation compatibility flags

### Design Principle
Users should be able to customize extensively, but only inside a controlled aesthetic and technical envelope.

That means:
- no unrestricted freeform placement for core body parts
- asset snapping to anchors
- bounded transforms
- compatibility rules between parts
- visual consistency preserved by design

---

## 3D Format and Asset Pipeline

### Format: glTF 2.0 / GLB

USDZ is Apple-ecosystem-only. For the web, the standard is **glTF 2.0** (binary form: GLB).

- Universally supported by Three.js, Babylon.js, and all major web 3D engines
- Compact binary format with embedded textures
- Supports PBR materials, animations, morph targets
- Excellent tooling: Blender exports natively, glTF-Transform for optimization
- Can be converted to USDZ later if a native iOS app is ever built

### Required Asset Pipeline Steps
- Mesh cleanup
- Retopology or simplification (target: 5k–15k triangles per part for mobile web)
- UV cleanup
- Texture optimization: KTX2 compressed textures via Basis Universal (critical for web performance)
- Draco mesh compression for GLB files
- Pivot/origin normalization
- Scale normalization
- Anchor placement
- Collision mesh generation (simplified bounding volumes)
- LOD generation if needed
- Preview thumbnail generation (WebP format)
- Metadata generation (JSON sidecar or embedded in glTF extras)
- Versioning

### Web-Specific Optimizations
- **KTX2 + Basis Universal** texture compression — 4–8× smaller than PNG/JPEG, GPU-decompressible
- **Draco** mesh compression — 80–90% reduction in geometry data
- **Progressive loading** — show low-res preview, stream full-res
- **Aggressive CDN caching** — immutable asset URLs with content hashes
- Target **< 500 KB per asset GLB** after compression
- Target **< 5 MB total initial scene load** (starter assets)

### Each asset should include metadata for:
- asset ID
- slot/category
- display name
- version
- preview image URL (WebP)
- GLB file URL
- texture references (KTX2)
- bounding box
- default transform
- allowed transform range
- compatible slots/assets
- excluded assets
- dependency rules
- animation support flags
- file size (for loading UI)
- triangle count (for performance budgeting)

---

## Backend Responsibilities

Largely the same as the iOS plan, with additions for web-specific needs.

The Go backend should provide:
- authentication (email magic link or OAuth — no password; guest sessions for Phase 1)
- guest session handling (anonymous UUID, cookie-based)
- account upgrade flow (guest → email-linked account)
- catalog delivery (JSON manifests)
- asset manifest delivery
- project save/load (cloud sync, not just local)
- versioned project persistence
- entitlement verification (Stripe webhook integration)
- Stripe checkout session creation and payment verification
- analytics ingestion
- feature flags / remote config
- admin moderation and publishing tools
- CORS configuration for frontend
- rate limiting for API and asset endpoints

### PostgreSQL should store:
- users
- guest-to-account mappings
- doll projects
- project versions
- catalog metadata
- slot compatibility rules
- purchases and entitlements (Stripe customer/payment references)
- share history
- analytics facts that need durability
- experiment assignments
- admin content records

### Redis should store:
- hot catalog/manifests
- rate limits
- feature flag cache
- temporary locks
- job state (if server-side rendering is added)
- export/render state
- short-lived session state
- counters and ephemeral analytics buffers

---

## Rendering Strategy

### V1: On-Device (In-Browser) Rendering

Benefits:
- lower infrastructure cost
- faster turnaround for the user
- fewer backend bottlenecks
- simpler MVP architecture
- works offline after asset load

### Approach
1. Three.js renders the composed scene with a 360° rotation animation
2. Frames captured from WebGL canvas via `canvas.toDataURL()` or `OffscreenCanvas`
3. Frames encoded via WebCodecs VideoEncoder (H.264)
4. Audio track mixed in via Web Audio API
5. Muxed into MP4 via mp4-muxer
6. Resulting Blob offered for download or share

### Performance Targets
- 1080×1920 at 30 fps
- 10-second default duration = 300 frames
- Target render time: < 30 seconds on iPhone 12+ (Chrome)
- Target render time: < 60 seconds on iPhone 12+ (Safari, due to WebCodecs differences)

### Fallback
- MediaRecorder for browsers without WebCodecs support
- Reduced resolution (720×1280) option for older devices

### Defer server-side rendering until:
- higher-resolution premium exports are needed
- videos become longer or heavier
- browser limitations become blocking
- premium visual effects are required
- you need deterministic identical renders across devices

---

## Sharing Strategy

### Web Share API (Primary)
- `navigator.share()` with file support is available on mobile Chrome and Safari
- Can share the MP4 file directly, including to Instagram, WhatsApp, Telegram, etc.
- Falls back to download if Web Share API is unavailable (desktop browsers)

### Share Flow
1. Video renders locally in browser
2. On mobile: `navigator.share({ files: [mp4File], title: '...' })` — opens native share sheet
3. On desktop: Download button + copy-link-to-gallery (Phase 2)
4. Optional: generate a shareable gallery link (requires cloud project save)

### Important
- Instagram does not accept share intents with video on all devices reliably; test thoroughly
- Fallback: save video to camera roll (via download), user posts manually
- Consider adding a "Save to Photos" button as primary action alongside Share

---

## Monetization Strategy

### Recommended Model
Same as iOS plan, but with **significantly better economics** due to no App Store cut.

- Free first successful export/share
- Paywall after first successful export/share
- Paid unlock for:
  - unlimited exports
  - premium asset packs
  - premium music
  - premium scenes/backgrounds
  - optional HD render (server-side)

### Payments Stack
- **Stripe Checkout** for one-time purchases and subscriptions
- Server-side webhook handling for entitlement management
- Entitlement check before export (API call to backend)
- Guest users: entitlement stored server-side keyed to anonymous session UUID
- Account users: entitlement linked to account
- Restore: account login restores all entitlements

### Revenue Comparison
| | iOS Native | Web App |
|---|---|---|
| $9.99 purchase | $6.99 after Apple cut | ~$9.41 after Stripe fees |
| $4.99/month sub | $3.49 after Apple cut | ~$4.54 after Stripe fees |

The web path retains ~35% more revenue per transaction.

---

## PWA (Progressive Web App) Considerations

### Recommended for Phase 1
- Add `manifest.json` with app name, icons, theme color
- Register a Service Worker for asset caching
- Enable "Add to Home Screen" prompt
- Cache all loaded GLB assets for offline re-editing

### PWA Limitations on iOS Safari
- No push notifications (supported only from iOS 16.4+, unreliable)
- Storage can be evicted if the PWA isn't used for a period
- No background sync
- Limited to 50 MB in some contexts without user interaction
- Fullscreen mode has quirks with the notch and safe areas

### Recommendation
- Treat PWA as a "nice to have" enhancement, not a core requirement
- Design the app as a normal mobile web app first; PWA features are progressive enhancement
- Do not rely on offline-only; assume network is available for first load and asset delivery

---

## Mobile Web Performance Requirements

### Target Devices
- Primary: iPhone 12 and newer, Chrome or Safari
- Secondary: iPhone 11, recent Android flagships (Chrome)
- Minimum: any device with WebGL 2.0 support

### Performance Budgets
- **Initial page load (landing):** < 3 seconds on 4G (no 3D assets loaded yet)
- **Time to interactive editor:** < 5 seconds (after user taps "Create")
- **3D scene with 5 assets:** 30+ fps during orbit/manipulation
- **Total asset bundle (Phase 1):** < 20 MB (compressed, delivered via CDN)
- **Individual GLB asset:** < 500 KB
- **Memory usage:** < 300 MB during editing (to avoid Safari tab eviction)

### Optimization Strategies
- Lazy-load 3D engine only when entering editor (code splitting)
- Progressive asset loading — load low-res thumbnails first, stream GLB on selection
- KTX2 textures for GPU-compressed delivery
- Draco-compressed meshes
- Object pooling and disposal for Three.js objects
- Monitor and limit texture atlas sizes
- Use `OffscreenCanvas` where supported for render pipeline

---

## Mobile Browser Gotchas

### Safari-Specific
- **Audio autoplay blocked** — must start audio on user gesture; Howler.js handles this
- **WebGL memory limits** — Safari is aggressive about killing WebGL contexts; monitor and reduce
- **No WebCodecs before 16.4** — need MediaRecorder fallback
- **IndexedDB can be purged** — never treat it as durable; sync important state to server
- **100vh bug** — use `dvh` (dynamic viewport height) or JavaScript measurement
- **No Badging API** — cannot show notification badges

### Chrome on iOS
- Chrome on iOS uses WebKit under the hood (Apple policy) — behaves like Safari for WebGL, WebCodecs, etc.
- This means Chrome on iPhone = Safari WebKit rendering engine with Chrome UI
- All Safari limitations apply to Chrome on iOS

### Implication
- **On iPhone, there is no way to escape WebKit limitations** — all browsers use the same engine
- Test primarily in Safari; Chrome-on-iOS behavior will be nearly identical
- For Android/desktop, Chrome V8/Blink offers better WebCodecs and WebGPU support

---

## Major Product Requirements

- Guest onboarding (no sign-up required to create)
- Fast entry into creation flow
- Animated landing experience
- Step-by-step builder
- Optional skip for every slot
- Constrained global adjustment mode
- Scene styling mode
- Music selection
- Render/export flow
- Share flow (Web Share API + download fallback)
- Paywall trigger after first successful export/share
- Save draft projects (IndexedDB locally + server sync when account exists)
- Restore purchases (via account login)
- Admin-controlled catalog updates

---

## Major Technical Requirements

- Slot-based composition engine (Zustand state + Three.js scene graph)
- Versioned asset manifests (JSON, CDN-delivered)
- Project save/load model (IndexedDB + backend API)
- Offline-tolerant editing after initial asset download
- Autosave to IndexedDB
- Analytics across the full funnel
- Entitlement caching (short-lived, re-verified on export)
- CDN-backed asset delivery with aggressive caching
- Feature flags
- Remote config
- Moderation/admin controls
- Observability across frontend and backend
- CORS and CSP properly configured
- Mobile viewport and touch handling

---

## Non-Functional Requirements

- Fast startup and time-to-first-edit
- Predictable rendering performance on mid-range iPhones (Safari WebKit)
- Bounded memory usage (< 300 MB to avoid tab eviction)
- Resumable asset loading (handle network interruption gracefully)
- Backward compatibility for older saved projects
- Stable export pipeline across Safari and Chrome
- Responsive layout for phones, tablets, and desktop
- Privacy-aware analytics implementation (GDPR, no PII)
- Scalable content publishing workflow
- Accessibility baseline (semantic HTML, keyboard nav in non-3D UI)

---

## Major Decisions Still Needed

1. **Three.js-only or add Babylon.js as alternative**
   - Recommendation: Three.js via React Three Fiber (larger ecosystem, better React integration)

2. **On-device vs cloud rendering**
   - Recommendation: on-device for V1 (WebCodecs + MediaRecorder fallback)

3. **Anonymous-first or account-first onboarding**
   - Recommendation: anonymous-first, upgrade via email magic link later

4. **How much transform freedom to allow**
   - Recommendation: constrained transforms per slot (unchanged from iOS plan)

5. **One core doll schema or multiple doll template families**
   - Recommendation: one core schema with optional families later

6. **Asset delivery: all-at-once or on-demand**
   - Recommendation: deliver assets on-demand per slot; cache aggressively via Service Worker

7. **Monetization model detail**
   - Recommendation: first free export, then one-time purchase via Stripe (subscriptions later)

8. **Admin tooling scope**
   - Recommendation: lightweight internal CMS/dashboard from early stage

9. **Analytics provider**
   - Recommendation: PostHog (self-hostable, privacy-friendly, generous free tier) or Plausible for page-level + custom events for funnel

10. **Backend scale strategy**
    - Recommendation: modular monolith first, split only when needed

11. **WebGPU adoption timeline**
    - Recommendation: build on WebGL 2.0 for V1; adopt WebGPU when Safari support stabilizes (monitor)

12. **Video export codec/container strategy**
    - Recommendation: target H.264 in MP4 (broadest compatibility for social sharing); WebM as intermediate only

---

## Suggested Phased Roadmap

### Phase 1: Prototype
- One doll template
- 3 to 5 slots
- 20 to 30 assets (GLB, Draco-compressed, KTX2 textures)
- Simple transform constraints
- One scene
- One music track
- Local in-browser render/export (WebCodecs → MP4)
- Web Share API + download fallback
- Simple paywall trigger (Stripe Checkout)
- Guest-only, no account required
- Mobile-first responsive UI
- PWA manifest + Service Worker for asset caching

### Phase 2: MVP
- Full slot taxonomy
- Remote catalog delivery (CDN-backed JSON manifests)
- Cloud-synced saved projects (email magic link accounts)
- Analytics (PostHog or equivalent)
- Stripe subscriptions + asset pack purchases
- Entitlement backend
- Admin content pipeline
- Performance optimization (memory, loading, render time)
- Experiment hooks (A/B paywall, onboarding variants)
- SEO-optimized landing pages
- Shareable gallery links

### Phase 3: Scale
- Premium asset packs
- Seasonal content drops
- More scene templates
- Optional cloud render (server-side) for HD exports
- Onboarding/paywall experiments
- Social/gallery layer (public profiles, featured dolls)
- Android-optimized testing and tuning
- Desktop experience polish
- WebGPU renderer (when browser support is sufficient)
- Optional native iOS/Android wrapper (Capacitor or similar) if App Store presence is desired

---

## Risks to Plan For

- **Video export on Safari is the highest-risk item** — WebCodecs support is newer; MediaRecorder output may not be ideal for Instagram; thorough testing essential
- **Chrome on iOS = WebKit** — there is no way to get better 3D or video performance on iPhone by switching browsers; all browsers on iOS share the same engine
- **3D scan quality** may be inconsistent and require significant cleanup (unchanged risk)
- **Mobile WebGL memory pressure** — Safari is aggressive about evicting WebGL contexts; must monitor and manage carefully
- **Too much customization freedom** can break visual quality (unchanged risk)
- **Mobile texture memory** can spike with large textures; KTX2 compression is essential
- **IndexedDB is not durable** on iOS — data can be purged; important projects need server-side persistence
- **Stripe payment UX on mobile** must be clean and native-feeling; poor checkout = abandoned purchases
- **Catalog compatibility rules** can become hard to manage without strong metadata tooling (unchanged risk)
- **Social sharing friction** — if Web Share API doesn't reliably include video files on target platforms, fallback flow must be polished
- **PWA "Add to Home Screen" adoption** is low; don't over-invest here

---

## Web vs iOS: What Gets Easier, What Gets Harder

### Easier on Web
- Distribution and viral loops (just share a URL)
- Payment economics (Stripe ~3% vs Apple 15–30%)
- Update and content deployment (instant, no review)
- Cross-platform (Android and desktop for free)
- A/B testing and experimentation
- Analytics and funnel instrumentation
- SEO and content marketing

### Harder on Web
- Video export pipeline (no AVFoundation equivalent)
- 3D rendering performance ceiling (WebGL vs Metal/RealityKit)
- Audio handling on mobile Safari (autoplay restrictions)
- Persistent local storage (IndexedDB is lossy)
- Push notifications for re-engagement (limited on iOS)
- "App-like" feel (possible with good PWA work, but never fully native)
- Access to device features (haptics, AR, etc.)

---

## Future Build Prompt

Use the prompt below when you want the next system to generate a proper build spec:

```text
Create a production-ready technical specification for a mobile-first web application that lets users build a customizable virtual doll inside a music box. The app should use React 19 / Next.js 15 / TypeScript for the frontend, Three.js via React Three Fiber for 3D editing/rendering, WebCodecs + mp4-muxer for local video export (with MediaRecorder fallback), Stripe for monetization, Go for the backend API, Redis for cache/job/session state, and PostgreSQL for durable data. 3D assets are in glTF/GLB format with KTX2 textures and Draco compression. The app flow is: animated landing screen, step-by-step doll builder by slots, optional skip for any slot, constrained global adjustment mode, scene decoration, music selection, render short video in-browser, share via Web Share API (download fallback), then paywall via Stripe after the first successful share/export. Include: system architecture, API design, database schema, Redis usage, asset pipeline for 3D scans (to GLB), catalog metadata format, project save/load model (IndexedDB + server sync), Stripe payment and entitlement model, analytics events, admin CMS requirements, CI/CD, observability, mobile browser compatibility matrix, PWA strategy, privacy/security requirements, performance budgets, phased roadmap, engineering risks, and open product decisions. Optimize for mobile Safari/Chrome WebKit performance and constrained but expressive customization.
```

---

## Recommended Next Deliverables

The next useful documents to generate from this brief are:
1. PRD (product requirements document)
2. Technical architecture spec (frontend + backend)
3. Backend API contract
4. Database schema draft
5. Asset metadata schema (GLB + JSON sidecar)
6. Frontend screen map and user flow
7. Video export pipeline technical spike / proof-of-concept plan
8. Stripe integration design
9. Engineering milestone plan
