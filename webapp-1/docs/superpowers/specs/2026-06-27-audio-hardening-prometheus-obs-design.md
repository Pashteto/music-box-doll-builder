# Audio Hardening + Prometheus Observability — Design

**Date:** 2026-06-27
**Branch:** `feat/audio-hardening-prometheus-obs`
**Status:** Approved (design), pending spec review

## Summary

Two independent improvements to the Music Box Doll Builder, neither touching Stripe/paywall:

1. **Audio robustness** (frontend) — harden the already-Howler-based preview and the
   Web Audio render-decode paths so failures are surfaced (loading/error states, no
   silent-video-without-warning), with timeouts/retry and tests.
2. **Observability** (backend + orchestration) — add Prometheus metrics to the Go
   monolith and run a **Prometheus** instance in the same `docker-compose` orchestration
   on oracle-1. No Grafana, no host/container exporters in v1.

Out of scope: Grafana, exporters (node/cAdvisor), OpenTelemetry tracing, Sentry,
PostHog analytics, and anything Stripe-related.

## Decisions (locked)

| Topic | Decision |
|-------|----------|
| Observability scope | **Prometheus only** (no Grafana/exporters in v1) |
| Prometheus UI access | **Public subdomain** `prometheus.lindentar.pashteto.com`, nginx + basic auth + TLS |
| `/metrics` exposure | **Internal docker network only** — separate app port `9100`, never published to host, never via nginx |
| Audio scope | **Both** preview playback + render-time decode |
| DB pool metrics | **Deferred** (keep v1 lean; clearly-marked stretch item) |
| Deploy execution | **Code + committed config templates + runbook**; human applies DNS/TLS/nginx/redeploy on oracle-1 |

## Current state (verified)

- Preview uses **Howler.js** (`src/modules/music/useAudioPreview.ts`), `html5: true`
  (correct for iOS Safari). It ignores Howler's `load`/`loaderror`/`playerror` events,
  so a failed load or a locked-AudioContext `playerror` leaves the UI stuck on "playing"
  with silence, no retry, no feedback, no loading state.
- Render decode (`src/modules/render/audioDecode.ts`) uses Web Audio
  `decodeAudioData` with a `webkitAudioContext` fallback, but a bare
  `catch { return null }` means a failed fetch/decode silently produces a **silent
  video** with no user warning and no log. No fetch timeout, no retry.
- Backend (`module dollbuilder`, Go 1.26.1) is a **go-swagger** generated server on a
  single port (8080), with a `justinas/alice` middleware chain assembled in
  `internal/http/module.go` (Recovery → Logger → Cors → RateLimit → [StripeWebhook] →
  SessionAuth → `api.Serve`). **No metrics/OTel of any kind today.**
- oracle-1 fronts the API with **nginx + certbot** (Let's Encrypt), proxying
  `api.lindentar.pashteto.com` → `127.0.0.1:8080`. Prod orchestration is
  `backend/docker-compose.prod.yml` (Postgres + Redis + app; app bound to loopback;
  no host-exposed DB/Redis ports).

---

## Part A — Audio robustness (frontend)

### A1. Preview playback — `src/modules/music/useAudioPreview.ts`

Introduce an explicit per-URL status machine and wire Howler's lifecycle events.

- Status type: `'idle' | 'loading' | 'playing' | 'error'`.
- On `toggle(url)`: set `loading`, construct the `Howl`, and register:
  - `on('load')` → if still the active url, `playing`.
  - `on('play')` → `playing`.
  - `on('end')` → back to `idle` (existing behaviour).
  - `on('loaderror', ...)` → `error` for that url.
  - `on('playerror', ...)` → attempt one recovery: `howl.once('unlock', () => howl.play())`
    (handles the iOS locked-AudioContext case); if it still fails, `error`.
- Return shape: `{ status, activeUrl, errorUrl, toggle, stop }` (superset of today's
  `{ playingUrl, toggle, stop }`; keep a `playingUrl` alias derived from
  `status === 'playing' ? activeUrl : null` to avoid churn in `MusicSelection.tsx`).
- Cleanup unchanged (stop + unload on unmount / before switching track).

### A2. Render-time decode — `src/modules/render/audioDecode.ts`

Replace the silent failure with a typed result and resilience.

- New return type:
  ```ts
  type DecodeResult =
    | { ok: true; audio: DecodedAudio }
    | { ok: false; reason: 'fetch-failed' | 'decode-failed' | 'unsupported' }
  ```
- `fetch` wrapped in an `AbortController` with a ~15s timeout; **one retry** on
  network/timeout failure before returning `{ ok: false, reason: 'fetch-failed' }`.
- `decodeAudioData` failure → `{ ok: false, reason: 'decode-failed' }`.
- Missing `AudioContext`/`webkitAudioContext` → `{ ok: false, reason: 'unsupported' }`.
- Keep the existing `webkitAudioContext` fallback and the loop/trim-to-duration logic.

### A3. Render caller behaviour

The render pipeline caller (where `decodeAudioToDuration` is consumed) must:
- On `ok: false`, **proceed to render a silent video but warn the user explicitly**
  (e.g. "Music couldn't be added — rendering without audio") and `console.warn` the
  reason. No more silent audio drop.
- On `ok: true`, behave exactly as today.

### A4. Tests (Vitest)

- Preview status transitions: `loading → playing` on load/play; `playerror → (unlock
  retry) → playing`; `playerror → error` when retry fails; `loaderror → error`.
  (Howler mocked.)
- Decode: returns `fetch-failed` on rejected/aborted fetch (with retry exhausted),
  `decode-failed` on `decodeAudioData` throw, `unsupported` when no AudioContext, and
  `ok:true` with correct tiling to the requested duration on success.

---

## Part B — Backend metrics (Go)

New dependency: `github.com/prometheus/client_golang`.

### B1. Instrumentation middleware — `internal/http/middlewares/metrics.go`

An `alice.Constructor` inserted high in the chain in `module.go` (after `Recovery()`,
around `Logger()`), wrapping the response writer to capture status code and duration.

Metrics (labels deliberately limited to keep cardinality bounded — **no raw-path
label**, since IDs in paths would explode series count):

- `http_requests_total{method, code}` — counter
- `http_request_duration_seconds{method, code}` — histogram (default buckets)
- `http_requests_in_flight` — gauge

Plus the `client_golang` default collectors registered once at startup:

- Go runtime collector (goroutines, GC, heap)
- Process collector (CPU seconds, open FDs, resident memory)
- `dollbuilder_build_info{version}` — a static gauge (best-effort version string)

**Deferred (stretch):** `db_pool_*` gauges from the pgx pool `Stat()`. Not in v1.

### B2. Separate internal metrics listener

`/metrics` is **not** added to the 8080 API mux. Instead a small dedicated
`http.Server` serves `promhttp.Handler()` on its own port:

- Config: `METRICS_ENABLED` (default true in prod), `METRICS_PORT` (default `9100`),
  bound to `0.0.0.0` **inside the container**.
- Because port `9100` is **never published to the host** (no `ports:` entry), it is
  reachable only on the docker network. Prometheus scrapes `app:9100/metrics`. It is
  structurally unreachable via nginx or the public internet.
- Implemented as a tiny new module (preferred) or a goroutine started from the http
  module's `Start`, with graceful shutdown on `Stop`.

Config plumbing follows the template's existing viper config pattern (new `MetricsConfig`
struct + env mapping, mirroring how `HTTPConfig`/`CacheConfig` are wired).

---

## Part C — Prometheus in the orchestration

### C1. Compose service

Add a `prometheus` service to `backend/docker-compose.prod.yml` (and mirror a minimal
version in the dev `docker-compose.yml`):

- Image: `prom/prometheus` (multi-arch — runs on the oracle-1 ARM box).
- `restart: unless-stopped`.
- Mounts `./deploy/prometheus.yml` (read-only) for scrape config.
- Named volume `promdata` for the TSDB.
- Flags (disk-constrained box — `/home` only): `--storage.tsdb.retention.time=15d`
  `--storage.tsdb.retention.size=512MB` plus the config-file flag.
- UI port published to **`127.0.0.1:9090`** on the host (loopback only; nginx proxies it).
- Same docker network as `app` so it can scrape `app:9100`.

### C2. Scrape config — `deploy/prometheus.yml` (committed)

- `scrape_interval: 15s`.
- Job `dollbuilder` → target `app:9100`.
- Job `prometheus` → self (`localhost:9090`).

### C3. nginx vhost — `deploy/prometheus.nginx.conf` (committed template)

- `server_name prometheus.lindentar.pashteto.com`.
- `proxy_pass http://127.0.0.1:9090` with standard proxy headers.
- `auth_basic "Prometheus";` + `auth_basic_user_file /etc/nginx/.htpasswd-prometheus`.
- TLS obtained on the server via `certbot --nginx -d prometheus.lindentar.pashteto.com`
  (certbot rewrites the vhost to 443 + 80→443 redirect).
- The committed file uses placeholders only; **no secrets**.

---

## Security / compliance notes

- The htpasswd file (`/etc/nginx/.htpasswd-prometheus`) is generated **on the server**
  and **never committed**. All committed configs/docs use `<REDACTED>` placeholders.
  Recommend a strong generated password.
- This **adds a public endpoint** (`prometheus.*` subdomain). It is additive monitoring
  (supports ISO 27001 detective controls) but is a change to attack surface — note it in
  change-management/audit docs. Mitigations: TLS + basic auth, loopback-bound upstream,
  metrics endpoint never public.
- The nginx vhost, htpasswd, certbot, and DNS A record are **manual server steps** —
  an IaC exception (no Terraform in this repo). Mitigated by committing the configs as
  documented, reproducible templates plus a runbook.
- No changes to existing API CORS/auth/TLS. No DB migration.

## Rollout / runbook (human-applied on oracle-1)

1. Merge code; on the server `git pull`.
2. `docker compose -f docker-compose.prod.yml up -d --build` (rebuilds app with metrics
   listener + starts prometheus).
3. Add DNS A record `prometheus.lindentar.pashteto.com` → oracle-1.
4. Generate basic-auth creds: `htpasswd -c /etc/nginx/.htpasswd-prometheus <user>`.
5. Install the nginx vhost from `deploy/prometheus.nginx.conf`, `nginx -t`, reload.
6. `certbot --nginx -d prometheus.lindentar.pashteto.com`.
7. Verify: `curl -u <user>:<REDACTED> https://prometheus.lindentar.pashteto.com/-/healthy`
   and confirm the `dollbuilder` target is UP in the Prometheus targets page.

## Testing strategy

- Frontend: Vitest units for A1/A2 (mock Howler, mock fetch/AudioContext).
- Backend: a unit test asserting `/metrics` (on the metrics listener) returns 200 and
  contains `http_requests_total` after a request flows through the middleware; middleware
  records status/duration correctly.
- Manual: `docker compose up` locally, hit the API, confirm Prometheus scrapes `app:9100`
  and series appear.

## Files touched (anticipated)

**Frontend**
- `src/modules/music/useAudioPreview.ts` (rework)
- `src/modules/music/MusicSelection.tsx` (loading/error UI)
- `src/modules/render/audioDecode.ts` (typed result + retry/timeout)
- render caller (warn-on-silent) — exact file TBD during planning
- new `*.test.ts` files

**Backend**
- `internal/http/middlewares/metrics.go` (new)
- `internal/http/module.go` (insert metrics middleware)
- metrics listener module + config wiring (new)
- `go.mod` / `go.sum` (client_golang)
- new `*_test.go`

**Orchestration / deploy**
- `backend/docker-compose.prod.yml`, `backend/docker-compose.yml` (prometheus service)
- `deploy/prometheus.yml` (new)
- `deploy/prometheus.nginx.conf` (new template)
- `backend/DEPLOY.md` (runbook section)
