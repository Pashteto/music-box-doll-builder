# Design: Accounts + Server-Side Sync + Mocked Paywall

**Date:** 2026-06-12
**Status:** Approved (design phase)
**Scope:** Backend (Go monolith) + frontend auth/sync + mocked entitlement paywall

## Context

The Music Box Doll Builder frontend MVP core loop is complete and live
(landing → assemble → scene → music → render → share, all in-browser). The
backend does not exist yet. Phase 1 was specified as **guest-only** (anonymous
session UUID, IndexedDB-only, no accounts, no cloud sync).

This work **expands beyond Phase 1**: it introduces real user accounts (email +
password), server-side storage of doll projects, and a paywall backed by a real
entitlement endpoint — with **Stripe mocked** (no payment integration yet). This
is a deliberate, approved scope expansion (login + cloud sync were Phase 2 items
in the original spec).

## Approved Decisions

1. **Auth:** Email + password.
2. **Storage:** Local-first + sync on login (IndexedDB stays primary; sync to
   server when logged in).
3. **Paywall:** Backend entitlement endpoint + mock-unlock (no Stripe).
4. **Sync payload:** Project definition JSON + thumbnail only (no video, no
   object storage).
5. **Session mechanism:** Server-side sessions via httpOnly cookie (not JWT).
6. **Deployment:** Backend on oracle-1 at `api.lindentar.pashteto.com`.
7. **Conflict resolution:** Last-write-wins per project id (by `updatedAt`).

## Architecture

A single Go **modular monolith** built from
`/Users/dodonovpavel/gateway_fm/go-microservice-template` (used as one service,
not microservices — per project CLAUDE.md). Deployed to **oracle-1** (ARM,
7.7 GB RAM — the spec's primary backend box), fronted by Caddy with TLS at
`api.lindentar.pashteto.com`. Postgres + Redis run alongside via docker-compose.

The static frontend stays on oracle-2 (`lindentar.pashteto.com`). The browser
calls the API cross-subdomain; because both are under the same registrable
domain (`pashteto.com`), session cookies are same-site.

```
Browser (lindentar.pashteto.com, static export)
   │  fetch(..., { credentials: 'include' })     CORS: exact-origin allowlist
   ▼
Caddy (TLS, api.lindentar.pashteto.com)
   ▼
Go monolith (oracle-1)
   modules: auth · users · projects · entitlements · health
   ▼
Postgres   +   Redis (session cache + auth rate-limit)
```

### Backend modules (one monolith)

| Module | Responsibility |
|--------|----------------|
| `auth` | signup, login, logout, current-user (`me`), session middleware |
| `users` | user records, lookup by email |
| `projects` | per-user CRUD + sync upsert of doll-project JSON |
| `entitlements` | entitlement check + mock-unlock (Stripe-shaped, mocked) |
| `health` | healthcheck (from template) |

Catalog/manifest endpoint (E15) is **out of scope** — the frontend already
serves its static manifest from `public/catalog/`.

## Auth

- **Hashing:** argon2id for passwords.
- **Endpoints:** signup / login / logout / me.
- **Session:** opaque random token in an **httpOnly, Secure, SameSite=Lax**
  cookie scoped to `.pashteto.com`. Only the token **hash** is stored in the
  Postgres `sessions` table (revocable; no token exposed to JS → XSS-resistant).
- **Rate limiting:** login/signup attempts rate-limited via Redis (brute-force
  protection).

Chosen over JWT because a single backend benefits from trivially revocable,
server-controlled sessions, and avoids token-in-localStorage XSS exposure.

## Storage & Sync (local-first)

- IndexedDB remains the **primary** store. Guests build with no account exactly
  as today (offline-capable).
- **On login:**
  1. Pull the user's server projects.
  2. Merge with local IndexedDB drafts by **last-write-wins per project id**
     (compare `updatedAt`).
  3. Push local-only drafts to the server (guest work is adopted into the
     account).
- **While logged in:** the existing debounced autosave additionally issues
  `PUT /projects/{id}` to the server.
- **Synced payload:** the `DollProject` definition (slots, scene, music,
  duration, currentStep, name) + small thumbnail. **No rendered video** —
  videos stay client-side and can be re-rendered.

### Conflict resolution

Last-write-wins by `updatedAt` timestamp, per project id. Acceptable for MVP;
no field-level merge. (A losing local copy is overwritten by the newer server
copy and vice versa.)

## Paywall (mocked)

- `GET /entitlements` → `{ entitled: bool }` for the **current user** (entitlement
  is now tied to the account, replacing the client-only localStorage stub).
- `POST /entitlements/mock-checkout` → immediately writes an entitlement row with
  `source = 'mock'` and returns success. No payment.
- First-export-free preserved as a per-user flag.
- The frontend paywall flow is built in its **final shape**; introducing real
  Stripe later replaces only the `mock-checkout` endpoint and adds a webhook —
  no frontend rework.

## Data Model (Postgres)

```
users(
  id            uuid pk,
  email         text unique not null,
  password_hash text not null,
  created_at    timestamptz not null default now()
)

sessions(
  id          uuid pk,
  user_id     uuid not null references users(id) on delete cascade,
  token_hash  text not null,
  expires_at  timestamptz not null,
  user_agent  text,
  created_at  timestamptz not null default now()
)

projects(
  id          uuid pk,           -- same id as the client-generated project id
  user_id     uuid not null references users(id) on delete cascade,
  name        text not null,
  data        jsonb not null,    -- the DollProject definition
  thumbnail   text,              -- data URL or small encoded thumb
  updated_at  timestamptz not null,
  created_at  timestamptz not null default now()
)

entitlements(
  id          uuid pk,
  user_id     uuid not null references users(id) on delete cascade,
  product_id  text not null,
  status      text not null,     -- 'active'
  source      text not null,     -- 'mock' (later: 'stripe')
  created_at  timestamptz not null default now()
)
```

Indexes: `projects(user_id)`, `sessions(token_hash)`, `entitlements(user_id)`.

## API

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/v1/auth/signup` | – | Create account, set session cookie |
| POST | `/api/v1/auth/login` | – | Authenticate, set session cookie |
| POST | `/api/v1/auth/logout` | session | Invalidate session |
| GET | `/api/v1/auth/me` | session | Current user |
| GET | `/api/v1/projects` | session | List user's projects |
| GET | `/api/v1/projects/{id}` | session | Fetch one project |
| PUT | `/api/v1/projects/{id}` | session | Upsert (sync push) |
| DELETE | `/api/v1/projects/{id}` | session | Delete project |
| GET | `/api/v1/entitlements` | session | `{ entitled }` |
| POST | `/api/v1/entitlements/mock-checkout` | session | Grant mock entitlement |
| GET | `/api/v1/health` | – | Healthcheck |

## Frontend Changes

- **`auth` module:** login/signup UI, session context/hook (`useSession`),
  calls `credentials: 'include'`. Guest flow remains the default; login is an
  affordance on landing/editor.
- **`sync` module:** merge logic (last-write-wins) + push/pull, invoked on login
  and wired into the existing autosave path.
- **Entitlement swap:** replace the localStorage `useEntitlement` stub with calls
  to `GET /entitlements` and `POST /entitlements/mock-checkout`, keeping the same
  hook interface so `RenderScreen`/`PaywallScreen` are minimally touched.
- An **API base URL** config (`NEXT_PUBLIC_API_BASE`) pointing at
  `https://api.lindentar.pashteto.com`.

## Testing

- **Backend:** table tests for argon2id hash/verify, session create/validate/
  revoke, project upsert + list scoping (user isolation), entitlement
  check/grant, merge edge cases.
- **Frontend:** unit tests for the sync merge (last-write-wins across
  local-only / server-only / conflicting timestamps), and the entitlement hook
  against a mocked API.

## Security & Compliance Notes (org policy)

- Passwords hashed with argon2id; never logged.
- Session cookies: httpOnly + Secure + SameSite=Lax; only token hashes stored.
- All SQL parametrized; least-privilege DB role for the app.
- CORS: exact-origin allowlist (`https://lindentar.pashteto.com`),
  `Access-Control-Allow-Credentials: true`.
- DB/Redis credentials and any signing keys via environment (sourced from the
  secrets store), **never committed**; placeholders in `.env.example`.
- Auth endpoints rate-limited (Redis).
- **Audit awareness:** introducing user accounts means storing PII (email) and
  adding an authentication/access-control surface. This affects access reviews,
  data handling, and change management and should be reflected in the relevant
  ISO 27001 / Vanta documentation. Flagged here, not silently introduced.

## Out of Scope (deferred, YAGNI)

Real Stripe checkout + webhooks (E12 full), analytics (E13), PWA/Service Worker
(E14), OAuth providers, password-reset email, rendered-video upload + R2 object
storage, and the backend catalog/manifest endpoint (E15 — frontend serves its
static manifest).
