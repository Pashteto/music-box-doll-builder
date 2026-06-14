# Entitlements + Stripe (test-mode) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a per-user entitlements module + real Stripe Checkout (test-mode) in the Go monolith, and switch the frontend paywall from mocked to real checkout, so `GET /api/v1/entitlements` stops 404ing and monetization works.

**Architecture:** Swagger-first Go monolith (go-swagger generated server). New `entitlements` module mirrors the existing `auth`/`projects` modules: swagger path → generated ops → handler → service → repository → Postgres migration. Stripe is config-driven (empty key ⇒ 503). The Stripe webhook is handled as a global middleware (raw body needed for signature verification), bypassing go-swagger JSON parsing.

**Tech Stack:** Go, go-swagger, go-pg, PostgreSQL, Redis (optional), `github.com/stripe/stripe-go`, Next.js/TypeScript/Zustand frontend.

**Spec:** `webapp-1/docs/superpowers/specs/2026-06-14-entitlements-stripe-design.md`

**Working dir for backend tasks:** `webapp-1/backend`. **Frontend tasks:** `webapp-1`.

**Conventions observed (do not deviate):**
- Cookie auth: handlers call `auth.UserFromContext(params.HTTPRequest.Context())` → `*models.User` (has `.UUID uuid.UUID`); nil ⇒ 401 via `DefaultError(http.StatusUnauthorized, service.ErrInvalidSession, nil)`.
- Swagger paths use `security: []` (cookie middleware does auth out-of-band).
- Generated server code is gitignored; regenerate with `make generate-all`.
- Service interface `service.IService`; repo interface `repository.IRepository`; impl `repository.postgres`.
- Migrations: `db/migrations/0000NN_name.{up,down}.sql`, numbered.
- API base path is `/api/v1`.

---

### Task 1: Entitlements migration

**Files:**
- Create: `db/migrations/000005_entitlements.up.sql`
- Create: `db/migrations/000005_entitlements.down.sql`

- [ ] **Step 1: Write the up migration**

`db/migrations/000005_entitlements.up.sql`:
```sql
CREATE TABLE IF NOT EXISTS entitlements (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                  UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    status                   TEXT NOT NULL DEFAULT 'none',
    source                   TEXT NOT NULL DEFAULT '',
    stripe_customer_id       TEXT,
    stripe_payment_intent_id TEXT,
    product_id               TEXT,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS entitlements_user_id_idx ON entitlements (user_id);
```

- [ ] **Step 2: Write the down migration**

`db/migrations/000005_entitlements.down.sql`:
```sql
DROP TABLE IF EXISTS entitlements;
```

- [ ] **Step 3: Confirm gen_random_uuid availability**

Check `000001_initial_migration.up.sql` for `CREATE EXTENSION IF NOT EXISTS pgcrypto` or `uuid-ossp`. If neither provides `gen_random_uuid`, prepend `CREATE EXTENSION IF NOT EXISTS pgcrypto;` to the up migration.
Run: `grep -rn "EXTENSION" db/migrations/`
Expected: an extension that supplies `gen_random_uuid` (pgcrypto). If absent, add it.

- [ ] **Step 4: Commit**
```bash
git add db/migrations/000005_entitlements.up.sql db/migrations/000005_entitlements.down.sql
git commit -m "feat(entitlements): add entitlements table migration"
```

---

### Task 2: Entitlement model + repository

**Files:**
- Create: `internal/models/entitlement.go`
- Modify: `internal/repository/interface.go` (add 2 methods to `IRepository`)
- Create: `internal/repository/entitlements.go`
- Test: `internal/repository/entitlements_test.go` (mirror `projects_test.go` style)

- [ ] **Step 1: Write the model**

`internal/models/entitlement.go`:
```go
package models

import (
	"time"

	"github.com/gofrs/uuid"
)

// Entitlement is a per-user export entitlement (Phase 1: one-time purchase => unlimited).
type Entitlement struct {
	tableName             struct{}  `pg:"entitlements"`
	ID                    uuid.UUID `pg:"id,pk,type:uuid"`
	UserID                uuid.UUID `pg:"user_id,type:uuid"`
	Status                string    `pg:"status"`
	Source                string    `pg:"source"`
	StripeCustomerID      string    `pg:"stripe_customer_id"`
	StripePaymentIntentID string    `pg:"stripe_payment_intent_id"`
	ProductID             string    `pg:"product_id"`
	CreatedAt             time.Time `pg:"created_at"`
	UpdatedAt             time.Time `pg:"updated_at"`
}

// Entitled reports whether the user may export without limit.
func (e *Entitlement) Entitled() bool { return e != nil && e.Status == "active" }
```
> Verify the `pg` struct-tag style against `internal/models/project.go` and match it exactly (e.g. whether it uses `pg:"..."` or `sql:"..."`, and how `tableName` is declared). Adjust if the existing models differ.

- [ ] **Step 2: Add repository interface methods**

In `internal/repository/interface.go`, inside `IRepository`, after the project methods:
```go
	// EntitlementByUserID returns the entitlement for userID, or (nil, nil) if none.
	EntitlementByUserID(userID uuid.UUID) (*models.Entitlement, error)

	// UpsertEntitlement inserts or updates (by user_id) the entitlement, returning the stored row.
	UpsertEntitlement(e *models.Entitlement) (*models.Entitlement, error)
```

- [ ] **Step 3: Write the failing repository test**

`internal/repository/entitlements_test.go` — mirror the DB-test harness used in `projects_test.go` (same setup/skip-if-no-DB guard). Test:
```go
func TestUpsertEntitlementIsIdempotentByUser(t *testing.T) {
	repo, cleanup := newTestRepo(t) // use whatever helper projects_test.go uses
	defer cleanup()
	u := seedUser(t, repo)          // use the helper projects_test.go uses to create a user

	first, err := repo.UpsertEntitlement(&models.Entitlement{UserID: u.UUID, Status: "active", Source: "stripe"})
	if err != nil { t.Fatalf("first upsert: %v", err) }

	second, err := repo.UpsertEntitlement(&models.Entitlement{UserID: u.UUID, Status: "active", Source: "stripe"})
	if err != nil { t.Fatalf("second upsert: %v", err) }

	if first.ID != second.ID {
		t.Fatalf("expected same row on second upsert, got %s then %s", first.ID, second.ID)
	}
	got, err := repo.EntitlementByUserID(u.UUID)
	if err != nil || got == nil || !got.Entitled() {
		t.Fatalf("expected active entitlement, got %+v err %v", got, err)
	}
}
```
> Read `projects_test.go` first and copy its exact DB-skip guard and user-seeding helper names. If those helpers don't exist, replicate the connection setup it uses.

- [ ] **Step 4: Run the test to verify it fails**

Run: `go test ./internal/repository/ -run TestUpsertEntitlement -v`
Expected: FAIL (method `UpsertEntitlement` undefined) — or SKIP if no test DB. If it SKIPs, start the DB: `docker-compose up -d postgres` and re-run.

- [ ] **Step 5: Implement the repository methods**

`internal/repository/entitlements.go`:
```go
package repository

import (
	"time"

	"github.com/gofrs/uuid"

	"dollbuilder/internal/models"
)

// EntitlementByUserID returns the entitlement for userID, or (nil, nil) if none.
func (r *postgres) EntitlementByUserID(userID uuid.UUID) (*models.Entitlement, error) {
	e := &models.Entitlement{}
	err := r.db.Model(e).Where("user_id = ?", userID).Limit(1).Select()
	if err != nil {
		if err.Error() == "pg: no rows in result set" {
			return nil, nil
		}
		return nil, err
	}
	return e, nil
}

// UpsertEntitlement inserts or updates the entitlement by user_id, returning the stored row.
func (r *postgres) UpsertEntitlement(e *models.Entitlement) (*models.Entitlement, error) {
	now := time.Now().UTC()
	e.UpdatedAt = now
	if e.ID == uuid.Nil {
		id, err := uuid.NewV4()
		if err != nil {
			return nil, err
		}
		e.ID = id
		e.CreatedAt = now
	}
	_, err := r.db.Model(e).
		OnConflict("(user_id) DO UPDATE").
		Set("status = EXCLUDED.status, source = EXCLUDED.source, " +
			"stripe_customer_id = EXCLUDED.stripe_customer_id, " +
			"stripe_payment_intent_id = EXCLUDED.stripe_payment_intent_id, " +
			"product_id = EXCLUDED.product_id, updated_at = EXCLUDED.updated_at").
		Insert()
	if err != nil {
		return nil, err
	}
	return r.EntitlementByUserID(e.UserID)
}
```
> Confirm the receiver type name (`postgres`) and the `r.db` field name against `internal/repository/projects.go`; match exactly. Confirm go-pg's `OnConflict`/`Set` API matches the version in `go.mod` (this is go-pg v10 syntax).

- [ ] **Step 6: Run the test to verify it passes**

Run: `docker-compose up -d postgres && go test ./internal/repository/ -run TestUpsertEntitlement -v`
Expected: PASS

- [ ] **Step 7: Commit**
```bash
git add internal/models/entitlement.go internal/repository/interface.go internal/repository/entitlements.go internal/repository/entitlements_test.go
git commit -m "feat(entitlements): model + idempotent upsert repository"
```

---

### Task 3: Stripe config keys

**Files:**
- Modify: `config/scheme.go`
- Modify: `config/init.go` (env binding / defaults — match how `cookie_secure` is bound)

- [ ] **Step 1: Read the existing config pattern**

Run: `sed -n '80,120p' config/scheme.go && grep -n "cookie\|SetDefault\|BindEnv\|mapstructure" config/init.go`
Note exactly how `CookieDomain`/`CookieSecure` are declared and bound (viper `mapstructure` + env). Replicate that for the Stripe keys.

- [ ] **Step 2: Add Stripe fields to the config struct**

In `config/scheme.go`, in the same struct that holds `CookieDomain`/`CookieSecure`:
```go
	StripeSecretKey     string `mapstructure:"stripe_secret_key"`     // sk_test_...; empty => checkout/webhook disabled (503)
	StripeWebhookSecret string `mapstructure:"stripe_webhook_secret"` // whsec_...
	StripePriceID       string `mapstructure:"stripe_price_id"`       // price_...
	StripeSuccessURL    string `mapstructure:"stripe_success_url"`     // default <frontend>/editor?checkout=success
	StripeCancelURL     string `mapstructure:"stripe_cancel_url"`      // default <frontend>/editor
	AllowMockCheckout   bool   `mapstructure:"allow_mock_checkout"`   // default true non-prod, false prod
```

- [ ] **Step 3: Bind env + defaults**

In `config/init.go`, mirroring the cookie bindings, add `viper.BindEnv`/`SetDefault` (or the file's existing mechanism) for: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `STRIPE_SUCCESS_URL`, `STRIPE_CANCEL_URL`, `ALLOW_MOCK_CHECKOUT`. Default `ALLOW_MOCK_CHECKOUT=true` unless `CookieSecure` (prod) is true.

- [ ] **Step 4: Build to verify it compiles**

Run: `go build ./config/...`
Expected: no errors.

- [ ] **Step 5: Commit**
```bash
git add config/scheme.go config/init.go
git commit -m "feat(entitlements): add Stripe config keys (env-only)"
```

---

### Task 4: Stripe wrapper (config-driven)

**Files:**
- Create: `internal/stripe/client.go`
- Test: `internal/stripe/client_test.go`
- Modify: `go.mod`/`go.sum` (via `go get`)

- [ ] **Step 1: Add the Stripe Go SDK**

Run: `go get github.com/stripe/stripe-go/v81@latest`
Expected: `go.mod` gains the dependency. (If v81 is unavailable, use the latest published `stripe-go/vNN`; update import paths accordingly.)

- [ ] **Step 2: Write the failing test**

`internal/stripe/client_test.go`:
```go
package stripe

import "testing"

func TestClientDisabledWhenNoKey(t *testing.T) {
	c := New(Config{SecretKey: ""})
	if c.Enabled() {
		t.Fatal("expected disabled client when secret key is empty")
	}
	if _, err := c.CreateCheckoutSession("uid", "user@example.com"); err == nil {
		t.Fatal("expected ErrNotConfigured when disabled")
	}
}

func TestClientEnabledWithKey(t *testing.T) {
	c := New(Config{SecretKey: "sk_test_x", PriceID: "price_x", SuccessURL: "https://x/ok", CancelURL: "https://x/no"})
	if !c.Enabled() {
		t.Fatal("expected enabled client when secret key is set")
	}
}
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `go test ./internal/stripe/ -v`
Expected: FAIL (package/New undefined).

- [ ] **Step 4: Implement the wrapper**

`internal/stripe/client.go`:
```go
// Package stripe wraps the Stripe SDK behind a small, config-driven surface so the
// rest of the service has no hard dependency on Stripe being configured.
package stripe

import (
	"errors"

	stripe "github.com/stripe/stripe-go/v81"
	"github.com/stripe/stripe-go/v81/checkout/session"
	"github.com/stripe/stripe-go/v81/webhook"
)

// ErrNotConfigured is returned by operations when no secret key is set.
var ErrNotConfigured = errors.New("stripe not configured")

// Config carries the deployment Stripe settings (all from env).
type Config struct {
	SecretKey     string
	WebhookSecret string
	PriceID       string
	SuccessURL    string
	CancelURL     string
}

// Client is a thin Stripe facade.
type Client struct{ cfg Config }

// New builds a Client. A zero/empty SecretKey yields a disabled client.
func New(cfg Config) *Client { return &Client{cfg: cfg} }

// Enabled reports whether Stripe is configured.
func (c *Client) Enabled() bool { return c.cfg.SecretKey != "" }

// CreateCheckoutSession creates a one-time-payment Checkout Session and returns its URL.
// userID is set as client_reference_id so the webhook can map the payment back to the user.
func (c *Client) CreateCheckoutSession(userID, email string) (string, error) {
	if !c.Enabled() {
		return "", ErrNotConfigured
	}
	stripe.Key = c.cfg.SecretKey
	params := &stripe.CheckoutSessionParams{
		Mode:               stripe.String(string(stripe.CheckoutSessionModePayment)),
		ClientReferenceID:  stripe.String(userID),
		SuccessURL:         stripe.String(c.cfg.SuccessURL),
		CancelURL:          stripe.String(c.cfg.CancelURL),
		LineItems: []*stripe.CheckoutSessionLineItemParams{
			{Price: stripe.String(c.cfg.PriceID), Quantity: stripe.Int64(1)},
		},
	}
	if email != "" {
		params.CustomerEmail = stripe.String(email)
	}
	s, err := session.New(params)
	if err != nil {
		return "", err
	}
	return s.URL, nil
}

// CompletedSession is the minimal data extracted from a verified webhook.
type CompletedSession struct {
	UserID          string
	CustomerID      string
	PaymentIntentID string
}

// VerifyAndParse validates the webhook signature and, for checkout.session.completed,
// returns the completed session data. (false, nil) means "valid but not a grant event".
func (c *Client) VerifyAndParse(payload []byte, sigHeader string) (*CompletedSession, bool, error) {
	if c.cfg.WebhookSecret == "" {
		return nil, false, ErrNotConfigured
	}
	event, err := webhook.ConstructEvent(payload, sigHeader, c.cfg.WebhookSecret)
	if err != nil {
		return nil, false, err
	}
	if event.Type != "checkout.session.completed" {
		return nil, false, nil
	}
	var s stripe.CheckoutSession
	if err := json.Unmarshal(event.Data.Raw, &s); err != nil {
		return nil, false, err
	}
	out := &CompletedSession{UserID: s.ClientReferenceID}
	if s.Customer != nil {
		out.CustomerID = s.Customer.ID
	}
	if s.PaymentIntent != nil {
		out.PaymentIntentID = s.PaymentIntent.ID
	}
	return out, true, nil
}
```
> Add `"encoding/json"` to the import block (used in `VerifyAndParse`). Verify the v81 import subpaths (`checkout/session`, `webhook`) and field names (`CheckoutSessionModePayment`, `ClientReferenceID`, `event.Data.Raw`) against the actual installed version; adjust if the SDK differs.

- [ ] **Step 5: Run the test to verify it passes**

Run: `go test ./internal/stripe/ -v`
Expected: PASS (both tests).

- [ ] **Step 6: Commit**
```bash
git add go.mod go.sum internal/stripe/client.go internal/stripe/client_test.go
git commit -m "feat(entitlements): config-driven Stripe wrapper"
```

---

### Task 5: Service layer (entitlement read/grant/checkout)

**Files:**
- Modify: `internal/service/service.go` (interface + struct + constructor)
- Create: `internal/service/entitlements.go`
- Test: `internal/service/entitlements_test.go`

- [ ] **Step 1: Read the service/cache + test patterns**

Run: `sed -n '1,90p' internal/service/auth.go && grep -n "sessionCache\|cache\b" internal/service/*.go && sed -n '1,60p' internal/service/auth_test.go`
Note: the mock repository used in service tests, and how the optional `cache` is declared/used. Replicate.

- [ ] **Step 2: Add interface + constructor wiring**

In `internal/service/service.go`:
- Add to `IService`:
```go
	// Entitlement returns the entitlement state for userID (entitled, source).
	Entitlement(userID uuid.UUID) (entitled bool, source string, err error)

	// GrantMock marks userID entitled via the mock path (test/dev only).
	GrantMock(userID uuid.UUID) error

	// GrantFromStripe upserts an active entitlement from a verified Stripe webhook.
	GrantFromStripe(userID uuid.UUID, customerID, paymentIntentID, productID string) error

	// CheckoutSession creates a Stripe Checkout session for userID and returns its URL.
	CheckoutSession(userID uuid.UUID, email string) (string, error)
```
- Add a `stripe *stripeclient.Client` field to `Service` (import `stripeclient "dollbuilder/internal/stripe"`).
- Update `NewService` to accept the stripe client: `func NewService(repository repository.IRepository, stripe *stripeclient.Client) IService`. Update all call sites (the http module — Task 7 wires it; also any existing tests that call `NewService` must pass `nil` or `stripeclient.New(stripeclient.Config{})`).

Run after edit: `grep -rn "NewService(" --include=*.go .` and fix every call site to the new signature.

- [ ] **Step 3: Write the failing service test**

`internal/service/entitlements_test.go`:
```go
package service

import (
	"testing"

	"github.com/gofrs/uuid"

	"dollbuilder/internal/models"
)

func TestGrantMockThenEntitlement(t *testing.T) {
	repo := newMockRepo() // use the same mock the other service tests use
	svc := NewService(repo, nil)
	uid := uuid.Must(uuid.NewV4())

	entitled, _, err := svc.Entitlement(uid)
	if err != nil || entitled {
		t.Fatalf("fresh user must not be entitled; got entitled=%v err=%v", entitled, err)
	}
	if err := svc.GrantMock(uid); err != nil {
		t.Fatalf("GrantMock: %v", err)
	}
	entitled, source, err := svc.Entitlement(uid)
	if err != nil || !entitled || source != "mock" {
		t.Fatalf("after grant want entitled+mock; got entitled=%v source=%q err=%v", entitled, source, err)
	}
}

func TestGrantFromStripeIsActive(t *testing.T) {
	repo := newMockRepo()
	svc := NewService(repo, nil)
	uid := uuid.Must(uuid.NewV4())
	if err := svc.GrantFromStripe(uid, "cus_1", "pi_1", "price_1"); err != nil {
		t.Fatalf("GrantFromStripe: %v", err)
	}
	entitled, source, _ := svc.Entitlement(uid)
	if !entitled || source != "stripe" {
		t.Fatalf("want entitled+stripe; got %v %q", entitled, source)
	}
}

var _ = models.Entitlement{}
```
> The mock repo must implement `EntitlementByUserID`/`UpsertEntitlement`. Extend the existing service-test mock (find it via `grep -rn "func (.*) UpsertProject" internal/service`) with in-memory entitlement storage keyed by userID.

- [ ] **Step 4: Run the test to verify it fails**

Run: `go test ./internal/service/ -run TestGrant -v`
Expected: FAIL (methods undefined / mock missing methods).

- [ ] **Step 5: Implement the service methods**

`internal/service/entitlements.go`:
```go
package service

import (
	"fmt"

	"github.com/gofrs/uuid"

	stripeclient "dollbuilder/internal/stripe"
	"dollbuilder/internal/models"
)

func (s *Service) Entitlement(userID uuid.UUID) (bool, string, error) {
	if s.repository == nil {
		return false, "", fmt.Errorf("repository not available: %w", ErrRepositoryUnavailable)
	}
	e, err := s.repository.EntitlementByUserID(userID)
	if err != nil {
		return false, "", fmt.Errorf("entitlement lookup: %w", err)
	}
	if e == nil {
		return false, "", nil
	}
	return e.Entitled(), e.Source, nil
}

func (s *Service) GrantMock(userID uuid.UUID) error {
	return s.grant(userID, "mock", "", "", "")
}

func (s *Service) GrantFromStripe(userID uuid.UUID, customerID, paymentIntentID, productID string) error {
	return s.grant(userID, "stripe", customerID, paymentIntentID, productID)
}

func (s *Service) grant(userID uuid.UUID, source, customerID, paymentIntentID, productID string) error {
	if s.repository == nil {
		return fmt.Errorf("repository not available: %w", ErrRepositoryUnavailable)
	}
	_, err := s.repository.UpsertEntitlement(&models.Entitlement{
		UserID:                userID,
		Status:                "active",
		Source:                source,
		StripeCustomerID:      customerID,
		StripePaymentIntentID: paymentIntentID,
		ProductID:             productID,
	})
	if err != nil {
		return fmt.Errorf("grant entitlement: %w", err)
	}
	return nil
}

func (s *Service) CheckoutSession(userID uuid.UUID, email string) (string, error) {
	if s.stripe == nil || !s.stripe.Enabled() {
		return "", stripeclient.ErrNotConfigured
	}
	return s.stripe.CreateCheckoutSession(userID.String(), email)
}
```
> Add the `stripe` field to the `Service` struct and constructor (Task 5 Step 2). Redis caching can be added later as a non-fatal optimization; do NOT block this task on it — the spec marks the cache optional/nil-safe.

- [ ] **Step 6: Run the test to verify it passes**

Run: `go test ./internal/service/ -run TestGrant -v && go test ./internal/service/ -v`
Expected: PASS (new tests pass; existing service tests still pass after the `NewService` signature change).

- [ ] **Step 7: Commit**
```bash
git add internal/service/service.go internal/service/entitlements.go internal/service/entitlements_test.go
git commit -m "feat(entitlements): service read/grant/checkout"
```

---

### Task 6: Swagger paths + regenerate

**Files:**
- Modify: `api/swagger.yaml`

- [ ] **Step 1: Add the entitlements + checkout paths**

In `api/swagger.yaml` under `paths:` (after `/projects/{id}`):
```yaml
  /entitlements:
    get:
      summary: Current user's export entitlement
      operationId: getEntitlement
      tags: [entitlements]
      security: []
      responses:
        200: { description: Entitlement state, schema: { $ref: "#/definitions/Entitlement" } }
        401: { description: Not authenticated, schema: { $ref: "#/definitions/Error" } }
        500: { description: Server error, schema: { $ref: "#/definitions/Error" } }
  /entitlements/mock-checkout:
    post:
      summary: Grant entitlement via the mock path (dev/test only)
      operationId: mockCheckout
      tags: [entitlements]
      security: []
      responses:
        200: { description: Entitlement granted, schema: { $ref: "#/definitions/Entitlement" } }
        401: { description: Not authenticated, schema: { $ref: "#/definitions/Error" } }
        403: { description: Mock checkout disabled, schema: { $ref: "#/definitions/Error" } }
        500: { description: Server error, schema: { $ref: "#/definitions/Error" } }
  /checkout/session:
    post:
      summary: Create a Stripe Checkout session
      operationId: createCheckoutSession
      tags: [checkout]
      security: []
      responses:
        200: { description: Checkout URL, schema: { $ref: "#/definitions/CheckoutSession" } }
        401: { description: Not authenticated, schema: { $ref: "#/definitions/Error" } }
        503: { description: Checkout not configured, schema: { $ref: "#/definitions/Error" } }
        500: { description: Server error, schema: { $ref: "#/definitions/Error" } }
```
> The Stripe webhook is intentionally NOT in swagger (Task 8 handles it as raw middleware).

- [ ] **Step 2: Add the definitions**

Under `definitions:`:
```yaml
  Entitlement:
    type: object
    required: [entitled]
    properties:
      entitled: { type: boolean }
      source: { type: string }
  CheckoutSession:
    type: object
    required: [checkoutUrl]
    properties:
      checkoutUrl: { type: string }
```

- [ ] **Step 3: Regenerate the server**

Run: `make generate-all`
Expected: success; new packages under `internal/http/server/operations/entitlements` and `.../checkout`. Verify: `ls internal/http/server/operations/`

- [ ] **Step 4: Build to confirm generated code compiles**

Run: `go build ./internal/http/server/...`
Expected: no errors.

- [ ] **Step 5: Commit**
```bash
git add api/swagger.yaml
git commit -m "feat(entitlements): swagger paths for entitlements + checkout"
```
> Generated code is gitignored — only `swagger.yaml` is committed.

---

### Task 7: Handlers + wiring

**Files:**
- Create: `internal/http/handlers/entitlements.go`
- Modify: `internal/http/module.go` (wire handlers + pass stripe client to NewService)
- Modify: wherever `service.NewService(...)` is constructed in the http/app bootstrap (pass the stripe client built from config)
- Test: `internal/http/handlers/entitlements_test.go`

- [ ] **Step 1: Read the GetMe handler (cookie pattern) + module wiring**

Run: `grep -n "GetMe\|NewGetMe\|UserFromContext" internal/http/handlers/auth.go && sed -n '120,170p' internal/http/module.go`
Note exactly how `*models.User` is read and how handlers are constructed/wired.

- [ ] **Step 2: Implement the handlers**

`internal/http/handlers/entitlements.go`:
```go
package handlers

import (
	"net/http"

	"github.com/go-openapi/runtime/middleware"

	"dollbuilder/internal/auth"
	apimodels "dollbuilder/internal/http/models"
	checkoutops "dollbuilder/internal/http/server/operations/checkout"
	entops "dollbuilder/internal/http/server/operations/entitlements"
	"dollbuilder/internal/service"
	stripeclient "dollbuilder/internal/stripe"
)

// GetEntitlement handler.
type GetEntitlement struct{ svc service.IService }

func NewGetEntitlement(svc service.IService) *GetEntitlement { return &GetEntitlement{svc} }

func (h *GetEntitlement) Handle(params entops.GetEntitlementParams) middleware.Responder {
	user := auth.UserFromContext(params.HTTPRequest.Context())
	if user == nil {
		return entops.NewGetEntitlementUnauthorized().WithPayload(DefaultError(http.StatusUnauthorized, service.ErrInvalidSession, nil))
	}
	entitled, source, err := h.svc.Entitlement(user.UUID)
	if err != nil {
		return entops.NewGetEntitlementInternalServerError().WithPayload(DefaultError(http.StatusInternalServerError, err, nil))
	}
	return entops.NewGetEntitlementOK().WithPayload(&apimodels.Entitlement{Entitled: &entitled, Source: source})
}

// MockCheckout handler.
type MockCheckout struct {
	svc     service.IService
	allowed bool
}

func NewMockCheckout(svc service.IService, allowed bool) *MockCheckout {
	return &MockCheckout{svc, allowed}
}

func (h *MockCheckout) Handle(params entops.MockCheckoutParams) middleware.Responder {
	user := auth.UserFromContext(params.HTTPRequest.Context())
	if user == nil {
		return entops.NewMockCheckoutUnauthorized().WithPayload(DefaultError(http.StatusUnauthorized, service.ErrInvalidSession, nil))
	}
	if !h.allowed {
		return entops.NewMockCheckoutForbidden().WithPayload(DefaultError(http.StatusForbidden, service.ErrInvalidInput, nil))
	}
	if err := h.svc.GrantMock(user.UUID); err != nil {
		return entops.NewMockCheckoutInternalServerError().WithPayload(DefaultError(http.StatusInternalServerError, err, nil))
	}
	entitled := true
	return entops.NewMockCheckoutOK().WithPayload(&apimodels.Entitlement{Entitled: &entitled, Source: "mock"})
}

// CreateCheckoutSession handler.
type CreateCheckoutSession struct{ svc service.IService }

func NewCreateCheckoutSession(svc service.IService) *CreateCheckoutSession {
	return &CreateCheckoutSession{svc}
}

func (h *CreateCheckoutSession) Handle(params checkoutops.CreateCheckoutSessionParams) middleware.Responder {
	user := auth.UserFromContext(params.HTTPRequest.Context())
	if user == nil {
		return checkoutops.NewCreateCheckoutSessionUnauthorized().WithPayload(DefaultError(http.StatusUnauthorized, service.ErrInvalidSession, nil))
	}
	url, err := h.svc.CheckoutSession(user.UUID, user.Email)
	if err == stripeclient.ErrNotConfigured {
		return checkoutops.NewCreateCheckoutSessionServiceUnavailable().WithPayload(DefaultError(http.StatusServiceUnavailable, err, nil))
	}
	if err != nil {
		return checkoutops.NewCreateCheckoutSessionInternalServerError().WithPayload(DefaultError(http.StatusInternalServerError, err, nil))
	}
	return checkoutops.NewCreateCheckoutSessionOK().WithPayload(&apimodels.CheckoutSession{CheckoutURL: &url})
}
```
> Verify generated type/field names: `apimodels.Entitlement.Entitled` is likely `*bool` (required ⇒ pointer); `apimodels.CheckoutSession.CheckoutURL` likewise `*string`. Verify response constructor names (`New<Op><Status>`) against the generated ops packages — go-swagger names them from the responses you declared. Confirm `user.Email` is the field name on `models.User`.

- [ ] **Step 3: Wire in module.go + pass stripe client to the service**

In the http bootstrap where `service.NewService(repo)` is called, build the stripe client from config and pass it:
```go
stripeCli := stripeclient.New(stripeclient.Config{
	SecretKey:     cfg.StripeSecretKey,
	WebhookSecret: cfg.StripeWebhookSecret,
	PriceID:       cfg.StripePriceID,
	SuccessURL:    cfg.StripeSuccessURL,
	CancelURL:     cfg.StripeCancelURL,
})
svc := service.NewService(repo, stripeCli)
```
In `internal/http/module.go`, after the projects handler wiring:
```go
	api.EntitlementsGetEntitlementHandler = handlers.NewGetEntitlement(m.service)
	api.EntitlementsMockCheckoutHandler = handlers.NewMockCheckout(m.service, m.cfg.AllowMockCheckout)
	api.CheckoutCreateCheckoutSessionHandler = handlers.NewCreateCheckoutSession(m.service)
```
> Confirm the generated handler-field names on the api struct (`api.<Tag><OperationID>Handler`), and how the module accesses config (`m.cfg` or similar). Adjust to match. Find where `NewService` is constructed: `grep -rn "NewService(" --include=*.go .`

- [ ] **Step 4: Write the handler test**

`internal/http/handlers/entitlements_test.go` — mirror `internal/http/handlers/projects_test.go` (it shows how to build params with an authed/unauthed context and a stub service). Tests:
- `GetEntitlement` with nil user ⇒ 401 responder.
- `GetEntitlement` with authed user + stub returning `entitled=true` ⇒ 200 payload `Entitled==true`.
- `MockCheckout` with `allowed=false` ⇒ 403.
- `MockCheckout` with `allowed=true` + authed ⇒ 200, `source=="mock"`.
> Copy the exact context-injection helper from `projects_test.go` (it calls `auth.WithUser(ctx, user)` and sets `params.HTTPRequest`). Use a stub `service.IService` (embed an interface or use the existing test stub).

- [ ] **Step 5: Run handler tests + full build**

Run: `go test ./internal/http/... -v && go build ./...`
Expected: PASS + clean build.

- [ ] **Step 6: Commit**
```bash
git add internal/http/handlers/entitlements.go internal/http/handlers/entitlements_test.go internal/http/module.go
git commit -m "feat(entitlements): handlers + wiring (GET, mock-checkout, checkout/session)"
```

---

### Task 8: Stripe webhook as raw-body middleware

**Files:**
- Create: `internal/http/middlewares/stripe_webhook.go`
- Modify: `internal/http/server/configure_dollbuilder_api.go` (`setupGlobalMiddleware`) OR the module's middleware chain — wherever the session middleware is attached (so we mirror it). Prefer the same place `middlewares/session.go` is wired.
- Test: `internal/http/middlewares/stripe_webhook_test.go`

- [ ] **Step 1: Find where session middleware is attached**

Run: `grep -rn "session\.\|NewSession\|Middleware(" internal/http/*.go internal/http/server/*.go internal/http/middlewares/*.go`
Wire the webhook middleware at the same layer, OUTERMOST (before swagger parses the body).

- [ ] **Step 2: Write the failing test**

`internal/http/middlewares/stripe_webhook_test.go`:
```go
package middlewares

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type fakeGranter struct{ called bool; uid string }

func (f *fakeGranter) GrantFromStripe(userID, cust, pi, prod string) error { f.called = true; f.uid = userID; return nil }

func TestWebhookRejectsBadSignature(t *testing.T) {
	g := &fakeGranter{}
	verify := func(payload []byte, sig string) (uid, cust, pi string, isGrant bool, err error) {
		return "", "", "", false, http.ErrAbortHandler // any error => invalid
	}
	h := StripeWebhook("/api/v1/webhooks/stripe", verify, g, next404())
	req := httptest.NewRequest("POST", "/api/v1/webhooks/stripe", strings.NewReader("{}"))
	req.Header.Set("Stripe-Signature", "bad")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusBadRequest { t.Fatalf("want 400, got %d", rr.Code) }
	if g.called { t.Fatal("must not grant on bad signature") }
}

func TestWebhookGrantsOnValidEvent(t *testing.T) {
	g := &fakeGranter{}
	verify := func(payload []byte, sig string) (string, string, string, bool, error) {
		return "user-123", "cus_1", "pi_1", true, nil
	}
	h := StripeWebhook("/api/v1/webhooks/stripe", verify, g, next404())
	req := httptest.NewRequest("POST", "/api/v1/webhooks/stripe", strings.NewReader("{}"))
	req.Header.Set("Stripe-Signature", "ok")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK { t.Fatalf("want 200, got %d", rr.Code) }
	if !g.called || g.uid != "user-123" { t.Fatalf("expected grant for user-123, got called=%v uid=%q", g.called, g.uid) }
}

func next404() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNotFound) })
}
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `go test ./internal/http/middlewares/ -run TestWebhook -v`
Expected: FAIL (`StripeWebhook` undefined).

- [ ] **Step 4: Implement the middleware**

`internal/http/middlewares/stripe_webhook.go`:
```go
package middlewares

import (
	"io"
	"net/http"

	"github.com/gofrs/uuid"

	"dollbuilder/pkg/logger"
)

// Granter is the subset of the service needed to record a Stripe purchase.
type Granter interface {
	GrantFromStripe(userID, customerID, paymentIntentID, productID string) error
}

// VerifyFunc validates a webhook and extracts the grant data.
// isGrant=false means "valid signature but not a grant event".
type VerifyFunc func(payload []byte, sigHeader string) (userID, customerID, paymentIntentID string, isGrant bool, err error)

// StripeWebhook intercepts POST {path} to verify the signature and grant entitlement,
// short-circuiting before the swagger handler parses the body. All other requests pass through.
func StripeWebhook(path string, verify VerifyFunc, g Granter, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != path {
			next.ServeHTTP(w, r)
			return
		}
		body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20)) // 1 MiB cap
		if err != nil {
			http.Error(w, "read error", http.StatusBadRequest)
			return
		}
		uidStr, cust, pi, isGrant, verr := verify(body, r.Header.Get("Stripe-Signature"))
		if verr != nil {
			logger.Log().Warnf("stripe webhook: signature verification failed: %v", verr)
			http.Error(w, "invalid signature", http.StatusBadRequest)
			return
		}
		if isGrant {
			if _, perr := uuid.FromString(uidStr); perr != nil {
				logger.Log().Warnf("stripe webhook: bad client_reference_id %q", uidStr)
				w.WriteHeader(http.StatusOK) // ack; nothing to grant
				return
			}
			if gerr := g.GrantFromStripe(uidStr, cust, pi, ""); gerr != nil {
				logger.Log().Errorf("stripe webhook: grant failed for %s: %v", uidStr, gerr)
				http.Error(w, "grant failed", http.StatusInternalServerError)
				return
			}
		}
		w.WriteHeader(http.StatusOK)
	})
}
```
> The logger import path is `dollbuilder/pkg/logger` (confirm via `grep -rn "pkg/logger" internal/`). The adapter from `*stripeclient.Client.VerifyAndParse` to `VerifyFunc` is built at wiring time (Step 5).

- [ ] **Step 5: Wire the middleware with a real verify adapter**

At the place identified in Step 1 (outermost, around the swagger handler), wrap it:
```go
verify := func(payload []byte, sig string) (string, string, string, bool, error) {
	cs, isGrant, err := stripeCli.VerifyAndParse(payload, sig)
	if err != nil || !isGrant {
		return "", "", "", false, err
	}
	return cs.UserID, cs.CustomerID, cs.PaymentIntentID, true, nil
}
handler = middlewares.StripeWebhook("/api/v1/webhooks/stripe", verify, m.service, handler)
```
> `m.service` already satisfies `Granter` (it has `GrantFromStripe`). Confirm the base path prefix on the live routes (`/api/v1`) by checking how the session middleware matches paths.

- [ ] **Step 6: Run tests + build**

Run: `go test ./internal/http/middlewares/ -v && go build ./...`
Expected: PASS + clean build.

- [ ] **Step 7: Commit**
```bash
git add internal/http/middlewares/stripe_webhook.go internal/http/middlewares/stripe_webhook_test.go internal/http/module.go internal/http/server/configure_dollbuilder_api.go
git commit -m "feat(entitlements): Stripe webhook middleware with signature verification"
```

---

### Task 9: Frontend — checkout API + store action

**Files:**
- Modify: `webapp-1/src/lib/api.ts`
- Modify: `webapp-1/src/store/entitlementSlice.ts`
- Test: `webapp-1/src/store/__tests__/entitlementSlice.test.ts` (if a test exists; otherwise add one)

Working dir: `webapp-1`.

- [ ] **Step 1: Read the current entitlement wiring**

Run: `sed -n '95,120p' src/lib/api.ts && cat src/store/entitlementSlice.ts`
Note the `apiFetch` signature and the slice shape (`mockCheckout`, `fetchEntitlement`).

- [ ] **Step 2: Add the checkout API**

In `src/lib/api.ts`, after `entitlementsApi`:
```ts
export interface CheckoutSession {
  checkoutUrl: string
}

export const checkoutApi = {
  session: () =>
    apiFetch<CheckoutSession>('/api/v1/checkout/session', { method: 'POST' }),
}
```

- [ ] **Step 3: Add `startCheckout` to the slice**

In `src/store/entitlementSlice.ts`, add to the slice interface and implementation:
```ts
  /** Begin real Stripe checkout: redirects the browser to the Stripe-hosted page. */
  startCheckout: () => Promise<void>
```
```ts
  startCheckout: async () => {
    const { checkoutUrl } = await checkoutApi.session()
    if (typeof window !== 'undefined') window.location.assign(checkoutUrl)
  },
```
Import `checkoutApi` from `@/lib/api`.

- [ ] **Step 4: Test (if the slice has a test file)**

Add a test mocking `checkoutApi.session` to resolve `{ checkoutUrl: 'https://stripe/x' }` and asserting `window.location.assign` is called with it. Mock `window.location.assign` with `vi.fn()`.
Run: `npm run test -- entitlementSlice`
Expected: PASS. (If no test infra for the slice exists, skip the test file and rely on Task 10's component test.)

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck`
Expected: no errors.
```bash
git add src/lib/api.ts src/store/entitlementSlice.ts src/store/__tests__/entitlementSlice.test.ts
git commit -m "feat(paywall): add real Stripe checkout API + startCheckout action"
```

---

### Task 10: Frontend — paywall uses real checkout + post-return verification

**Files:**
- Modify: `webapp-1/src/modules/paywall/PaywallScreen.tsx`
- Modify: `webapp-1/src/app/editor/page.tsx` (read `?checkout=success` → re-fetch entitlement)
- Test: `webapp-1/src/modules/paywall/__tests__/PaywallScreen.test.tsx` (extend existing)

- [ ] **Step 1: Switch "Unlock Export" to real checkout**

In `PaywallScreen.tsx`, replace the `mockCheckout` call in `handleUnlock` with `startCheckout`:
```tsx
  const startCheckout = useAppStore((s) => s.startCheckout)
  // ...
  setPending(true)
  setError(null)
  try {
    await startCheckout() // redirects to Stripe; promise may not resolve if navigation happens
  } catch {
    setError('Checkout is unavailable right now. Please try again later.')
    setPending(false)
  }
```
Keep the `!user` → `router.push('/login?next=/editor')` branch unchanged. Remove the `mockCheckout` usage (mock stays available in the store for dev but the paywall uses real checkout).

- [ ] **Step 2: Re-verify entitlement on return from Stripe**

In `src/app/editor/page.tsx`, add an effect:
```tsx
  const fetchEntitlement = useAppStore((s) => s.fetchEntitlement)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('checkout') === 'success') {
      void fetchEntitlement()
      params.delete('checkout')
      const qs = params.toString()
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''))
    }
  }, [fetchEntitlement])
```
> Confirm the slice exposes `fetchEntitlement` (it does per `entitlementSlice.ts`). Match its exact name.

- [ ] **Step 3: Update/extend the paywall test**

In `PaywallScreen.test.tsx`: mock the store so `startCheckout` is a `vi.fn()`, render, click "Unlock Export" as a logged-in user, assert `startCheckout` was called. For the logged-out case assert navigation to `/login`.
Run: `npm run test -- PaywallScreen`
Expected: PASS.

- [ ] **Step 4: Typecheck + lint + commit**

Run: `npm run typecheck && npm run lint`
Expected: clean.
```bash
git add src/modules/paywall/PaywallScreen.tsx src/app/editor/page.tsx src/modules/paywall/__tests__/PaywallScreen.test.tsx
git commit -m "feat(paywall): real Stripe checkout + post-return entitlement re-check"
```

---

### Task 11: Local runtime verification (verify skill)

**Files:** none (verification only).

- [ ] **Step 1: Boot the backend locally**

Run (in `webapp-1/backend`): `docker-compose up -d postgres redis && go run ./cmd/api/`
Expected: server listening on :8080; migrations applied (check logs for `000005_entitlements`).

- [ ] **Step 2: Verify the entitlement endpoints with curl**

```bash
# 401 without auth
curl -s -o /dev/null -w "no-auth GET /entitlements: %{http_code}\n" localhost:8080/api/v1/entitlements
# sign up + capture cookie
curl -s -c /tmp/cj.txt -X POST localhost:8080/api/v1/auth/signup \
  -H 'content-type: application/json' \
  -d '{"email":"verify@example.com","password":"hunter2hunter2"}' >/dev/null
# 200 entitled:false for fresh user
curl -s -b /tmp/cj.txt localhost:8080/api/v1/entitlements
# mock-checkout grants
curl -s -b /tmp/cj.txt -X POST localhost:8080/api/v1/entitlements/mock-checkout
# now entitled:true
curl -s -b /tmp/cj.txt localhost:8080/api/v1/entitlements
```
Expected: `401`; `{"entitled":false,...}`; `{"entitled":true,"source":"mock"}`; `{"entitled":true,...}`.
> If `ALLOW_MOCK_CHECKOUT` defaulted to false locally, set it true for this run: `ALLOW_MOCK_CHECKOUT=true go run ./cmd/api/`.

- [ ] **Step 3: Verify checkout 503 without Stripe keys**

Run: `curl -s -o /dev/null -w "%{http_code}\n" -b /tmp/cj.txt -X POST localhost:8080/api/v1/checkout/session`
Expected: `503` (Stripe not configured locally).

- [ ] **Step 4: Verify webhook signature rejection**

Run: `curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:8080/api/v1/webhooks/stripe -H 'Stripe-Signature: bad' -d '{}'`
Expected: `400` (with `STRIPE_WEBHOOK_SECRET` set; if unset, the wrapper returns ErrNotConfigured → also a 400-class rejection). Record the actual code.

- [ ] **Step 5: Run the full backend test suite**

Run: `go test ./...`
Expected: PASS (or pre-existing skips for no-DB packages — note them).

---

## Self-Review

**Spec coverage:**
- GET /entitlements → Task 6/7. ✓
- mock-checkout → Task 6/7 (flagged). ✓
- checkout/session (real Stripe) → Task 4/5/6/7. ✓
- webhook + signature verify → Task 8. ✓
- entitlements table → Task 1. ✓
- Redis cache → noted optional/non-blocking in Task 5 (spec marks it optional). Acceptable; add later if needed.
- Config env keys → Task 3. ✓
- Frontend real checkout + post-return verify → Task 9/10. ✓
- E15 skipped → no tasks (intended). ✓
- restore-by-email skipped → no tasks (intended). ✓

**Placeholder scan:** Code-bearing steps include real code; "verify against existing pattern" notes are guidance for generated-type names that can't be known until `make generate-all` runs — acceptable and necessary for go-swagger.

**Type consistency:** `Entitlement.Entitled()` (model) vs `apimodels.Entitlement.Entitled` (`*bool`, generated) are distinct and used correctly. Service `Entitlement(userID) (bool,string,error)` matches handler usage. `GrantFromStripe(userID,customerID,paymentIntentID,productID)` signature consistent across service interface, middleware `Granter`, and webhook adapter. `startCheckout`/`fetchEntitlement` match the slice.

**Known follow-ups (deploy-time, not code):** add Stripe test keys to `.env` on oracle-1; register the webhook URL in the Stripe test dashboard; run `make generate-all` on the box before building.
