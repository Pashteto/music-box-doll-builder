# Audio Hardening + Prometheus Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface audio failures to the user (preview + render) instead of silent failure, and expose Prometheus metrics from the Go backend scraped by a Prometheus instance in the same docker-compose orchestration.

**Architecture:** Frontend — convert the render audio decoder to a typed result with timeout/retry and thread a warning callback through both render pipelines to the render UI; give the Howler-based preview an explicit status machine wired to Howler's lifecycle events. Backend — a Prometheus instrumentation middleware in the existing `justinas/alice` chain plus a dedicated `/metrics` HTTP listener on an internal-only port (9100), scraped by a `prom/prometheus` compose service whose UI sits behind nginx basic-auth + TLS.

**Tech Stack:** TypeScript/React (Vitest), Howler.js, Web Audio/WebCodecs; Go 1.26 (`github.com/prometheus/client_golang`), go-swagger + alice; docker-compose, Prometheus, nginx + certbot.

## Global Constraints

- Frontend: TypeScript strict mode; tests use Vitest (`npm run test`); run from `webapp-1/`.
- Backend module path is `dollbuilder`; Go 1.26.1; tests via `go test ./...` run from `webapp-1/backend/`.
- Backend env vars map config keys with `.`→`_` (viper `SetEnvKeyReplacer` + `AutomaticEnv`): `metrics.enabled`→`METRICS_ENABLED`, `metrics.port`→`METRICS_PORT`.
- `/metrics` MUST NOT be published to the host or reachable via nginx — internal docker network only (port `9100`, never in a compose `ports:` list).
- Metrics labels limited to `method` + `code` — never raw request path (cardinality).
- No secrets committed: nginx basic-auth uses a server-side htpasswd; all committed files use `<REDACTED>` placeholders.
- Prod Prometheus UI binds `127.0.0.1:9090`; dev binds `127.0.0.1:9091` (dev gRPC already owns host `9090`).
- Deploy steps on oracle-1 (DNS/htpasswd/certbot/nginx/redeploy) are human-applied via the runbook — not executed by the implementer.

---

### Task 1: Render audio decoder → typed result with timeout + retry

**Files:**
- Modify: `webapp-1/src/modules/render/audioDecode.ts`
- Test: `webapp-1/src/modules/render/audioDecode.test.ts` (create)

**Interfaces:**
- Produces: `decodeAudioToDuration(url: string, durationSeconds: number): Promise<DecodeResult>` where
  `type DecodeResult = { ok: true; audio: DecodedAudio } | { ok: false; reason: 'fetch-failed' | 'decode-failed' | 'unsupported' }`.
  `DecodedAudio` keeps its current shape (`sampleRate`, `channelData: Float32Array[]`, `numberOfChannels`, `numberOfFrames`).

- [ ] **Step 1: Write the failing test**

```ts
// webapp-1/src/modules/render/audioDecode.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { decodeAudioToDuration } from '@/modules/render/audioDecode'

class FakeAudioBuffer {
  constructor(
    public sampleRate: number,
    public numberOfChannels: number,
    private data: Float32Array,
  ) {}
  getChannelData() {
    return this.data
  }
}

function installAudioContext(decode: () => Promise<unknown>) {
  ;(globalThis as unknown as { AudioContext: unknown }).AudioContext = class {
    decodeAudioData = decode
    close = vi.fn()
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  delete (globalThis as unknown as { AudioContext?: unknown }).AudioContext
  delete (globalThis as unknown as { webkitAudioContext?: unknown }).webkitAudioContext
})

describe('decodeAudioToDuration', () => {
  it('returns unsupported when no AudioContext exists', async () => {
    const res = await decodeAudioToDuration('a.mp3', 10)
    expect(res).toEqual({ ok: false, reason: 'unsupported' })
  })

  it('returns fetch-failed after retry exhausted', async () => {
    installAudioContext(() => Promise.resolve(new FakeAudioBuffer(48000, 1, new Float32Array(10))))
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
    const res = await decodeAudioToDuration('a.mp3', 10)
    expect(res).toEqual({ ok: false, reason: 'fetch-failed' })
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2) // initial + 1 retry
  })

  it('returns decode-failed when decodeAudioData throws', async () => {
    installAudioContext(() => Promise.reject(new Error('bad data')))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }))
    const res = await decodeAudioToDuration('a.mp3', 10)
    expect(res).toEqual({ ok: false, reason: 'decode-failed' })
  })

  it('tiles a short buffer to the requested duration on success', async () => {
    const src = new Float32Array([1, 2, 3]) // 3 frames
    installAudioContext(() => Promise.resolve(new FakeAudioBuffer(10, 1, src)))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }))
    const res = await decodeAudioToDuration('a.mp3', 1) // 10 frames target
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.audio.numberOfFrames).toBe(10)
      expect(Array.from(res.audio.channelData[0]!)).toEqual([1, 2, 3, 1, 2, 3, 1, 2, 3, 1])
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd webapp-1 && npm run test -- audioDecode`
Expected: FAIL — current `decodeAudioToDuration` returns `DecodedAudio | null`, not `DecodeResult` (assertions on `.ok` fail).

- [ ] **Step 3: Write the implementation**

Replace the entire contents of `webapp-1/src/modules/render/audioDecode.ts` with:

```ts
// Decode a music track and tile/trim it to an exact duration (shared by both pipelines).

export interface DecodedAudio {
  sampleRate: number
  channelData: Float32Array[] // one Float32Array per channel
  numberOfChannels: number
  numberOfFrames: number
}

export type DecodeFailureReason = 'fetch-failed' | 'decode-failed' | 'unsupported'

export type DecodeResult =
  | { ok: true; audio: DecodedAudio }
  | { ok: false; reason: DecodeFailureReason }

const FETCH_TIMEOUT_MS = 15_000
const FETCH_ATTEMPTS = 2 // initial + 1 retry

async function fetchArrayBufferWithRetry(url: string): Promise<ArrayBuffer> {
  let lastErr: unknown
  for (let attempt = 0; attempt < FETCH_ATTEMPTS; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      const res = await fetch(url, { signal: controller.signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.arrayBuffer()
    } catch (err) {
      lastErr = err
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastErr
}

/** Fetch + decode an audio URL, then loop/trim it to exactly `durationSeconds`. */
export async function decodeAudioToDuration(
  url: string,
  durationSeconds: number,
): Promise<DecodeResult> {
  const Ctx: typeof AudioContext | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctx) return { ok: false, reason: 'unsupported' }

  let arr: ArrayBuffer
  try {
    arr = await fetchArrayBufferWithRetry(url)
  } catch {
    return { ok: false, reason: 'fetch-failed' }
  }

  const ctx = new Ctx()
  try {
    const buffer = await ctx.decodeAudioData(arr)
    const sampleRate = buffer.sampleRate
    const numberOfChannels = buffer.numberOfChannels
    const targetFrames = Math.floor(sampleRate * durationSeconds)

    const channelData: Float32Array[] = []
    for (let ch = 0; ch < numberOfChannels; ch++) {
      const src = buffer.getChannelData(ch)
      const out = new Float32Array(targetFrames)
      if (src.length > 0) {
        for (let i = 0; i < targetFrames; i++) out[i] = src[i % src.length]!
      }
      channelData.push(out)
    }

    return { ok: true, audio: { sampleRate, channelData, numberOfChannels, numberOfFrames: targetFrames } }
  } catch {
    return { ok: false, reason: 'decode-failed' }
  } finally {
    void ctx.close()
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd webapp-1 && npm run test -- audioDecode`
Expected: PASS (4 tests). Then `npm run typecheck` — note it will FAIL in `webcodecsPipeline.ts` because the caller still expects the old return type; that is fixed in Task 2. Do not fix it here.

- [ ] **Step 5: Commit**

```bash
git add webapp-1/src/modules/render/audioDecode.ts webapp-1/src/modules/render/audioDecode.test.ts
git commit -m "feat(render): typed audio decode result with fetch timeout + retry"
```

---

### Task 2: Thread audio-failure warning through pipelines to the render UI

**Files:**
- Modify: `webapp-1/src/modules/render/renderTypes.ts`
- Modify: `webapp-1/src/modules/render/webcodecsPipeline.ts:11,21,26` (decode consumption)
- Modify: `webapp-1/src/modules/render/mediaRecorderPipeline.ts:23-41` (decode fallback)
- Modify: `webapp-1/src/modules/render/RenderScreen.tsx:117-146,166+` (pass callback + show warning)

**Interfaces:**
- Consumes: `DecodeResult` from Task 1.
- Produces: `RenderParams.onWarning?: (message: string) => void`, invoked once with a user-facing string when a render proceeds without audio because decode/attach failed.

- [ ] **Step 1: Add `onWarning` to RenderParams**

In `webapp-1/src/modules/render/renderTypes.ts`, add to the `RenderParams` interface (after `onProgress`):

```ts
  onProgress?: (fraction: number) => void
  /** Called when the render proceeds without audio due to a decode/attach failure. */
  onWarning?: (message: string) => void
```

- [ ] **Step 2: Consume the typed result in the WebCodecs pipeline**

In `webapp-1/src/modules/render/webcodecsPipeline.ts`, change the destructure on line 11 to include `onWarning`:

```ts
  const { width, height, fps, durationSeconds, audioUrl, drawFrame, onProgress, onWarning } = params
```

Replace line 21 (the `const decoded = ...` line) with:

```ts
  // Pre-decode audio so we know the channel count for the muxer config.
  const decodeResult = wantAudio ? await decodeAudioToDuration(audioUrl!, durationSeconds) : null
  if (decodeResult && !decodeResult.ok) {
    console.warn(`[render] audio decode failed (${decodeResult.reason}); rendering silent video`)
    onWarning?.("Music couldn't be added — rendering without audio.")
  }
  const decoded = decodeResult?.ok ? decodeResult.audio : null
```

The rest of the file already branches on `decoded` being truthy — no other change needed.

- [ ] **Step 3: Warn on fallback in the MediaRecorder pipeline**

In `webapp-1/src/modules/render/mediaRecorderPipeline.ts`, change the destructure on line 7 to include `onWarning`:

```ts
  const { fps, durationSeconds, audioUrl, drawFrame, onProgress, onWarning } = params
```

Replace the `catch { hasAudio = false }` block (lines 38-40) with:

```ts
    } catch {
      hasAudio = false
      console.warn('[render] audio attach failed; rendering silent video')
      onWarning?.("Music couldn't be added — rendering without audio.")
    }
```

- [ ] **Step 4: Surface the warning in RenderScreen**

In `webapp-1/src/modules/render/RenderScreen.tsx`:

(a) Add warning state near the other `useState` calls (just after the `error` state declaration):

```tsx
  const [warning, setWarning] = useState<string | null>(null)
```

(b) In `runRender()`, after `setError(null)` (line 106), add `setWarning(null)`, and add `onWarning` to the `params` object (after `onProgress`):

```tsx
        onProgress: (f: number) => setProgress(f),
        onWarning: (msg: string) => setWarning(msg),
```

(c) Render the banner — add this just inside the outer returned `<div>` (after line 167's opening div), so it shows alongside the result:

```tsx
      {warning ? (
        <div role="status" className="rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900">
          {warning}
        </div>
      ) : null}
```

- [ ] **Step 5: Verify typecheck + existing tests pass**

Run: `cd webapp-1 && npm run typecheck && npm run test`
Expected: PASS (typecheck clean now that the caller matches Task 1's type; existing render tests unaffected).

- [ ] **Step 6: Commit**

```bash
git add webapp-1/src/modules/render/renderTypes.ts webapp-1/src/modules/render/webcodecsPipeline.ts webapp-1/src/modules/render/mediaRecorderPipeline.ts webapp-1/src/modules/render/RenderScreen.tsx
git commit -m "feat(render): warn user when rendering silent video after audio failure"
```

---

### Task 3: Preview audio status machine wired to Howler events

**Files:**
- Modify: `webapp-1/src/modules/music/useAudioPreview.ts`
- Test: `webapp-1/src/modules/music/useAudioPreview.test.ts` (create)

**Interfaces:**
- Produces: `useAudioPreview()` returns `{ status: PreviewStatus, activeUrl: string | null, errorUrl: string | null, playingUrl: string | null, toggle: (url: string) => void, stop: () => void }` where `type PreviewStatus = 'idle' | 'loading' | 'playing' | 'error'`. `playingUrl` is kept as a derived alias (`status === 'playing' ? activeUrl : null`) for existing consumers.

- [ ] **Step 1: Write the failing test**

```ts
// webapp-1/src/modules/music/useAudioPreview.test.ts
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Controllable Howl mock: capture event handlers so the test can fire them.
const handlers: Record<string, Array<(...a: unknown[]) => void>> = {}
const playSpy = vi.fn()
vi.mock('howler', () => ({
  Howl: vi.fn().mockImplementation(() => ({
    on: (ev: string, cb: (...a: unknown[]) => void) => {
      ;(handlers[ev] ??= []).push(cb)
    },
    once: (ev: string, cb: (...a: unknown[]) => void) => {
      ;(handlers[ev] ??= []).push(cb)
    },
    play: playSpy,
    stop: vi.fn(),
    unload: vi.fn(),
  })),
}))

function fire(ev: string) {
  for (const cb of handlers[ev] ?? []) cb()
}

import { useAudioPreview } from '@/modules/music/useAudioPreview'

beforeEach(() => {
  for (const k of Object.keys(handlers)) delete handlers[k]
  playSpy.mockClear()
})
afterEach(() => vi.clearAllMocks())

describe('useAudioPreview', () => {
  it('goes loading → playing on play event', () => {
    const { result } = renderHook(() => useAudioPreview())
    act(() => result.current.toggle('a.mp3'))
    expect(result.current.status).toBe('loading')
    act(() => fire('play'))
    expect(result.current.status).toBe('playing')
    expect(result.current.playingUrl).toBe('a.mp3')
  })

  it('retries once on playerror via unlock, then plays', () => {
    const { result } = renderHook(() => useAudioPreview())
    act(() => result.current.toggle('a.mp3'))
    act(() => fire('playerror'))
    act(() => fire('unlock'))
    expect(playSpy).toHaveBeenCalledTimes(2) // initial + unlock retry
  })

  it('goes to error on loaderror', () => {
    const { result } = renderHook(() => useAudioPreview())
    act(() => result.current.toggle('a.mp3'))
    act(() => fire('loaderror'))
    expect(result.current.status).toBe('error')
    expect(result.current.errorUrl).toBe('a.mp3')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd webapp-1 && npm run test -- useAudioPreview`
Expected: FAIL — `status`/`errorUrl` are undefined on the current hook return.

- [ ] **Step 3: Write the implementation**

Replace the entire contents of `webapp-1/src/modules/music/useAudioPreview.ts` with:

```ts
'use client'

import { useEffect, useRef, useState } from 'react'
import { Howl } from 'howler'

export type PreviewStatus = 'idle' | 'loading' | 'playing' | 'error'

/**
 * Single-track audio preview (E9-T2). Playback starts inside a user gesture
 * (mobile Safari autoplay policy). On a `playerror` (typically a locked
 * AudioContext on iOS), we retry once on Howler's `unlock` event before giving
 * up. Howler is loaded only on the music screen (kept off the landing bundle).
 */
export function useAudioPreview() {
  const howlRef = useRef<Howl | null>(null)
  const [status, setStatus] = useState<PreviewStatus>('idle')
  const [activeUrl, setActiveUrl] = useState<string | null>(null)
  const [errorUrl, setErrorUrl] = useState<string | null>(null)

  const stop = () => {
    howlRef.current?.stop()
    howlRef.current?.unload()
    howlRef.current = null
    setStatus('idle')
    setActiveUrl(null)
  }

  const toggle = (url: string) => {
    if (activeUrl === url && (status === 'playing' || status === 'loading')) {
      stop()
      return
    }
    stop()
    setErrorUrl(null)
    setActiveUrl(url)
    setStatus('loading')

    const howl = new Howl({ src: [url], html5: true, volume: 0.7 })
    let retried = false
    howl.on('play', () => setStatus((s) => (s === 'error' ? s : 'playing')))
    howl.on('end', () => setStatus((s) => (s === 'playing' ? 'idle' : s)))
    howl.on('loaderror', () => {
      setErrorUrl(url)
      setStatus('error')
    })
    howl.on('playerror', () => {
      if (!retried) {
        retried = true
        howl.once('unlock', () => howl.play())
      } else {
        setErrorUrl(url)
        setStatus('error')
      }
    })
    howl.play()
    howlRef.current = howl
  }

  useEffect(() => {
    return () => {
      howlRef.current?.stop()
      howlRef.current?.unload()
      howlRef.current = null
    }
  }, [])

  const playingUrl = status === 'playing' ? activeUrl : null
  return { status, activeUrl, errorUrl, playingUrl, toggle, stop }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd webapp-1 && npm run test -- useAudioPreview`
Expected: PASS (3 tests).

- [ ] **Step 5: Verify `@testing-library/react` is available**

Run: `cd webapp-1 && node -e "require.resolve('@testing-library/react')" && echo OK`
Expected: prints `OK`. If it errors with "Cannot find module", install it first:
`npm install -D @testing-library/react` and commit the `package.json`/`package-lock.json` changes together with this task.

- [ ] **Step 6: Commit**

```bash
git add webapp-1/src/modules/music/useAudioPreview.ts webapp-1/src/modules/music/useAudioPreview.test.ts webapp-1/package.json webapp-1/package-lock.json
git commit -m "feat(music): preview status machine with iOS playerror retry"
```

---

### Task 4: Loading + error states in the music track list UI

**Files:**
- Modify: `webapp-1/src/modules/music/MusicSelection.tsx:18,26-54`

**Interfaces:**
- Consumes: `useAudioPreview()` return from Task 3 (`status`, `activeUrl`, `errorUrl`, `toggle`).

- [ ] **Step 1: Use the new hook fields**

In `webapp-1/src/modules/music/MusicSelection.tsx`, replace line 18:

```tsx
  const { status, activeUrl, errorUrl, toggle } = useAudioPreview()
```

- [ ] **Step 2: Compute per-track state and render it**

Replace the `.map` body (lines 26-54) so each row reflects loading/playing/error. Replace from `const selected = ...` down to the closing `)` of the map callback with:

```tsx
          const selected = track.trackId === musicTrackId
          const isActive = activeUrl === track.audioFile
          const playing = isActive && status === 'playing'
          const loading = isActive && status === 'loading'
          const errored = errorUrl === track.audioFile
          const glyph = loading ? '…' : playing ? '❚❚' : errored ? '↻' : '▶'
          return (
            <div
              key={track.trackId}
              className={`flex items-center gap-3 rounded-xl border-2 p-3 ${
                selected ? 'border-brand-primary bg-brand-primary/5' : 'border-black/10'
              }`}
            >
              <button
                type="button"
                aria-busy={loading}
                aria-label={
                  loading
                    ? 'Loading preview'
                    : playing
                      ? 'Pause preview'
                      : errored
                        ? 'Retry preview'
                        : 'Play preview'
                }
                onClick={() => toggle(track.audioFile)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-primary text-white disabled:opacity-50"
              >
                {glyph}
              </button>
              <button
                type="button"
                onClick={() => setMusicTrack(track.trackId)}
                className="flex flex-1 flex-col items-start text-left"
              >
                <span className="font-medium">{track.displayName}</span>
                <span className="text-xs text-foreground/50">
                  {errored ? "Couldn't play — tap ↻ to retry" : `${track.durationSeconds}s`}
                </span>
              </button>
              {selected ? <span className="text-brand-primary">✓</span> : null}
            </div>
          )
```

- [ ] **Step 3: Verify typecheck + tests**

Run: `cd webapp-1 && npm run typecheck && npm run test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add webapp-1/src/modules/music/MusicSelection.tsx
git commit -m "feat(music): show loading/error/retry states in track list"
```

---

### Task 5: Prometheus instrumentation middleware (Go)

**Files:**
- Modify: `webapp-1/backend/go.mod`, `webapp-1/backend/go.sum` (add dep)
- Create: `webapp-1/backend/internal/http/middlewares/metrics.go`
- Test: `webapp-1/backend/internal/http/middlewares/metrics_test.go`

**Interfaces:**
- Produces: `middlewares.Metrics() func(http.Handler) http.Handler` — an `alice.Constructor` registering `http_requests_total{method,code}` (counter), `http_request_duration_seconds{method,code}` (histogram), `http_requests_in_flight` (gauge) on the default Prometheus registry.

- [ ] **Step 1: Add the client_golang dependency**

Run: `cd webapp-1/backend && go get github.com/prometheus/client_golang@latest && go mod tidy`
Expected: `go.mod` gains `github.com/prometheus/client_golang`.

- [ ] **Step 2: Write the failing test**

```go
// webapp-1/backend/internal/http/middlewares/metrics_test.go
package middlewares

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/prometheus/client_golang/prometheus/promhttp"
)

func TestMetrics_RecordsRequest(t *testing.T) {
	h := Metrics()(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusTeapot)
	}))

	req := httptest.NewRequest(http.MethodGet, "/anything", nil)
	h.ServeHTTP(httptest.NewRecorder(), req)

	// Scrape the default registry and assert our series shows up with the right labels.
	scrape := httptest.NewRecorder()
	promhttp.Handler().ServeHTTP(scrape, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	body := scrape.Body.String()

	if !strings.Contains(body, `http_requests_total{code="418",method="GET"}`) {
		t.Errorf("expected http_requests_total with code=418 method=GET, got:\n%s", body)
	}
	if !strings.Contains(body, "http_request_duration_seconds") {
		t.Error("expected http_request_duration_seconds in scrape output")
	}
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd webapp-1/backend && go test ./internal/http/middlewares/ -run TestMetrics`
Expected: FAIL — `undefined: Metrics`.

- [ ] **Step 4: Write the implementation**

```go
// webapp-1/backend/internal/http/middlewares/metrics.go
package middlewares

import (
	"net/http"
	"strconv"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

//nolint:gochecknoglobals // Prometheus collectors are registered once at package load.
var (
	httpRequestsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "http_requests_total",
			Help: "Total number of HTTP requests by method and status code.",
		},
		[]string{"method", "code"},
	)
	httpRequestDuration = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "http_request_duration_seconds",
			Help:    "HTTP request latency in seconds by method and status code.",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"method", "code"},
	)
	httpRequestsInFlight = promauto.NewGauge(
		prometheus.GaugeOpts{
			Name: "http_requests_in_flight",
			Help: "Number of HTTP requests currently being served.",
		},
	)
)

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

// Metrics records request count, latency, and in-flight gauge for every request.
// Labels are limited to method + status code to keep cardinality bounded.
func Metrics() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			httpRequestsInFlight.Inc()
			rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}

			next.ServeHTTP(rec, r)

			httpRequestsInFlight.Dec()
			code := strconv.Itoa(rec.status)
			httpRequestsTotal.WithLabelValues(r.Method, code).Inc()
			httpRequestDuration.WithLabelValues(r.Method, code).Observe(time.Since(start).Seconds())
		})
	}
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd webapp-1/backend && go test ./internal/http/middlewares/ -run TestMetrics`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add webapp-1/backend/go.mod webapp-1/backend/go.sum webapp-1/backend/internal/http/middlewares/metrics.go webapp-1/backend/internal/http/middlewares/metrics_test.go
git commit -m "feat(metrics): Prometheus HTTP instrumentation middleware"
```

---

### Task 6: MetricsConfig schema + defaults

**Files:**
- Modify: `webapp-1/backend/config/scheme.go:124-152` (Scheme struct) and add `MetricsConfig`
- Modify: `webapp-1/backend/config/init.go` (defaults block)

**Interfaces:**
- Produces: `config.MetricsConfig{ Enabled bool; Port int }` and `Scheme.Metrics *MetricsConfig` (`mapstructure:"metrics"`). Env: `METRICS_ENABLED`, `METRICS_PORT`.

- [ ] **Step 1: Add the MetricsConfig type**

In `webapp-1/backend/config/scheme.go`, after the `CacheConfig` struct (line 122), add:

```go
// MetricsConfig configures the Prometheus /metrics listener. It is served on its
// own port, separate from the API, and is intended to be reachable only on the
// internal network (never published to the host / never proxied by nginx).
type MetricsConfig struct {
	Enabled bool `mapstructure:"enabled"`
	Port    int  `mapstructure:"port"`
}
```

In the `Scheme` struct, after the `Stripe` field (line 148), add:

```go
	// Metrics configuration for the Prometheus /metrics listener.
	Metrics *MetricsConfig `mapstructure:"metrics"`
```

- [ ] **Step 2: Add defaults**

In `webapp-1/backend/config/init.go`, after the HTTP rate-limit defaults block, add:

```go
	// Metrics module defaults (Prometheus /metrics on a separate internal port).
	viper.SetDefault("metrics.enabled", true)
	viper.SetDefault("metrics.port", 9100)
```

- [ ] **Step 3: Verify it compiles and config tests pass**

Run: `cd webapp-1/backend && go build ./... && go test ./config/`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add webapp-1/backend/config/scheme.go webapp-1/backend/config/init.go
git commit -m "feat(config): MetricsConfig schema + defaults (METRICS_ENABLED/PORT)"
```

---

### Task 7: Internal `/metrics` listener wired into the HTTP module

**Files:**
- Create: `webapp-1/backend/internal/http/metrics_server.go`
- Modify: `webapp-1/backend/internal/http/module.go:27-48,77-102,187-192` (field, NewModule sig, chain, Start/Stop)
- Modify: `webapp-1/backend/internal/application.go:141` (NewModule call site)
- Test: `webapp-1/backend/internal/http/metrics_server_test.go`

**Interfaces:**
- Consumes: `middlewares.Metrics()` (Task 5), `config.MetricsConfig` (Task 6).
- Produces: `newMetricsServer(port int, version string) *http.Server` serving `promhttp.Handler()` at `/metrics`; `Module` gains a `metricsConfig *config.MetricsConfig` field; `NewModule(cfg, authCfg, stripeCfg, metricsCfg, svc, grpcClient)`.

- [ ] **Step 1: Write the failing test for the metrics server**

```go
// webapp-1/backend/internal/http/metrics_server_test.go
package http

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestNewMetricsServer_ServesMetrics(t *testing.T) {
	srv := newMetricsServer(9100, "test")
	rec := httptest.NewRecorder()
	srv.Handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/metrics", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	body := rec.Body.String()
	if !strings.Contains(body, "go_goroutines") {
		t.Error("expected default Go collector metrics in output")
	}
	if !strings.Contains(body, `dollbuilder_build_info{version="test"}`) {
		t.Errorf("expected build_info with version label, got:\n%s", body)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd webapp-1/backend && go test ./internal/http/ -run TestNewMetricsServer`
Expected: FAIL — `undefined: newMetricsServer`.

- [ ] **Step 3: Write the metrics server**

```go
// webapp-1/backend/internal/http/metrics_server.go
package http

import (
	"fmt"
	"net/http"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

//nolint:gochecknoglobals // registered once at package load.
var buildInfo = promauto.NewGaugeVec(
	prometheus.GaugeOpts{
		Name: "dollbuilder_build_info",
		Help: "Build information (value is always 1).",
	},
	[]string{"version"},
)

// newMetricsServer returns an HTTP server that exposes the Prometheus default
// registry at /metrics. It is meant to listen on an internal-only port.
func newMetricsServer(port int, version string) *http.Server {
	buildInfo.WithLabelValues(version).Set(1)
	mux := http.NewServeMux()
	mux.Handle("/metrics", promhttp.Handler())
	return &http.Server{
		Addr:              fmt.Sprintf("0.0.0.0:%d", port),
		Handler:           mux,
		ReadHeaderTimeout: 5_000_000_000, // 5s
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd webapp-1/backend && go test ./internal/http/ -run TestNewMetricsServer`
Expected: PASS.

- [ ] **Step 5: Add the middleware to the chain**

In `webapp-1/backend/internal/http/module.go`, in `initAPI()` change the chain (line 187) to insert `Metrics()` right after `Recovery()`:

```go
	chain := []alice.Constructor{
		middlewares.Recovery(),
		middlewares.Metrics(),
		middlewares.Logger(),
		middlewares.Cors(m.config.CORS),
		middlewares.RateLimit(m.config.RateLimit),
	}
```

- [ ] **Step 6: Add the metrics config field + start/stop the listener**

In `module.go`, add to the `Module` struct (after the `stripeConfig` field, line 30):

```go
	metricsConfig *config.MetricsConfig
	metricsServer *http.Server
```

Change `NewModule` (line 40) signature and body to accept and store `metricsCfg`:

```go
func NewModule(cfg *config.HTTPConfig, authCfg *config.AuthConfig, stripeCfg *config.StripeConfig, metricsCfg *config.MetricsConfig, svc service.IService, grpcClient grpcclient.IClient) *Module {
	return &Module{
		config:        cfg,
		authConfig:    authCfg,
		stripeConfig:  stripeCfg,
		metricsConfig: metricsCfg,
		service:       svc,
		grpcClient:    grpcClient,
	}
}
```

In `Start()` (after the existing `go func() {...}()` block that serves the API, before `return nil` at line 87), add:

```go
	if m.metricsConfig != nil && m.metricsConfig.Enabled {
		m.metricsServer = newMetricsServer(m.metricsConfig.Port, "dev")
		go func() {
			logger.Log().Infof("metrics server listening on :%d/metrics", m.metricsConfig.Port)
			if err := m.metricsServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
				logger.Log().Errorf("metrics server error: %v", err)
			}
		}()
	}
```

In `Stop()` (before `return nil` at line 101), add:

```go
	if m.metricsServer != nil {
		if err := m.metricsServer.Shutdown(context.Background()); err != nil {
			logger.Log().Errorf("shutdown metrics server: %v", err)
		}
	}
```

- [ ] **Step 7: Update the NewModule call site**

In `webapp-1/backend/internal/application.go:141`, change the call to pass `app.config.Metrics`:

```go
		httpModule := httpmod.NewModule(app.config.HTTP, app.config.Auth, app.config.Stripe, app.config.Metrics, app.svc, grpcClientModule)
```

- [ ] **Step 8: Build, run all backend tests**

Run: `cd webapp-1/backend && go build ./... && go test ./...`
Expected: PASS. (If `module_test.go` constructs `NewModule` directly, update those call sites to pass a `*config.MetricsConfig` — e.g. `nil` — so they compile.)

- [ ] **Step 9: Commit**

```bash
git add webapp-1/backend/internal/http/metrics_server.go webapp-1/backend/internal/http/metrics_server_test.go webapp-1/backend/internal/http/module.go webapp-1/backend/internal/application.go
git commit -m "feat(metrics): internal /metrics listener wired into HTTP module"
```

---

### Task 8: Prometheus service in docker-compose + scrape config

**Files:**
- Create: `webapp-1/backend/deploy/prometheus.yml`
- Modify: `webapp-1/backend/docker-compose.prod.yml` (add `prometheus` service + `promdata` volume + metrics env on `app` + log rotation on all services)
- Modify: `webapp-1/backend/docker-compose.yml` (add `prometheus` service for dev + log rotation on all services)

**Interfaces:**
- Consumes: app metrics on `app:9100` (Task 7) over the compose network.

**Bounded growth requirements (both compose files):**
- Prometheus TSDB is size+time capped so disk use plateaus: prod
  `--storage.tsdb.retention.time=15d --storage.tsdb.retention.size=512MB`; dev
  `--storage.tsdb.retention.time=7d --storage.tsdb.retention.size=256MB`. The
  `retention.size` cap is what guarantees the volume stops growing — Prometheus drops
  the oldest blocks once the cap is hit.
- Every service gets a `json-file` logging driver with `max-size: "10m"` + `max-file: "3"`
  (≤30 MB of logs per container, auto-rotated) via a shared `x-logging` YAML anchor at the
  top of each compose file. This stops container logs growing unbounded on the host.

- [ ] **Step 1: Create the scrape config**

```yaml
# webapp-1/backend/deploy/prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: dollbuilder
    static_configs:
      - targets: ["app:9100"]
  - job_name: prometheus
    static_configs:
      - targets: ["localhost:9090"]
```

- [ ] **Step 2: Add the prod Prometheus service + log rotation**

In `webapp-1/backend/docker-compose.prod.yml`, add a logging anchor at the very top of the file (above `services:`), and a `logging: *default-logging` line to **each** service (`postgres`, `redis`, `migrate`, `app`, `prometheus`):

```yaml
x-logging: &default-logging
  driver: json-file
  options:
    max-size: "10m"
    max-file: "3"

services:
```

Then add metrics env to the `app` service `environment:` block (do NOT add a `ports:` entry for 9100):

```yaml
      # Prometheus metrics on an internal-only port (never published to host).
      METRICS_ENABLED: "true"
      METRICS_PORT: "9100"
```

Add a new service after `app:` (before the `volumes:` block):

```yaml
  prometheus:
    image: prom/prometheus:v3.1.0
    restart: unless-stopped
    logging: *default-logging
    depends_on:
      - app
    volumes:
      - ./deploy/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - promdata:/prometheus
    command:
      - "--config.file=/etc/prometheus/prometheus.yml"
      - "--storage.tsdb.retention.time=15d"
      - "--storage.tsdb.retention.size=512MB"
    # UI bound to loopback only; nginx proxies a public subdomain with basic auth.
    ports:
      - "127.0.0.1:9090:9090"
```

Add `promdata:` to the `volumes:` block at the bottom:

```yaml
volumes:
  pgdata:
  promdata:
```

- [ ] **Step 3: Add the dev Prometheus service + log rotation**

In `webapp-1/backend/docker-compose.yml`, add the logging anchor at the very top (above `services:`) and a `logging: *default-logging` line to each service (`postgres`, `redis`, `migrate`, `app`, `prometheus`):

```yaml
x-logging: &default-logging
  driver: json-file
  options:
    max-size: "10m"
    max-file: "3"

services:
```

(The existing `version: '3.8'` line can stay above the anchor or be removed — it is obsolete in modern compose.) Add metrics env to the `app` `environment:` block:

```yaml
      # Prometheus metrics on an internal-only port.
      METRICS_ENABLED: "true"
      METRICS_PORT: "9100"
```

Add a `prometheus` service after `app:` — note the host UI port is `9091` because dev gRPC already publishes host `9090`. Dev TSDB is size-capped too so the dev volume cannot grow without bound:

```yaml
  prometheus:
    image: prom/prometheus:v3.1.0
    restart: unless-stopped
    logging: *default-logging
    depends_on:
      - app
    volumes:
      - ./deploy/prometheus.yml:/etc/prometheus/prometheus.yml:ro
    command:
      - "--config.file=/etc/prometheus/prometheus.yml"
      - "--storage.tsdb.retention.time=7d"
      - "--storage.tsdb.retention.size=256MB"
    ports:
      - "127.0.0.1:9091:9090"
```

- [ ] **Step 4: Validate both compose files parse**

Run: `cd webapp-1/backend && docker compose -f docker-compose.yml config >/dev/null && docker compose -f docker-compose.prod.yml config >/dev/null && echo COMPOSE_OK`
Expected: prints `COMPOSE_OK` (validates YAML + interpolation; prod may warn about unset `${DB_USER}` etc. — that is fine, it still parses). If `docker` is unavailable in the environment, instead run `python3 -c "import yaml,sys; [yaml.safe_load(open(f)) for f in ['docker-compose.yml','docker-compose.prod.yml','deploy/prometheus.yml']]; print('YAML_OK')"`.

- [ ] **Step 5: Commit**

```bash
git add webapp-1/backend/deploy/prometheus.yml webapp-1/backend/docker-compose.prod.yml webapp-1/backend/docker-compose.yml
git commit -m "feat(obs): Prometheus service in dev + prod compose, scraping app:9100"
```

---

### Task 9: nginx vhost template + deploy runbook

**Files:**
- Create: `webapp-1/deploy/prometheus.nginx.conf`
- Modify: `webapp-1/backend/DEPLOY.md` (add an Observability runbook section)

**Interfaces:**
- Consumes: the loopback-bound Prometheus UI on `127.0.0.1:9090` (Task 8).

- [ ] **Step 1: Create the nginx vhost template**

```nginx
# webapp-1/deploy/prometheus.nginx.conf
# Public, auth-gated entry to the Prometheus UI on oracle-1.
# Apply on the server, then obtain TLS:
#   sudo htpasswd -c /etc/nginx/.htpasswd-prometheus <user>   # NEVER commit this file
#   sudo ln -s .../prometheus.nginx.conf /etc/nginx/sites-enabled/
#   sudo nginx -t && sudo systemctl reload nginx
#   sudo certbot --nginx -d prometheus.lindentar.pashteto.com
server {
    listen 80;
    listen [::]:80;
    server_name prometheus.lindentar.pashteto.com;

    # Basic auth over TLS. htpasswd file lives on the server only (<REDACTED>).
    auth_basic "Prometheus";
    auth_basic_user_file /etc/nginx/.htpasswd-prometheus;

    location / {
        proxy_pass http://127.0.0.1:9090;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

- [ ] **Step 2: Add the runbook section to DEPLOY.md**

Append to `webapp-1/backend/DEPLOY.md`:

```markdown
## Observability — Prometheus (oracle-1)

Metrics are exposed by the app on an internal-only port (`9100`, never published to
the host) and scraped by a Prometheus container in the same compose project. The
Prometheus UI is reachable at `https://prometheus.lindentar.pashteto.com` behind
nginx basic auth + TLS.

**Apply (human-run on the server):**

1. Pull + redeploy (rebuilds the app with the metrics listener, starts Prometheus):
   ```
   git pull
   docker compose -f docker-compose.prod.yml up -d --build
   ```
2. Confirm scraping locally: `curl -s localhost:9090/api/v1/targets | grep dollbuilder`
   should show the `app:9100` target as `"health":"up"`.
3. DNS: add an A record `prometheus.lindentar.pashteto.com` → oracle-1.
4. Basic-auth credentials (never committed):
   ```
   sudo htpasswd -c /etc/nginx/.htpasswd-prometheus <user>
   ```
5. Install the vhost from `../deploy/prometheus.nginx.conf`, then:
   ```
   sudo nginx -t && sudo systemctl reload nginx
   sudo certbot --nginx -d prometheus.lindentar.pashteto.com
   ```
6. Verify: `curl -u <user>:<REDACTED> https://prometheus.lindentar.pashteto.com/-/healthy`.

**Notes:** `/metrics` (port 9100) must never appear in a compose `ports:` list. The
Prometheus UI binds `127.0.0.1:9090` so it is only reachable through nginx. This adds
a public endpoint — record it in change-management/audit notes.
```

- [ ] **Step 3: Sanity-check the nginx template syntax (best effort)**

Run: `command -v nginx >/dev/null && sudo nginx -t -c /dev/stdin < webapp-1/deploy/prometheus.nginx.conf 2>&1 | tail -2 || echo "nginx not present locally — validated on server per runbook"`
Expected: either an nginx OK line, or the "validated on server" message (the file is applied and tested on oracle-1, not in this environment).

- [ ] **Step 4: Commit**

```bash
git add webapp-1/deploy/prometheus.nginx.conf webapp-1/backend/DEPLOY.md
git commit -m "docs(obs): nginx vhost template + Prometheus deploy runbook"
```

---

## Self-Review

**Spec coverage:**
- A1 preview status/events → Task 3. A2 typed decode + timeout/retry → Task 1. A3 warn-on-silent → Task 2. A4 tests → Tasks 1 & 3. ✓
- B1 instrumentation middleware (requests_total/duration/in_flight + default collectors + build_info) → Tasks 5 & 7. ✓ (DB pool gauges intentionally deferred per spec.)
- B2 separate internal listener on 9100, gated by config → Tasks 6 & 7. ✓
- C1 compose service + retention + loopback UI → Task 8. C2 prometheus.yml → Task 8. C3 nginx vhost → Task 9. ✓
- Security/compliance (no secrets, internal /metrics, runbook, audit note) → Tasks 8 & 9. ✓

**Placeholder scan:** No TBD/TODO-as-requirement; every code step shows complete code. The `version: "dev"` build label is intentional (ldflags wiring is out of scope). ✓

**Type consistency:** `DecodeResult`/`DecodedAudio` defined in Task 1 and consumed in Task 2; `onWarning` defined in Task 2 step 1 and used in steps 2-4; `useAudioPreview` return shape defined in Task 3 and consumed in Task 4; `NewModule` new signature (Task 7 step 6) matched at the call site (step 7) and flagged for test call sites (step 8); `newMetricsServer(port, version)` defined and used consistently. ✓

**Cross-cutting note:** Task 1 step 4 deliberately leaves `webcodecsPipeline.ts` failing typecheck until Task 2 — called out so an out-of-order reader isn't surprised. Run Tasks 1→2 in order.
