# Music Box Doll Builder — Web App

Mobile-first web app: assemble a customizable doll from 3D parts, set it spinning to
music, render a looping MP4 in the browser, and share it. This repo currently
implements the **lean core-loop MVP** (see `../CLAUDE.md` and `docs/EPICS.md` for the
full Phase 1 plan).

**🌐 Live:** https://lindentar.pashteto.com — static export served by Caddy on oracle-2.
Redeploy with `./deploy/deploy.sh`; full runbook in [`deploy/DEPLOY.md`](deploy/DEPLOY.md).
New here? Start with [`HANDOFF.md`](HANDOFF.md).

## What works today

Landing → assemble doll (5 slots) → decorate scene → pick music → render video → share/download.

- **3D editor** — React Three Fiber scene, slot-based composition with constrained transforms
- **Local persistence** — drafts autosave to IndexedDB (max 5), resume from the landing page
- **In-browser render** — WebCodecs H.264 + AAC → MP4 (via `mp4-muxer`), with a
  MediaRecorder fallback; 1080×1920, 30fps
- **Share** — Web Share API with download fallback
- **Paywall** — _stubbed_: first export free, second opens a placeholder paywall
  (no Stripe yet)

Assets are **placeholders** (generated primitives + a synthesized music-box track).
Regenerate them with `node scripts/gen-placeholder-assets.mjs`.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript (strict) · Tailwind v4 · Zustand ·
Three.js / R3F / Drei · Howler · Framer Motion (`motion`) · idb · mp4-muxer.

## Commands

```bash
npm run dev          # dev server (http://localhost:3000)
npm run build        # production build
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm run test         # Vitest unit tests
npm run format       # Prettier
node scripts/gen-placeholder-assets.mjs   # (re)generate placeholder catalog assets
```

## Not yet built (deferred from Phase 1)

Go backend + real Stripe checkout (E12 full), analytics (E13), PWA/offline (E14),
backend catalog/sessions (E15), global-adjustment mode (E7), floating props (E8-T3).
Each remains specified in `docs/tasks/`. **Backend, when built, must use the
`go-microservice-template` as a single modular monolith** (see `CLAUDE.md`).

> The highest-risk piece (in-browser MP4 export on Safari, E10) was prototyped first
> in `/spike` and validated end-to-end.
