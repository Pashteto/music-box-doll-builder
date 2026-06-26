# Handoff — Audio Hardening + Prometheus Observability

**Date:** 2026-06-27
**Branch:** `feat/audio-hardening-prometheus-obs` (local only — **not pushed, no PR, not deployed**)
**Author of this pass:** Claude (Opus 4.8)
**Status:** Code complete + verified locally. Remaining work is integration (PR/merge) and a
human-applied oracle-1 rollout. Nothing Stripe-related was touched.

---

## TL;DR

Two non-Stripe improvements were implemented end-to-end:

1. **Audio robustness** (frontend) — failures in audio preview and render are now surfaced to
   the user instead of failing silently.
2. **Observability** (backend + orchestration) — the Go monolith exposes Prometheus metrics on
   an internal-only port, scraped by a Prometheus container added to the same docker-compose
   project. Includes the two requested safeguards: **TSDB size caps** (metrics volume can't grow
   forever) and **Docker log rotation** (container logs can't fill the host disk).

All tests green: frontend `npm run typecheck` clean + **65 tests pass**; backend `go build ./...`
+ full `go test ./...` pass; both compose files validate with `docker compose config`.

---

## Where everything lives

| Artifact | Path |
|----------|------|
| Design / spec | `webapp-1/docs/superpowers/specs/2026-06-27-audio-hardening-prometheus-obs-design.md` |
| Implementation plan (9 TDD tasks) | `webapp-1/docs/superpowers/plans/2026-06-27-audio-hardening-prometheus-obs.md` |
| Deploy runbook (Prometheus section) | `webapp-1/backend/DEPLOY.md` → "Observability — Prometheus (oracle-1)" |
| nginx vhost template | `webapp-1/deploy/prometheus.nginx.conf` |
| Prometheus scrape config | `webapp-1/backend/deploy/prometheus.yml` |
| This handoff | `webapp-1/docs/superpowers/handoffs/2026-06-27-audio-hardening-prometheus-obs-handoff.md` |

---

## What was done (12 commits on the branch)

Docs:
- `docs(spec)` design + `docs(plan)` plan + `docs(plan)` retention/log-rotation amendment.

Frontend (audio):
- `feat(render): typed audio decode result with fetch timeout + retry` —
  `src/modules/render/audioDecode.ts` now returns `DecodeResult`
  (`{ok:true,audio}` | `{ok:false, reason: 'fetch-failed'|'decode-failed'|'unsupported'}`),
  15s `AbortController` timeout + 1 retry. Tests: `audioDecode.test.ts`.
- `feat(render): warn user when rendering silent video after audio failure` —
  `onWarning` added to `RenderParams`; both `webcodecsPipeline.ts` and
  `mediaRecorderPipeline.ts` call it on fallback; `RenderScreen.tsx` shows an amber banner.
- `feat(music): preview status machine with iOS playerror retry` —
  `useAudioPreview.ts` exposes `status: 'idle'|'loading'|'playing'|'error'`, `errorUrl`,
  retries once on Howler `unlock` after a `playerror` (iOS locked-AudioContext case).
  Tests: `useAudioPreview.test.ts`.
- `feat(music): show loading/error/retry states in track list` — `MusicSelection.tsx`
  renders loading `…` / playing `❚❚` / retry `↻` and a "tap ↻ to retry" hint.

Backend (metrics):
- `feat(metrics): Prometheus HTTP instrumentation middleware` —
  `internal/http/middlewares/metrics.go`: `http_requests_total{method,code}`,
  `http_request_duration_seconds{method,code}`, `http_requests_in_flight`. Labels limited to
  method+code to bound cardinality. Tests: `metrics_test.go`. Added `client_golang` dep.
- `feat(config): MetricsConfig schema + defaults` — `config/scheme.go` + `config/init.go`;
  env `METRICS_ENABLED` (default true), `METRICS_PORT` (default 9100).
- `feat(metrics): internal /metrics listener wired into HTTP module` —
  `internal/http/metrics_server.go` serves `promhttp.Handler()` + `dollbuilder_build_info`
  on its own port; started/stopped in `internal/http/module.go` `Start`/`Stop`; `NewModule`
  gained a `*config.MetricsConfig` arg (call site `internal/application.go`, all
  `module_test.go` call sites updated). Tests: `metrics_server_test.go`.

Orchestration / deploy:
- `feat(obs): Prometheus service in dev+prod compose, size-capped TSDB + log rotation` —
  see "Bounded-growth safeguards" below.
- `docs(obs): nginx vhost template + Prometheus deploy runbook`.

---

## Bounded-growth safeguards (the two requested adds)

- **Prometheus TSDB is size+time capped** so the `promdata` volume plateaus instead of growing
  forever — Prometheus drops the oldest blocks at the cap:
  - prod: `--storage.tsdb.retention.time=15d --storage.tsdb.retention.size=512MB`
  - dev:  `--storage.tsdb.retention.time=7d  --storage.tsdb.retention.size=256MB`
- **Docker log rotation** on every service via a shared `x-logging` anchor
  (`driver: json-file`, `max-size: 10m`, `max-file: 3` → ≤30 MB logs/container) in both
  `docker-compose.yml` and `docker-compose.prod.yml`.

---

## Security / architecture notes (read before deploying)

- `/metrics` is on **port 9100 and is NEVER published to the host** (no `ports:` entry). Only
  Prometheus, on the internal docker network, can reach `app:9100`. Do not add a `ports:` mapping
  for 9100, and do not proxy it through nginx.
- Prometheus UI binds **`127.0.0.1:9090`** (prod) / `127.0.0.1:9091` (dev — dev gRPC owns host
  9090). Public access is only via the nginx vhost with **basic auth + TLS**.
- The basic-auth credential lives only in a server-side `/etc/nginx/.htpasswd-prometheus`
  (never committed; `<REDACTED>` in all committed files).
- This adds a **public endpoint** (`prometheus.*` subdomain) — additive monitoring (good for
  ISO 27001 detective controls) but a change to attack surface: record it in change-management
  / audit notes.

---

## Open TODOs / next steps

### Integration
- [ ] Push branch + open PR against `main` (`gh pr create`). Not done — left for the owner.
- [ ] Code review + merge.

### Deploy to oracle-1 (human-applied — full steps in `backend/DEPLOY.md`)
- [ ] `git pull` on the server, then `docker compose -f docker-compose.prod.yml up -d --build`
      (rebuilds app with the metrics listener, starts Prometheus).
- [ ] Confirm scrape: `curl -s localhost:9090/api/v1/targets | grep dollbuilder` → target
      `app:9100` shows `"health":"up"`.
- [ ] Add DNS A record `prometheus.lindentar.pashteto.com` → oracle-1 (129.146.183.89).
- [ ] `sudo htpasswd -c /etc/nginx/.htpasswd-prometheus <user>` (strong generated password).
- [ ] Install `deploy/prometheus.nginx.conf`, `sudo nginx -t && sudo systemctl reload nginx`.
- [ ] `sudo certbot --nginx -d prometheus.lindentar.pashteto.com`.
- [ ] Verify: `curl -u <user>:<REDACTED> https://prometheus.lindentar.pashteto.com/-/healthy`.
- [ ] Note: oracle-1 runs snap Docker — if `up --build` hits a permission error,
      `sudo snap restart docker` then retry (see the deploy memory / DEPLOY.md gotchas).

### On-device confirmation (the audio work targets iOS Safari quirks)
- [ ] Verify on a real iPhone that the preview `playerror`→`unlock` retry actually recovers
      playback, and that a forced audio-decode failure shows the amber "rendering without audio"
      banner. (Local tests mock Howler/AudioContext; the iOS behavior is the real target.)

### Deferred by design (not in this branch — future work if wanted)
- [ ] DB connection-pool metrics (`db_pool_*` gauges from the pgx pool `Stat()`). Explicitly
      cut from v1 to keep it lean — the hook point is `internal/http/metrics_server.go`.
- [ ] Grafana dashboards + node/cAdvisor exporters (host/container metrics). Out of scope per
      the "Prometheus only" decision.
- [ ] Wire `dollbuilder_build_info` `version` label to a real build version via ldflags
      (currently the constant `"dev"` in `module.go` `Start`).

---

## How to resume / verify locally

```bash
# Frontend
cd webapp-1
npm run typecheck && npm run test          # expect: typecheck clean, 65 tests pass

# Backend
cd webapp-1/backend
go build ./... && go test ./...            # expect: all ok
docker compose -f docker-compose.yml config >/dev/null && \
docker compose -f docker-compose.prod.yml config >/dev/null && echo COMPOSE_OK

# See the work
git checkout feat/audio-hardening-prometheus-obs
git log --oneline main..HEAD
```

Memory updated: `backend-deploy-oracle1` now records the Prometheus obs state (code complete,
deploy pending) for future sessions.
