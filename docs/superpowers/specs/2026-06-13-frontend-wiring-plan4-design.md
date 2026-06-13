# Design: Frontend Wiring (Plan 4 of 4)

**Date:** 2026-06-13
**Status:** Approved (design phase)
**Scope:** Frontend only — wire the live `dollbuilder` backend into the static
Next.js app: real auth, local-first project sync, and the mocked-paywall
entitlement swap. Thumbnail capture added so synced projects carry a preview.

## Context

This is the fourth and final plan of the Accounts + Sync + Mocked-Paywall effort
(parent design: `docs/superpowers/specs/2026-06-12-accounts-sync-mocked-paywall-design.md`).

Prior plans, all **done and deployed** to `https://api.lindentar.pashteto.com`:

- **Plan 1 — auth backend:** `/auth/signup|login|logout|me`, argon2id, server-side
  session cookies (PR #3, #5).
- **Plan 2 — projects sync backend:** per-user `/projects` CRUD + upsert,
  last-write-wins (PR #4).
- **Plan 3 — entitlements backend:** `/entitlements` + `/entitlements/mock-checkout`.
  **NOT built yet.**

Per the user's explicit decision, Plan 4 builds **all three** frontend pieces now.
The entitlement swap is coded against the **documented `/entitlements` contract**
from the parent design (`GET /entitlements → { entitled }`,
`POST /entitlements/mock-checkout`); it will not work end-to-end until the Plan 3
backend is deployed, but the frontend ships in its final shape.

### Hard constraint: static export

The frontend is `output: 'export'` (`next.config.ts`) — **no Node server, no SSR,
no Next API routes**. All auth/sync is client-side `fetch(..., { credentials:
'include' })` cross-subdomain to the API. Both app and API sit under
`pashteto.com`, so the session cookie (`.pashteto.com`, SameSite=Lax) is sent on
those requests. There is no existing API client; one is introduced here.

## Approved Decisions

1. **Scope:** Full Plan 4 (auth + sync + entitlement swap), entitlement coded
   against the documented Plan 3 contract (not yet deployed).
2. **Auth UI:** Dedicated statically-exported routes `/login` and `/signup`
   (App Router), with a `?next=` return param. Guest flow stays the default;
   login is an affordance.
3. **First-export-free gate:** Stays **client-side** (`localStorage`, per-device).
   Server supplies only `entitled`. `canExport = !firstExportUsed || entitled`.
   Unchanged contract, accepted "one free export per device" for the MVP.
4. **Thumbnails:** Generated now. Capture a downscaled JPEG data-URL from the
   live R3F canvas (`preserveDrawingBuffer: true` is already set on `<Canvas>`)
   and include it in the autosave snapshot + sync payload.
5. **State / structure:** Thin typed API client + a Zustand `session` slice +
   a dedicated `sync` module — matching the codebase's existing
   Zustand-slice + per-feature-module idiom. (Chosen over React Context or a
   data-fetching library; lowest-friction fit, YAGNI.)

## Architecture

```
/login, /signup (static routes) ──┐
                                   ▼
src/store/sessionSlice.ts  ──►  src/lib/api.ts  ──fetch(credentials:'include')──►  api.lindentar.pashteto.com
       ▲                            ▲
       │                            │
src/modules/sync/useSync.ts ────────┤   (merge.ts: pure LWW)
src/store/entitlementSlice.ts ──────┤
src/modules/storage/useAutosave.ts ─┘   (+ thumbnail.ts capture)
```

IndexedDB remains the **primary** store. The server is a sync target layered on
top; every server interaction is best-effort and never blocks the guest creation
flow.

## Components

| New / changed | Responsibility |
|---|---|
| `src/lib/api.ts` *(new)* | `apiFetch(path, opts)`: prepends `NEXT_PUBLIC_API_BASE`, sets `credentials:'include'` + JSON headers, throws typed `ApiError { status, body }` on non-2xx. Typed wrappers `authApi`, `projectsApi`, `entitlementsApi`. |
| `src/store/sessionSlice.ts` *(new)* | Zustand slice: `user, sessionLoading`; `signup/login/logout` (call `authApi`), `fetchMe` (hydrate on mount). `useSession()` selector. |
| `src/app/login/page.tsx`, `src/app/signup/page.tsx` *(new)* | Static route pages; email+password form; on success redirect to `?next=` (default `/editor`). Inline error messages. |
| `src/modules/sync/merge.ts` *(new)* | Pure last-write-wins: `(local, server) → { toApply, toPush }` by `updatedAt` per project id. No I/O. |
| `src/modules/sync/useSync.ts` *(new)* | On login: `GET /projects` → `merge` → write winners to IndexedDB → `PUT` local-only/newer drafts. |
| `src/modules/storage/thumbnail.ts` *(new)* | `captureThumbnail()`: read live canvas, downscale to a small JPEG data-URL via an offscreen 2D canvas. |
| `src/modules/storage/useAutosave.ts` *(edit)* | Snapshot now includes a captured thumbnail. When logged in, the debounced flush additionally `PUT`s to the server (best-effort). |
| `src/store/entitlementSlice.ts` *(edit)* | `checkEntitlement` body: stub → `GET /entitlements`. Add `mockCheckout` → `POST /entitlements/mock-checkout`. **Hook interface unchanged.** Client first-free gate retained. |
| `src/modules/paywall/PaywallScreen.tsx` *(edit)* | Wire "Unlock" → `mockCheckout`; if unauthenticated, redirect to `/login?next=/editor`. |
| `next config / .env.example` *(edit/new)* | `NEXT_PUBLIC_API_BASE=https://api.lindentar.pashteto.com`. |

The clean seams already exist: `useExportGate`/`entitlementSlice` isolate
entitlement behind a stable hook interface, and `useAutosave` is the single
sync hook-in point — so `RenderScreen`/`PaywallScreen` are minimally touched.

## Data Flow

- **Load:** `fetchMe()` on app mount populates the session. If authed, `useSync`
  pulls + merges once.
- **Edit (logged in):** store change → debounced autosave → IndexedDB write **and**
  `PUT /projects/{id}` (definition JSON + thumbnail).
- **Export gate:** `canExport = !firstExportUsed || entitled`, `entitled` from
  server. Unlock → `mockCheckout` → re-`checkEntitlement`.
- **Guest:** unchanged — no network, IndexedDB-only, fully offline-capable.

## Sync & Conflict Resolution

Last-write-wins per project id by `updatedAt` (per parent design). On login:
pull server projects, merge with local IndexedDB drafts (newer `updatedAt` wins
per id), then push local-only and locally-newer drafts. No field-level merge.
Synced payload = `DollProject` definition + small thumbnail; **no rendered video**.

## Error Handling

- `api.ts` throws typed `ApiError`; auth pages surface inline messages for bad
  credentials, duplicate email, and rate-limit (429).
- Sync and server autosave are **best-effort**: failures are swallowed (a
  backend hiccup never blocks creation; IndexedDB stays source of truth).
- Entitlement check on network failure falls back to the client gate
  (`entitled=false`) and never crashes the render screen.

## Testing

- **Pure unit:** `merge.ts` across local-only / server-only / conflicting-
  `updatedAt` cases.
- **Hook tests (mocked `api`):** `entitlementSlice` (entitled / not entitled /
  mock-checkout), session login/logout, `useSync` push/pull orchestration.
- **Thumbnail:** unit test the downscale helper with a stub canvas.
- **No backend integration for the entitlement path** (Plan 3 not deployed) —
  noted explicitly. Auth + projects paths can be smoke-tested against the live API.

## Security & Compliance Notes (org policy)

- Session cookie is httpOnly + Secure + SameSite=Lax, set/cleared by the backend;
  never read from JS (XSS-resistant). Frontend only sends `credentials:'include'`.
- No secrets in the frontend. `NEXT_PUBLIC_API_BASE` is a public URL, not a
  credential. `.env.example` documents it; real value via build env.
- Passwords sent only over HTTPS to the API; never logged or persisted client-side.
- **Audit awareness:** this is the surface that exposes the new account/auth
  system to end users (login UI, PII entry). The access-control and data-handling
  implications were flagged in the parent design; no new controls are disabled here.

## Out of Scope (deferred, YAGNI)

Real Stripe checkout + webhooks, OAuth providers, password-reset email,
rendered-video upload + R2 storage, and the three.js visual-enhancement track
(IBL/post-processing — separate follow-up spec). Plan 3 entitlements **backend**
remains a separate plan; this frontend is built to its documented contract.
