# Project Handoff — 2026-06-12

Snapshot of the Music Box Doll Builder backend effort for the next session.

## Where the product stands

- **Frontend**: MVP core loop complete, live at `https://lindentar.pashteto.com` (static
  export on **oracle-2**, served by Caddy). Does NOT call the backend yet.
- **Backend (NEW)**: Go modular monolith `dollbuilder` at `webapp-1/backend/`. **Plan 1
  of 4 complete** — first-party email+password auth (argon2id + server-side session
  cookies), Postgres + optional Redis (session cache + login rate-limit). On branch
  `feat/backend-auth` → **PR #3**.
- **Deployed & running** on **oracle-1** at `127.0.0.1:8080` (Postgres+Redis+app, health
  200, auth flow verified end-to-end). **Not yet public** — nginx/TLS/DNS pending.
- Go + all deps updated to latest (Go **1.26.1**, go-openapi 0.32, grpc 1.81, etc.);
  full suite green (21 packages, integration test passes).

## ✅ ACTION REQUIRED FROM YOU (DNS — I can't do this)

Add this record where `pashteto.com` DNS is managed (Namecheap → Advanced DNS, or
wherever its nameservers point):

```
Type: A     Host: api.lindentar     Value: 129.146.183.89     TTL: Automatic
```

This points `api.lindentar.pashteto.com` at oracle-1. Once `dig +short
api.lindentar.pashteto.com` returns the IP, the nginx + TLS steps in
`webapp-1/backend/DEPLOY.md` ("Going public") can finish — then the API is live at
`https://api.lindentar.pashteto.com`.

## Remaining work, in order

1. **Make the backend public** (after DNS): nginx vhost → `127.0.0.1:8080` + `certbot
   --nginx -d api.lindentar.pashteto.com`. Full steps in `webapp-1/backend/DEPLOY.md`.
2. **Plan 2 — Projects sync** (local-first IndexedDB ↔ server, last-write-wins). Not
   started. Spec: `docs/superpowers/specs/2026-06-12-accounts-sync-mocked-paywall-design.md`.
3. **Plan 3 — Entitlements + mocked paywall** (no Stripe; backend endpoint + mock-unlock).
4. **Plan 4 — Frontend wiring** (auth UI, sync module, swap the localStorage entitlement
   stub; set `NEXT_PUBLIC_API_BASE=https://api.lindentar.pashteto.com`).
   Plans 2–4 are written just-in-time (each depends on the prior's real symbol names).

## Known issues / follow-ups

- **oracle-1 Docker is the snap package** and is flaky: can't bind-mount outside `/home`,
  and periodically can't stop/kill containers (`permission denied`) — recover with
  `sudo snap restart docker` then `down`/`up`. **Recommend migrating to `docker-ce`
  (apt)** for reliable ops. Details in `webapp-1/backend/DEPLOY.md`.
- **Generated code (go-swagger/protobuf) is gitignored** → deploy via rsync of a working
  tree where `make generate-all` ran, not a git clone. CI must run `make generate-all`.
- **Pre-existing template JWT stub** still gates the unused `/users` endpoint (will 401 in
  prod). Remove `/users` or migrate it to session auth when convenient.
- Auth-service review follow-ups (non-blocking): `UserByEmail` returns wrapped error
  instead of `(nil,nil)` on not-found; dup-email pre-check has a benign TOCTOU race
  (backstopped by the unique index).

## Key references
- `webapp-1/backend/DEPLOY.md` — deploy runbook + the "going public" steps + Namecheap DNS
- `docs/superpowers/plans/2026-06-12-backend-foundation-auth.md` — the executed Plan 1
- `docs/superpowers/specs/2026-06-12-accounts-sync-mocked-paywall-design.md` — overall design
- PR #3 — the auth backend
