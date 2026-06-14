# Entitlements + Stripe (test-mode) — Design

**Date:** 2026-06-14
**Epic:** E12 (Paywall & Stripe) — "Plan 3". E15 explicitly **skipped** as superseded
(catalog is served statically from `public/catalog/manifest.json`; anonymous sessions
are replaced by the email/password auth built in PR #3).
**Branch:** `feat/entitlements-stripe`

## Problem

The frontend paywall already calls `GET /api/v1/entitlements` and
`POST /api/v1/entitlements/mock-checkout` (see `src/lib/api.ts` → `entitlementsApi`,
`src/store/entitlementSlice.ts`), keyed to the **authenticated user** via the session
cookie. The backend does not implement these routes, so they return **404**. The paywall
degrades gracefully (never crashes) but monetization is non-functional. This is the only
open gap in the deployed product.

## Goal

Implement a backend entitlements module in the existing Go monolith, plus a real
Stripe Checkout (test-mode) flow, and switch the frontend from the mocked checkout to the
real checkout redirect. Entitlements are **per authenticated user** (one-time purchase →
unlimited exports in Phase 1).

## Non-goals

- Anonymous/guest sessions (E15-T2) — superseded by auth.
- Backend catalog endpoint (E15-T1) — catalog stays static.
- Restore-by-email (E12-T4) — superseded by auth ("restore" = log in).
- Subscriptions, multiple products, refund handling beyond marking status.

## Architecture

Swagger-first, following the existing auth/projects modules exactly:

1. Add paths + definitions to `api/swagger.yaml`.
2. `make generate-all` regenerates `internal/http/server/operations/...` (gitignored).
3. Handlers in `internal/http/handlers/entitlements.go`, wired in `internal/http/module.go`.
4. Service methods on `IService` (`internal/service/entitlements.go`).
5. Repository methods (`internal/repository/entitlements.go`) + interface entry.
6. Model `internal/models/entitlement.go`.
7. Migration `db/migrations/000005_entitlements.{up,down}.sql`.
8. Stripe client wrapper `internal/stripe/` (thin; config-driven; isolated so the rest of
   the service has no hard dependency on Stripe being configured).

### Endpoints

| Method | Path | Auth | Response |
|---|---|---|---|
| GET | `/api/v1/entitlements` | cookie (principal `*models.User`) | `{ entitled: bool, source: string }` |
| POST | `/api/v1/entitlements/mock-checkout` | cookie | `{ entitled: true }` — gated by `ALLOW_MOCK_CHECKOUT` (off in prod) |
| POST | `/api/v1/checkout/session` | cookie | `{ checkoutUrl: string }` — real Stripe test-mode session |
| POST | `/api/v1/webhooks/stripe` | Stripe-Signature (HMAC) | `200` always on valid sig; grants entitlement on `checkout.session.completed` |

### Data model

Migration `000005_entitlements`:

```sql
CREATE TABLE entitlements (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  status                   TEXT NOT NULL DEFAULT 'none',   -- none | active | refunded
  source                   TEXT NOT NULL DEFAULT '',       -- '' | stripe | mock
  stripe_customer_id       TEXT,
  stripe_payment_intent_id TEXT,
  product_id               TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

One row per user (unique `user_id`). `entitled` derives from `status = 'active'`. Upserts
are idempotent (webhook may fire more than once for the same session).

### Stripe flow

1. Frontend "Unlock Export" → `POST /api/v1/checkout/session`.
2. Backend creates a Checkout Session (mode=payment, one `STRIPE_PRICE_ID` line item),
   `client_reference_id = user_id`, `success_url = <FRONTEND>/editor?checkout=success`,
   `cancel_url = <FRONTEND>/editor`. Returns `checkoutUrl`.
3. Frontend `window.location = checkoutUrl` → Stripe-hosted page (test card 4242…).
4. Stripe → `POST /api/v1/webhooks/stripe` with `checkout.session.completed`. Backend
   **verifies the signature** with `STRIPE_WEBHOOK_SECRET`, reads `client_reference_id`,
   upserts the entitlement to `status='active', source='stripe'`, stores
   `stripe_customer_id`/`stripe_payment_intent_id`. Invalidates the Redis cache for that user.
5. Frontend lands on `/editor?checkout=success` → re-fetches `GET /entitlements` → unlocks.

### Redis cache

Cache `GET /entitlements` result per user (`entitlement:<user_id>`), TTL ~60s. Invalidate
on `mock-checkout` and on webhook grant. Uses the existing optional `cache` dependency
(nil-safe — service works without Redis), same pattern as the auth session cache.

### Config (`config/scheme.go`, env only — never committed)

```
STRIPE_SECRET_KEY        // sk_test_...   empty => checkout/webhook return 503 "not configured"
STRIPE_WEBHOOK_SECRET    // whsec_...
STRIPE_PRICE_ID          // price_...
STRIPE_SUCCESS_URL       // default <frontend>/editor?checkout=success
STRIPE_CANCEL_URL        // default <frontend>/editor
ALLOW_MOCK_CHECKOUT      // bool; default true in non-prod, false in prod
```

### Frontend changes

- `src/store/entitlementSlice.ts`: add `startCheckout()` → `POST /api/v1/checkout/session`
  → `window.location.assign(checkoutUrl)`. Keep `mockCheckout()` behind a build/dev flag.
- `src/lib/api.ts`: add `checkoutApi.session()`.
- `src/modules/paywall/PaywallScreen.tsx`: "Unlock Export" calls `startCheckout()` (real)
  for logged-in users; falls back to a clear error if checkout is unavailable (503).
- `/editor` reads `?checkout=success` on mount → re-fetch entitlement, then clears the param.

## Error handling

- Unauthenticated → `401` (matches projects/auth).
- Stripe not configured (`STRIPE_SECRET_KEY` empty) → `503` with `{ error: "checkout not configured" }`; frontend shows a graceful message.
- Webhook with bad/missing signature → `400`, no state change, logged (no secrets).
- Webhook for unknown `client_reference_id` → `200` (ack) + warning log; never 500 to Stripe.
- Repository/cache errors → `500`; cache errors are non-fatal (fall through to DB).

## Testing & verification

- **Service unit tests:** grant via mock-checkout; webhook grant idempotency (apply twice →
  one active row); `entitled` derivation; cache invalidation calls.
- **Handler tests:** `401` without principal; `200 {entitled:false}` for a fresh user;
  mock-checkout flips to `entitled:true`; webhook signature valid vs invalid.
- **Local runtime verification (verify skill):** boot the service with docker-compose,
  `curl` the endpoints — 401 without cookie, login → 200, mock-checkout grant, replay a
  signed test webhook (valid + tampered).
- **Post-deploy:** with your Stripe **test** keys in `.env` on oracle-1, drive a real
  test-mode checkout (card 4242 4242 4242 4242) end-to-end and confirm the entitlement flips.

## Compliance (org policy)

- **Secrets:** Stripe keys live only in `.env` on oracle-1 (chmod 600, not committed);
  config reads them from env. No secrets in code, logs, or this doc.
- **Webhook signature verification is mandatory** (no unauthenticated state mutation).
- **Audit awareness (ISO 27001):** this introduces a payment/entitlement control —
  flagged for change-management documentation when docs/handoffs are updated.
- **Least privilege:** webhook endpoint only mutates entitlements; no broad grants.

## Rollout

1. Implement + local verify (no keys needed for most of it).
2. Merge to `main` via PR.
3. Deploy backend to oracle-1 (rsync working tree + `make generate-all` on box + docker
   compose up). Add Stripe test keys to `.env`. Register the webhook endpoint URL in the
   Stripe test dashboard.
4. Redeploy frontend (oracle-2) with the real-checkout wiring.
5. Verify `GET /entitlements` returns `200` (was `404`) and the test-mode purchase works.
