# Backend Foundation + Auth — Implementation Plan (Plan 1 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Go modular-monolith backend from `go-microservice-template` with first-party email+password authentication backed by server-side session cookies.

**Architecture:** Copy the template into `webapp-1/backend/`, rename its Go module, and extend its single `service` + `repository` (not new per-feature modules — that matches the template's actual structure). Auth is enforced by a custom `SessionAuth` middleware in the existing `justinas/alice` chain: it reads an httpOnly session cookie, validates the token hash against Postgres, and injects the user into the request context. Handlers read the user via `params.HTTPRequest.Context()`. Login/signup set the cookie via a custom go-swagger `ResponderFunc`. Passwords are hashed with argon2id.

**Tech Stack:** Go 1.24, go-swagger (spec-first HTTP), go-pg (ORM), golang-migrate, Postgres 16, Viper config, Cobra CLI, logrus, `golang.org/x/crypto/argon2`.

**Spec:** `docs/superpowers/specs/2026-06-12-accounts-sync-mocked-paywall-design.md`

**Plan series:** (1) **this plan — foundation + auth**, (2) projects sync, (3) entitlements/mock-paywall, (4) frontend wiring.

---

## File Structure (created/modified in this plan)

```
webapp-1/backend/                         # NEW — copied from go-microservice-template (no .git)
  go.mod                                  # MODIFY — module path → dollbuilder
  Makefile                                # MODIFY — APP, APP_ENTRY_POINT → dollbuilder
  cmd/dollbuilder.go                       # RENAME from microservice-template.go
  docker-compose.yml                      # MODIFY — db name, add app env for cookie/cors/session
  .env.example                            # NEW — documented env vars (no secrets)
  api/swagger.yaml                        # MODIFY — add /auth/* paths + Credentials/AuthResult defs
  db/migrations/000003_auth.up.sql        # NEW — add users.password_hash, sessions table
  db/migrations/000003_auth.down.sql      # NEW
  internal/auth/password.go               # NEW — argon2id hash/verify (pure, testable)
  internal/auth/password_test.go          # NEW
  internal/auth/token.go                  # NEW — session token generate + hash
  internal/auth/token_test.go             # NEW
  internal/auth/context.go                # NEW — user-in-context helpers
  internal/models/user.go                 # MODIFY — add PasswordHash field (go-pg, json:"-")
  internal/models/session.go              # NEW — Session model
  internal/repository/auth.go             # NEW — user+session queries
  internal/repository/auth_test.go        # NEW (integration, build-tagged)
  internal/repository/interface.go        # MODIFY — extend IRepository
  internal/service/auth.go                # NEW — SignUp/Login/Authenticate/Logout
  internal/service/auth_test.go           # NEW
  internal/service/interface.go           # MODIFY — extend IService + sentinel errors
  internal/http/middlewares/session.go    # NEW — SessionAuth middleware
  internal/http/handlers/auth.go          # NEW — signup/login/logout/me handlers
  internal/http/handlers/auth_test.go     # NEW
  internal/http/module.go                 # MODIFY — register handlers + middleware
  internal/http/server/...                # REGENERATED via `make generate-api`
```

> **Note on exact symbol names:** the template's interface file may be named `interface.go`, `irepository.go`, or similar, and the service/repository constructors are `NewService(repo)` / `NewPostgresRepository(...)`. Each task says how to locate the real file (`grep`) before editing — follow the actual names you find; the names above are the expected ones.

---

## Task 1: Copy template into `webapp-1/backend/` and rename module

**Files:**
- Create: `webapp-1/backend/` (whole tree, from template)
- Modify: `webapp-1/backend/go.mod`, `webapp-1/backend/Makefile`
- Rename: `webapp-1/backend/cmd/microservice-template.go` → `cmd/dollbuilder.go`

- [ ] **Step 1: Copy the template without its git history**

```bash
cd /Users/dodonovpavel/gateway_fm/REAL_WORLD_ASSETS/4-ol-do
mkdir -p webapp-1/backend
rsync -a --exclude='.git' --exclude='.idea' --exclude='data/' \
  /Users/dodonovpavel/gateway_fm/go-microservice-template/ webapp-1/backend/
```

- [ ] **Step 2: Confirm it builds before any change (baseline)**

```bash
cd webapp-1/backend && go build ./... 2>&1 | head -20
```
Expected: builds clean (no output) or only known template warnings. If it fails, STOP and report — the copy is wrong.

- [ ] **Step 3: Rename the Go module path `microservice-template` → `dollbuilder`**

```bash
cd /Users/dodonovpavel/gateway_fm/REAL_WORLD_ASSETS/4-ol-do/webapp-1/backend
# go.mod module line
sed -i '' 's|^module microservice-template$|module dollbuilder|' go.mod
# every import of the old module path across .go files
grep -rl 'microservice-template' --include='*.go' . | while read -r f; do
  sed -i '' 's|microservice-template/|dollbuilder/|g' "$f"
done
```

- [ ] **Step 4: Rename app/binary in Makefile and the entrypoint file**

```bash
cd /Users/dodonovpavel/gateway_fm/REAL_WORLD_ASSETS/4-ol-do/webapp-1/backend
sed -i '' 's|^APP:=microservice-template|APP:=dollbuilder|' Makefile
sed -i '' 's|^APP_ENTRY_POINT:=cmd/microservice-template.go|APP_ENTRY_POINT:=cmd/dollbuilder.go|' Makefile
git mv cmd/microservice-template.go cmd/dollbuilder.go 2>/dev/null || mv cmd/microservice-template.go cmd/dollbuilder.go
```

- [ ] **Step 5: Tidy and build to verify the rename is consistent**

```bash
cd /Users/dodonovpavel/gateway_fm/REAL_WORLD_ASSETS/4-ol-do/webapp-1/backend
go mod tidy && go build ./... 2>&1 | head -30
```
Expected: no errors, no remaining references to `microservice-template` (verify: `grep -r microservice-template --include='*.go' . | grep -v _test | head` returns nothing meaningful).

- [ ] **Step 6: Commit**

```bash
cd /Users/dodonovpavel/gateway_fm/REAL_WORLD_ASSETS/4-ol-do
git add webapp-1/backend
git commit -m "Scaffold Go backend from template (module: dollbuilder)"
```

---

## Task 2: Bring up Postgres + run template migrations + verify health

**Files:**
- Modify: `webapp-1/backend/docker-compose.yml` (DB name → `dollbuilder_dev`)

- [ ] **Step 1: Point docker-compose at a `dollbuilder_dev` database**

In `webapp-1/backend/docker-compose.yml`, replace every `microservice_dev` with `dollbuilder_dev` (postgres `POSTGRES_DB`, the `migrate` service `-database` URL, and the `app` service `DATABASE_NAME`). Leave dev user/password as `dev`/`dev` (local only).

- [ ] **Step 2: Start Postgres and apply existing template migrations**

```bash
cd /Users/dodonovpavel/gateway_fm/REAL_WORLD_ASSETS/4-ol-do/webapp-1/backend
docker compose up -d postgres
sleep 3
docker compose run --rm migrate   # applies 000001 + 000002
```
Expected: migrate prints `2/u users_table` (version 2) and exits 0.

- [ ] **Step 3: Run the API and hit health**

```bash
cd /Users/dodonovpavel/gateway_fm/REAL_WORLD_ASSETS/4-ol-do/webapp-1/backend
DATABASE_ENABLED=true DATABASE_HOST=localhost DATABASE_USER=dev DATABASE_PASSWORD=dev \
DATABASE_NAME=dollbuilder_dev HTTP_ENABLED=true HTTP_PORT=8080 HTTP_MOCK_AUTH=true \
go run cmd/dollbuilder.go serve &
sleep 4
curl -s http://localhost:8080/api/v1/health
kill %1
```
Expected: JSON `{"status":"healthy",...}`.

- [ ] **Step 4: Commit**

```bash
cd /Users/dodonovpavel/gateway_fm/REAL_WORLD_ASSETS/4-ol-do
git add webapp-1/backend/docker-compose.yml
git commit -m "Configure backend docker-compose for dollbuilder_dev"
```

---

## Task 3: Migration — add `password_hash` to users, create `sessions` table

**Files:**
- Create: `webapp-1/backend/db/migrations/000003_auth.up.sql`
- Create: `webapp-1/backend/db/migrations/000003_auth.down.sql`

- [ ] **Step 1: Write the up migration**

`db/migrations/000003_auth.up.sql`:
```sql
-- email+password auth: store the argon2id hash on the existing users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text NOT NULL DEFAULT '';

-- server-side sessions (opaque token; only its hash is stored)
CREATE TABLE IF NOT EXISTS sessions
(
    uuid       uuid NOT NULL CONSTRAINT session_uuid_pkey PRIMARY KEY,
    user_uuid  uuid NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
    token_hash text NOT NULL,
    user_agent text,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS session_token_hash_idx ON sessions USING btree(token_hash);
CREATE INDEX IF NOT EXISTS session_user_uuid_idx ON sessions USING btree(user_uuid);
```

- [ ] **Step 2: Write the down migration**

`db/migrations/000003_auth.down.sql`:
```sql
DROP TABLE IF EXISTS sessions;
ALTER TABLE users DROP COLUMN IF EXISTS password_hash;
```

- [ ] **Step 3: Apply and verify**

```bash
cd /Users/dodonovpavel/gateway_fm/REAL_WORLD_ASSETS/4-ol-do/webapp-1/backend
docker compose run --rm migrate
docker compose exec -T postgres psql -U dev -d dollbuilder_dev -c "\d sessions" -c "\d users"
```
Expected: `sessions` table exists with the columns above; `users` now has `password_hash`.

- [ ] **Step 4: Commit**

```bash
cd /Users/dodonovpavel/gateway_fm/REAL_WORLD_ASSETS/4-ol-do
git add webapp-1/backend/db/migrations/000003_auth.up.sql webapp-1/backend/db/migrations/000003_auth.down.sql
git commit -m "Add migration: users.password_hash + sessions table"
```

---

## Task 4: argon2id password hashing (pure package, TDD)

**Files:**
- Create: `webapp-1/backend/internal/auth/password.go`
- Test: `webapp-1/backend/internal/auth/password_test.go`

- [ ] **Step 1: Write the failing test**

`internal/auth/password_test.go`:
```go
package auth

import "testing"

func TestHashAndVerifyPassword(t *testing.T) {
	hash, err := HashPassword("correct horse battery staple")
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}
	if hash == "" {
		t.Fatal("expected non-empty hash")
	}

	ok, err := VerifyPassword("correct horse battery staple", hash)
	if err != nil {
		t.Fatalf("VerifyPassword: %v", err)
	}
	if !ok {
		t.Fatal("expected correct password to verify")
	}

	bad, err := VerifyPassword("wrong password", hash)
	if err != nil {
		t.Fatalf("VerifyPassword(wrong): %v", err)
	}
	if bad {
		t.Fatal("expected wrong password to fail")
	}
}

func TestHashIsSaltedPerCall(t *testing.T) {
	h1, _ := HashPassword("same")
	h2, _ := HashPassword("same")
	if h1 == h2 {
		t.Fatal("expected unique salt per hash")
	}
}
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
cd /Users/dodonovpavel/gateway_fm/REAL_WORLD_ASSETS/4-ol-do/webapp-1/backend
go test ./internal/auth/ -run TestHashAndVerifyPassword -v
```
Expected: FAIL — `undefined: HashPassword`.

- [ ] **Step 3: Implement argon2id hashing**

`internal/auth/password.go`:
```go
// Package auth provides password hashing, session tokens, and request-context
// helpers for first-party email+password authentication.
package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
)

// argon2id parameters (OWASP-recommended baseline).
const (
	argonTime    = 1
	argonMemory  = 64 * 1024 // 64 MB
	argonThreads = 4
	argonKeyLen  = 32
	argonSaltLen = 16
)

// ErrInvalidHash is returned when an encoded hash cannot be parsed.
var ErrInvalidHash = errors.New("invalid password hash format")

// HashPassword returns an encoded argon2id hash string (PHC-like format)
// containing the parameters and salt, safe to store in the DB.
func HashPassword(password string) (string, error) {
	salt := make([]byte, argonSaltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("generate salt: %w", err)
	}
	key := argon2.IDKey([]byte(password), salt, argonTime, argonMemory, argonThreads, argonKeyLen)
	encoded := fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version, argonMemory, argonTime, argonThreads,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(key),
	)
	return encoded, nil
}

// VerifyPassword reports whether password matches the encoded argon2id hash.
func VerifyPassword(password, encoded string) (bool, error) {
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[1] != "argon2id" {
		return false, ErrInvalidHash
	}
	var version int
	if _, err := fmt.Sscanf(parts[2], "v=%d", &version); err != nil {
		return false, ErrInvalidHash
	}
	var memory uint32
	var time uint32
	var threads uint8
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &memory, &time, &threads); err != nil {
		return false, ErrInvalidHash
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return false, ErrInvalidHash
	}
	want, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return false, ErrInvalidHash
	}
	got := argon2.IDKey([]byte(password), salt, time, memory, threads, uint32(len(want)))
	return subtle.ConstantTimeCompare(got, want) == 1, nil
}
```

- [ ] **Step 4: Add the dependency and run tests**

```bash
cd /Users/dodonovpavel/gateway_fm/REAL_WORLD_ASSETS/4-ol-do/webapp-1/backend
go get golang.org/x/crypto/argon2 && go mod tidy
go test ./internal/auth/ -v
```
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/dodonovpavel/gateway_fm/REAL_WORLD_ASSETS/4-ol-do
git add webapp-1/backend/internal/auth webapp-1/backend/go.mod webapp-1/backend/go.sum
git commit -m "Add argon2id password hashing"
```

---

## Task 5: Session token generation + hashing (TDD)

**Files:**
- Create: `webapp-1/backend/internal/auth/token.go`
- Test: `webapp-1/backend/internal/auth/token_test.go`

- [ ] **Step 1: Write the failing test**

`internal/auth/token_test.go`:
```go
package auth

import "testing"

func TestNewSessionTokenUnique(t *testing.T) {
	a, err := NewSessionToken()
	if err != nil {
		t.Fatalf("NewSessionToken: %v", err)
	}
	b, _ := NewSessionToken()
	if a == "" || a == b {
		t.Fatalf("expected two unique non-empty tokens, got %q and %q", a, b)
	}
}

func TestHashTokenStable(t *testing.T) {
	tok, _ := NewSessionToken()
	if HashToken(tok) != HashToken(tok) {
		t.Fatal("HashToken must be deterministic")
	}
	if HashToken(tok) == tok {
		t.Fatal("stored hash must differ from raw token")
	}
}
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
cd /Users/dodonovpavel/gateway_fm/REAL_WORLD_ASSETS/4-ol-do/webapp-1/backend
go test ./internal/auth/ -run TestNewSessionToken -v
```
Expected: FAIL — `undefined: NewSessionToken`.

- [ ] **Step 3: Implement**

`internal/auth/token.go`:
```go
package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
)

// NewSessionToken returns a 256-bit URL-safe random token (the raw value handed
// to the client in a cookie; never stored).
func NewSessionToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generate session token: %w", err)
	}
	return hex.EncodeToString(b), nil
}

// HashToken returns the SHA-256 hex digest of a raw token. Only this digest is
// persisted, so a DB leak does not expose usable session tokens.
func HashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/dodonovpavel/gateway_fm/REAL_WORLD_ASSETS/4-ol-do/webapp-1/backend
go test ./internal/auth/ -v
```
Expected: PASS (all auth tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/dodonovpavel/gateway_fm/REAL_WORLD_ASSETS/4-ol-do
git add webapp-1/backend/internal/auth
git commit -m "Add session token generation + hashing"
```

---

## Task 6: Models — extend User, add Session

**Files:**
- Modify: `webapp-1/backend/internal/models/user.go`
- Create: `webapp-1/backend/internal/models/session.go`

- [ ] **Step 1: Locate the User model and its go-pg tags**

```bash
cd /Users/dodonovpavel/gateway_fm/REAL_WORLD_ASSETS/4-ol-do/webapp-1/backend
sed -n '1,80p' internal/models/user.go
```
Note the struct tag style (go-pg uses `pg:"..."` and the struct has `tableName` / `pg:"users"`).

- [ ] **Step 2: Add `PasswordHash` to the User struct**

In `internal/models/user.go`, add this field to the `User` struct (match the existing tag style; `json:"-"` ensures it is never serialized to API responses):
```go
	PasswordHash string `json:"-" pg:"password_hash"`
```

- [ ] **Step 3: Create the Session model**

`internal/models/session.go`:
```go
package models

import (
	"time"

	"github.com/gofrs/uuid"
)

// Session is a server-side authentication session. Only the SHA-256 hash of the
// raw token is stored; the raw token lives only in the client's httpOnly cookie.
type Session struct {
	tableName struct{} `pg:"sessions"`

	UUID      uuid.UUID `json:"uuid" pg:"uuid,pk,type:uuid"`
	UserUUID  uuid.UUID `json:"user_uuid" pg:"user_uuid,type:uuid"`
	TokenHash string    `json:"-" pg:"token_hash"`
	UserAgent string    `json:"user_agent" pg:"user_agent"`
	ExpiresAt time.Time `json:"expires_at" pg:"expires_at"`
	CreatedAt time.Time `json:"created_at" pg:"created_at"`
}
```

> If the template's `User` model imports a different uuid package (e.g. `github.com/google/uuid`), match it — `grep -h uuid internal/models/user.go` and use the same import path and type (`uuid.UUID`). Adjust the import above accordingly.

- [ ] **Step 4: Build**

```bash
cd /Users/dodonovpavel/gateway_fm/REAL_WORLD_ASSETS/4-ol-do/webapp-1/backend
go build ./internal/models/ 2>&1 | head
```
Expected: builds clean.

- [ ] **Step 5: Commit**

```bash
cd /Users/dodonovpavel/gateway_fm/REAL_WORLD_ASSETS/4-ol-do
git add webapp-1/backend/internal/models
git commit -m "Add PasswordHash to User; add Session model"
```

---

## Task 7: Repository — user + session queries (TDD, integration-tagged)

**Files:**
- Create: `webapp-1/backend/internal/repository/auth.go`
- Modify: `webapp-1/backend/internal/repository/interface.go` (the `IRepository` interface — find real filename first)
- Test: `webapp-1/backend/internal/repository/auth_test.go`

- [ ] **Step 1: Find the repository interface and the existing CreateUser/UserBy methods**

```bash
cd /Users/dodonovpavel/gateway_fm/REAL_WORLD_ASSETS/4-ol-do/webapp-1/backend
grep -rn "type IRepository" internal/repository/
grep -rn "func (r \*PostgresRepository)" internal/repository/ | head
```
Note the exact interface filename and the receiver type name (expected `*PostgresRepository`). Use the real names below.

- [ ] **Step 2: Add methods to the `IRepository` interface**

In the interface file from Step 1, add to `IRepository`:
```go
	CreateUserWithPassword(user *models.User) error
	UserByEmail(email string) (*models.User, error)
	CreateSession(s *models.Session) error
	SessionByTokenHash(tokenHash string) (*models.Session, error)
	DeleteSession(tokenHash string) error
```

- [ ] **Step 3: Implement them**

`internal/repository/auth.go`:
```go
package repository

import (
	"fmt"

	"dollbuilder/internal/models"
)

// CreateUserWithPassword inserts a new user row (including password_hash).
func (r *PostgresRepository) CreateUserWithPassword(user *models.User) error {
	if _, err := r.db.Model(user).Returning("*").Insert(); err != nil {
		return fmt.Errorf("insert user %s: %w", user.Email, err)
	}
	return nil
}

// UserByEmail returns the user with the given email, or a wrapped error.
func (r *PostgresRepository) UserByEmail(email string) (*models.User, error) {
	user := new(models.User)
	if err := r.db.Model(user).Where("email = ?", email).Select(); err != nil {
		return nil, fmt.Errorf("get user by email %s: %w", email, err)
	}
	return user, nil
}

// CreateSession inserts a session row.
func (r *PostgresRepository) CreateSession(s *models.Session) error {
	if _, err := r.db.Model(s).Insert(); err != nil {
		return fmt.Errorf("insert session: %w", err)
	}
	return nil
}

// SessionByTokenHash returns the session for a token hash.
func (r *PostgresRepository) SessionByTokenHash(tokenHash string) (*models.Session, error) {
	s := new(models.Session)
	if err := r.db.Model(s).Where("token_hash = ?", tokenHash).Select(); err != nil {
		return nil, fmt.Errorf("get session by token hash: %w", err)
	}
	return s, nil
}

// DeleteSession removes a session by token hash (logout). Missing rows are not an error.
func (r *PostgresRepository) DeleteSession(tokenHash string) error {
	if _, err := r.db.Model((*models.Session)(nil)).Where("token_hash = ?", tokenHash).Delete(); err != nil {
		return fmt.Errorf("delete session: %w", err)
	}
	return nil
}
```

> The field accessing the go-pg DB handle is whatever the existing methods use (likely `r.db`). Confirm in Step 1 and match it.

- [ ] **Step 4: Write an integration test (build-tagged so unit runs stay fast)**

`internal/repository/auth_test.go`:
```go
//go:build integration

package repository

import (
	"os"
	"testing"
	"time"

	"github.com/gofrs/uuid"
	"dollbuilder/internal/models"
)

// Requires a running Postgres with migrations applied. Run with:
//   DATABASE_URL=postgres://dev:dev@localhost:5432/dollbuilder_dev?sslmode=disable \
//   go test -tags=integration ./internal/repository/ -run TestAuthRepo -v
func TestAuthRepoRoundTrip(t *testing.T) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set")
	}
	repo := newTestRepo(t, dsn) // helper: open go-pg connection from DSN (see note)

	u := &models.User{UUID: uuid.Must(uuid.NewV4()), Email: "repo-test@example.com", Name: "Repo Test", PasswordHash: "x"}
	if err := repo.CreateUserWithPassword(u); err != nil {
		t.Fatalf("CreateUserWithPassword: %v", err)
	}
	got, err := repo.UserByEmail("repo-test@example.com")
	if err != nil || got.UUID != u.UUID {
		t.Fatalf("UserByEmail: %v got=%+v", err, got)
	}

	s := &models.Session{UUID: uuid.Must(uuid.NewV4()), UserUUID: u.UUID, TokenHash: "hash123", ExpiresAt: time.Now().Add(time.Hour)}
	if err := repo.CreateSession(s); err != nil {
		t.Fatalf("CreateSession: %v", err)
	}
	if _, err := repo.SessionByTokenHash("hash123"); err != nil {
		t.Fatalf("SessionByTokenHash: %v", err)
	}
	if err := repo.DeleteSession("hash123"); err != nil {
		t.Fatalf("DeleteSession: %v", err)
	}
}
```

> Implement `newTestRepo(t, dsn)` to mirror how `PostgresRepository` is constructed in the template (find it: `grep -rn "func NewPostgresRepository" internal/repository/`). Use `pg.Connect(pg.ParseURL(dsn))` and wrap in the repo struct. Clean up the test row at the end (`DELETE FROM users WHERE email='repo-test@example.com'`).

- [ ] **Step 5: Run unit build (no integration tag) + the integration test**

```bash
cd /Users/dodonovpavel/gateway_fm/REAL_WORLD_ASSETS/4-ol-do/webapp-1/backend
go build ./internal/repository/
DATABASE_URL=postgres://dev:dev@localhost:5432/dollbuilder_dev?sslmode=disable \
  go test -tags=integration ./internal/repository/ -run TestAuthRepo -v
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/dodonovpavel/gateway_fm/REAL_WORLD_ASSETS/4-ol-do
git add webapp-1/backend/internal/repository
git commit -m "Add user+session repository methods"
```

---

## Task 8: Service — SignUp / Login / Authenticate / Logout (TDD)

**Files:**
- Create: `webapp-1/backend/internal/service/auth.go`
- Modify: `webapp-1/backend/internal/service/interface.go` (find real filename; add methods + sentinel errors)
- Test: `webapp-1/backend/internal/service/auth_test.go`

- [ ] **Step 1: Find the service struct, interface, and existing sentinel errors**

```bash
cd /Users/dodonovpavel/gateway_fm/REAL_WORLD_ASSETS/4-ol-do/webapp-1/backend
grep -rn "type IService\|type Service struct\|func NewService\|ErrNotFound\|ErrInvalidInput\|ErrUnauthorized" internal/service/
```
Note the service struct name (expected `Service`), how it holds the repo (`s.repo`), and the existing sentinel error names.

- [ ] **Step 2: Write the failing test (using a mock repository)**

`internal/service/auth_test.go`:
```go
package service

import (
	"errors"
	"testing"
	"time"

	"github.com/gofrs/uuid"
	"dollbuilder/internal/models"
)

type mockAuthRepo struct {
	users    map[string]*models.User // by email
	sessions map[string]*models.Session
}

func newMockAuthRepo() *mockAuthRepo {
	return &mockAuthRepo{users: map[string]*models.User{}, sessions: map[string]*models.Session{}}
}
func (m *mockAuthRepo) CreateUserWithPassword(u *models.User) error {
	if _, ok := m.users[u.Email]; ok {
		return errors.New("duplicate")
	}
	m.users[u.Email] = u
	return nil
}
func (m *mockAuthRepo) UserByEmail(email string) (*models.User, error) {
	u, ok := m.users[email]
	if !ok {
		return nil, errors.New("not found")
	}
	return u, nil
}
func (m *mockAuthRepo) CreateSession(s *models.Session) error { m.sessions[s.TokenHash] = s; return nil }
func (m *mockAuthRepo) SessionByTokenHash(h string) (*models.Session, error) {
	s, ok := m.sessions[h]
	if !ok {
		return nil, errors.New("not found")
	}
	return s, nil
}
func (m *mockAuthRepo) DeleteSession(h string) error { delete(m.sessions, h); return nil }

func TestSignUpThenLogin(t *testing.T) {
	svc := newAuthService(newMockAuthRepo()) // see Step 4 note for the real constructor

	user, err := svc.SignUp("a@b.com", "hunter2hunter2", "ua")
	if err != nil {
		t.Fatalf("SignUp: %v", err)
	}
	if user.Email != "a@b.com" || user.PasswordHash != "" {
		t.Fatalf("user must not expose hash via API model marshaling; got %+v", user)
	}

	// duplicate email rejected
	if _, err := svc.SignUp("a@b.com", "another-pass", "ua"); !errors.Is(err, ErrEmailTaken) {
		t.Fatalf("expected ErrEmailTaken, got %v", err)
	}

	// login wrong password
	if _, _, err := svc.Login("a@b.com", "wrong", "ua"); !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("expected ErrInvalidCredentials, got %v", err)
	}

	// login correct → raw token
	u2, rawToken, err := svc.Login("a@b.com", "hunter2hunter2", "ua")
	if err != nil || rawToken == "" || u2.UUID != user.UUID {
		t.Fatalf("Login: %v token=%q", err, rawToken)
	}

	// authenticate with the raw token resolves the user
	au, err := svc.Authenticate(rawToken)
	if err != nil || au.UUID != user.UUID {
		t.Fatalf("Authenticate: %v", err)
	}

	// logout invalidates
	if err := svc.Logout(rawToken); err != nil {
		t.Fatalf("Logout: %v", err)
	}
	if _, err := svc.Authenticate(rawToken); !errors.Is(err, ErrInvalidSession) {
		t.Fatalf("expected ErrInvalidSession after logout, got %v", err)
	}
}

func TestAuthenticateExpired(t *testing.T) {
	repo := newMockAuthRepo()
	svc := newAuthService(repo)
	u, _ := svc.SignUp("c@d.com", "password1234", "ua")
	_ = u
	// inject an expired session directly
	repo.sessions["expiredhash"] = &models.Session{UUID: uuid.Must(uuid.NewV4()), ExpiresAt: time.Now().Add(-time.Minute), TokenHash: "expiredhash"}
	if _, err := svc.authenticateByHash("expiredhash"); !errors.Is(err, ErrInvalidSession) {
		t.Fatalf("expected ErrInvalidSession for expired, got %v", err)
	}
}
```

- [ ] **Step 3: Run it to confirm it fails**

```bash
cd /Users/dodonovpavel/gateway_fm/REAL_WORLD_ASSETS/4-ol-do/webapp-1/backend
go test ./internal/service/ -run TestSignUpThenLogin -v
```
Expected: FAIL — undefined `ErrEmailTaken`, `newAuthService`, etc.

- [ ] **Step 4: Implement the auth service**

Add sentinel errors to the service interface file (next to existing ones):
```go
// Auth sentinel errors.
var (
	ErrEmailTaken         = errors.New("email already registered")
	ErrInvalidCredentials = errors.New("invalid email or password")
	ErrInvalidSession     = errors.New("invalid or expired session")
	ErrWeakPassword       = errors.New("password too short")
)
```
And add to the `IService` interface:
```go
	SignUp(email, password, userAgent string) (*models.User, error)
	Login(email, password, userAgent string) (*models.User, string, error) // returns user + raw token
	Authenticate(rawToken string) (*models.User, error)
	Logout(rawToken string) error
```

`internal/service/auth.go`:
```go
package service

import (
	"errors"
	"strings"
	"time"

	"github.com/gofrs/uuid"

	"dollbuilder/internal/auth"
	"dollbuilder/internal/models"
)

// authRepo is the subset of repository methods the auth service needs.
// (The concrete *PostgresRepository satisfies this; tests use a mock.)
type authRepo interface {
	CreateUserWithPassword(*models.User) error
	UserByEmail(string) (*models.User, error)
	CreateSession(*models.Session) error
	SessionByTokenHash(string) (*models.Session, error)
	DeleteSession(string) error
}

const sessionTTL = 30 * 24 * time.Hour

// SignUp creates a user with a hashed password.
func (s *Service) SignUp(email, password, userAgent string) (*models.User, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	if len(password) < 8 {
		return nil, ErrWeakPassword
	}
	if existing, _ := s.repo.UserByEmail(email); existing != nil && existing.Email != "" {
		return nil, ErrEmailTaken
	}
	hash, err := auth.HashPassword(password)
	if err != nil {
		return nil, err
	}
	user := &models.User{
		UUID:         uuid.Must(uuid.NewV4()),
		Email:        email,
		Name:         email,
		PasswordHash: hash,
	}
	if err := s.repo.CreateUserWithPassword(user); err != nil {
		return nil, ErrEmailTaken // unique-violation guard
	}
	return user, nil
}

// Login verifies credentials and creates a session; returns the raw token.
func (s *Service) Login(email, password, userAgent string) (*models.User, string, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	user, err := s.repo.UserByEmail(email)
	if err != nil || user.PasswordHash == "" {
		return nil, "", ErrInvalidCredentials
	}
	ok, err := auth.VerifyPassword(password, user.PasswordHash)
	if err != nil || !ok {
		return nil, "", ErrInvalidCredentials
	}
	raw, err := auth.NewSessionToken()
	if err != nil {
		return nil, "", err
	}
	session := &models.Session{
		UUID:      uuid.Must(uuid.NewV4()),
		UserUUID:  user.UUID,
		TokenHash: auth.HashToken(raw),
		UserAgent: userAgent,
		ExpiresAt: time.Now().Add(sessionTTL),
	}
	if err := s.repo.CreateSession(session); err != nil {
		return nil, "", err
	}
	return user, raw, nil
}

// Authenticate resolves a raw session token to its user.
func (s *Service) Authenticate(rawToken string) (*models.User, error) {
	if rawToken == "" {
		return nil, ErrInvalidSession
	}
	return s.authenticateByHash(auth.HashToken(rawToken))
}

func (s *Service) authenticateByHash(tokenHash string) (*models.User, error) {
	session, err := s.repo.SessionByTokenHash(tokenHash)
	if err != nil {
		return nil, ErrInvalidSession
	}
	if time.Now().After(session.ExpiresAt) {
		_ = s.repo.DeleteSession(tokenHash)
		return nil, ErrInvalidSession
	}
	user, err := s.repo.UserByEmail("") // replaced below
	_ = user
	// fetch by UUID via UserByEmail is wrong; use a UUID lookup:
	return s.userByUUID(session.UserUUID)
}

// Logout deletes the session for a raw token.
func (s *Service) Logout(rawToken string) error {
	return s.repo.DeleteSession(auth.HashToken(rawToken))
}

var _ = errors.Is // keep errors imported if unused after edits
```

> **Resolve the `userByUUID` gap during implementation:** the auth service needs to load a user by UUID for `authenticateByHash`. Add a `UserByUUID(uuid.UUID) (*models.User, error)` repository method (mirror `UserByEmail` with `WherePK()` or `Where("uuid = ?", id)`), add it to `IRepository`, the `authRepo` interface, and the mock. Replace the placeholder block in `authenticateByHash` with a single `return s.repo.UserByUUID(session.UserUUID)`. The test's `mockAuthRepo` must implement `UserByUUID` too (look users up by scanning the map for matching UUID).
>
> If the template's `Service` doesn't expose its repo as `s.repo`, match the real field name found in Step 1.

- [ ] **Step 5: Add a `newAuthService` test helper and run**

In `auth_test.go`, add:
```go
func newAuthService(repo authRepo) *Service { return &Service{repo: repo} }
```
(adjust to the real `Service` field name / constructor). Then:
```bash
cd /Users/dodonovpavel/gateway_fm/REAL_WORLD_ASSETS/4-ol-do/webapp-1/backend
go test ./internal/service/ -run "TestSignUpThenLogin|TestAuthenticateExpired" -v
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/dodonovpavel/gateway_fm/REAL_WORLD_ASSETS/4-ol-do
git add webapp-1/backend/internal/service webapp-1/backend/internal/repository
git commit -m "Add auth service: signup/login/authenticate/logout"
```

---

## Task 9: Swagger spec — add /auth endpoints + regenerate

**Files:**
- Modify: `webapp-1/backend/api/swagger.yaml`
- Regenerated: `webapp-1/backend/internal/http/server/...`

- [ ] **Step 1: Add definitions and paths to `api/swagger.yaml`**

Under `definitions:` add:
```yaml
  Credentials:
    type: object
    required: [email, password]
    properties:
      email:
        type: string
        format: email
        x-example: "user@example.com"
      password:
        type: string
        minLength: 8
        x-example: "hunter2hunter2"

  AuthResult:
    type: object
    required: [user]
    properties:
      user:
        $ref: "#/definitions/User"
```

Under `paths:` add (note `security: []` — auth is enforced by middleware, not swagger):
```yaml
  /auth/signup:
    post:
      summary: Create an account
      operationId: signup
      tags: [auth]
      security: []
      parameters:
        - name: body
          in: body
          required: true
          schema: { $ref: "#/definitions/Credentials" }
      responses:
        200: { description: Created, schema: { $ref: "#/definitions/AuthResult" } }
        400: { description: Invalid input, schema: { $ref: "#/definitions/Error" } }
        409: { description: Email already registered, schema: { $ref: "#/definitions/Error" } }
        500: { description: Server error, schema: { $ref: "#/definitions/Error" } }

  /auth/login:
    post:
      summary: Log in
      operationId: login
      tags: [auth]
      security: []
      parameters:
        - name: body
          in: body
          required: true
          schema: { $ref: "#/definitions/Credentials" }
      responses:
        200: { description: Logged in (sets session cookie), schema: { $ref: "#/definitions/AuthResult" } }
        400: { description: Invalid input, schema: { $ref: "#/definitions/Error" } }
        401: { description: Invalid credentials, schema: { $ref: "#/definitions/Error" } }
        500: { description: Server error, schema: { $ref: "#/definitions/Error" } }

  /auth/logout:
    post:
      summary: Log out
      operationId: logout
      tags: [auth]
      security: []
      responses:
        204: { description: Logged out (clears cookie) }
        500: { description: Server error, schema: { $ref: "#/definitions/Error" } }

  /auth/me:
    get:
      summary: Current user
      operationId: getMe
      tags: [auth]
      security: []
      responses:
        200: { description: Current user, schema: { $ref: "#/definitions/User" } }
        401: { description: Not authenticated, schema: { $ref: "#/definitions/Error" } }
```

- [ ] **Step 2: Install go-swagger if needed, then regenerate**

```bash
cd /Users/dodonovpavel/gateway_fm/REAL_WORLD_ASSETS/4-ol-do/webapp-1/backend
which swagger || go install github.com/go-swagger/go-swagger/cmd/swagger@latest
make generate-api
```
Expected: regeneration succeeds; new operations packages appear under `internal/http/server/operations/auth/` (e.g. `SignupParams`, `NewSignupOK`, etc.). `go mod tidy` runs at the end.

- [ ] **Step 3: Verify it still builds**

```bash
cd /Users/dodonovpavel/gateway_fm/REAL_WORLD_ASSETS/4-ol-do/webapp-1/backend
go build ./... 2>&1 | head -30
```
Expected: builds (handlers not wired yet, but generated code compiles).

- [ ] **Step 4: Commit**

```bash
cd /Users/dodonovpavel/gateway_fm/REAL_WORLD_ASSETS/4-ol-do
git add webapp-1/backend/api webapp-1/backend/internal/http/server
git commit -m "Add /auth/* to swagger spec and regenerate server"
```

---

## Task 10: SessionAuth middleware + context helpers

**Files:**
- Create: `webapp-1/backend/internal/auth/context.go`
- Create: `webapp-1/backend/internal/http/middlewares/session.go`
- Modify: `webapp-1/backend/internal/http/module.go` (add middleware to the alice chain)

- [ ] **Step 1: Context helpers**

`internal/auth/context.go`:
```go
package auth

import (
	"context"

	"dollbuilder/internal/models"
)

type ctxKey int

const userKey ctxKey = 0

// WithUser returns a context carrying the authenticated user.
func WithUser(ctx context.Context, u *models.User) context.Context {
	return context.WithValue(ctx, userKey, u)
}

// UserFromContext returns the authenticated user, or nil if unauthenticated.
func UserFromContext(ctx context.Context) *models.User {
	u, _ := ctx.Value(userKey).(*models.User)
	return u
}
```

- [ ] **Step 2: Locate the middleware package + cookie name expectations**

```bash
cd /Users/dodonovpavel/gateway_fm/REAL_WORLD_ASSETS/4-ol-do/webapp-1/backend
ls internal/http/middlewares/
grep -rn "alice.New" internal/http/module.go
```
Confirm the package name (`middlewares`) and how the chain is built.

- [ ] **Step 3: Write the SessionAuth middleware**

`internal/http/middlewares/session.go`:
```go
package middlewares

import (
	"net/http"

	"dollbuilder/internal/auth"
)

// Authenticator resolves a raw session token to a user (implemented by the service).
type Authenticator interface {
	Authenticate(rawToken string) (*authUser, error)
}

// SessionCookieName is the httpOnly cookie carrying the raw session token.
const SessionCookieName = "db_session"

// SessionAuth reads the session cookie (if present), validates it, and injects
// the user into the request context. It NEVER rejects — endpoints that require
// auth check the context themselves and return 401. This keeps public routes
// (signup/login/health) working through the same chain.
func SessionAuth(authFn func(rawToken string) (interface{}, bool)) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			c, err := r.Cookie(SessionCookieName)
			if err == nil && c.Value != "" {
				if u, ok := authFn(c.Value); ok {
					if user, isUser := u.(*modelsUser); isUser {
						r = r.WithContext(auth.WithUser(r.Context(), user))
					}
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}
```

> **Simplify during implementation:** the indirection above (`authUser`, `modelsUser`, `interface{}`) exists only to avoid an import cycle worry. There is no cycle here — `middlewares` may import both `dollbuilder/internal/auth` and `dollbuilder/internal/models`. So implement it directly and cleanly:
> ```go
> func SessionAuth(authFn func(raw string) (*models.User, error)) func(http.Handler) http.Handler {
>     return func(next http.Handler) http.Handler {
>         return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
>             if c, err := r.Cookie(SessionCookieName); err == nil && c.Value != "" {
>                 if user, err := authFn(c.Value); err == nil && user != nil {
>                     r = r.WithContext(auth.WithUser(r.Context(), user))
>                 }
>             }
>             next.ServeHTTP(w, r)
>         })
>     }
> }
> ```
> Use this direct version (import `dollbuilder/internal/models` and `dollbuilder/internal/auth`). Delete the placeholder types.

- [ ] **Step 4: Add the middleware to the alice chain in `internal/http/module.go`**

Find the `alice.New(...)` chain and add `SessionAuth` after `RateLimit`, wiring it to the service's `Authenticate`:
```go
handler := alice.New(
    middlewares.Recovery(),
    middlewares.Logger(),
    middlewares.Cors(m.config.CORS),
    middlewares.RateLimit(m.config.RateLimit),
    middlewares.SessionAuth(m.service.Authenticate),
).Then(api.Serve(nil))
```
> `m.service.Authenticate` has signature `func(string) (*models.User, error)` — matches the `authFn` param. If the http module field for the service differs (e.g. `m.svc`), use the real name.

- [ ] **Step 5: Build**

```bash
cd /Users/dodonovpavel/gateway_fm/REAL_WORLD_ASSETS/4-ol-do/webapp-1/backend
go build ./... 2>&1 | head -20
```
Expected: builds clean.

- [ ] **Step 6: Commit**

```bash
cd /Users/dodonovpavel/gateway_fm/REAL_WORLD_ASSETS/4-ol-do
git add webapp-1/backend/internal/auth/context.go webapp-1/backend/internal/http/middlewares/session.go webapp-1/backend/internal/http/module.go
git commit -m "Add SessionAuth middleware + user-in-context helpers"
```

---

## Task 11: Auth handlers (signup/login/logout/me) + wiring

**Files:**
- Create: `webapp-1/backend/internal/http/handlers/auth.go`
- Test: `webapp-1/backend/internal/http/handlers/auth_test.go`
- Modify: `webapp-1/backend/internal/http/module.go` (register the 4 handlers)

- [ ] **Step 1: Inspect a generated operations package to learn exact type names**

```bash
cd /Users/dodonovpavel/gateway_fm/REAL_WORLD_ASSETS/4-ol-do/webapp-1/backend
ls internal/http/server/operations/auth/
grep -rn "func New" internal/http/server/operations/auth/ | head
```
Note exact names: `SignupParams`, `NewSignupOK`, `NewSignupConflict`, `LoginParams`, `NewLoginOK`, `NewLogoutNoContent`, `GetMeParams`, `NewGetMeOK`, `NewGetMeUnauthorized`, and the API handler interface fields (e.g. `api.AuthSignupHandler`). Use the real names below.

- [ ] **Step 2: Write the handlers**

`internal/http/handlers/auth.go`:
```go
package handlers

import (
	"net/http"
	"time"

	"github.com/go-openapi/runtime"
	"github.com/go-openapi/runtime/middleware"

	"dollbuilder/internal/auth"
	"dollbuilder/internal/models"
	"dollbuilder/internal/service"
	authops "dollbuilder/internal/http/server/operations/auth"
)

// cookieConfig carries deployment-specific cookie attributes.
type cookieConfig struct {
	Domain string
	Secure bool
	TTL    time.Duration
}

func (c cookieConfig) set(w http.ResponseWriter, rawToken string) {
	http.SetCookie(w, &http.Cookie{
		Name:     "db_session", // == middlewares.SessionCookieName
		Value:    rawToken,
		Path:     "/",
		Domain:   c.Domain,
		Expires:  time.Now().Add(c.TTL),
		HttpOnly: true,
		Secure:   c.Secure,
		SameSite: http.SameSiteLaxMode,
	})
}

func (c cookieConfig) clear(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name: "db_session", Value: "", Path: "/", Domain: c.Domain,
		MaxAge: -1, HttpOnly: true, Secure: c.Secure, SameSite: http.SameSiteLaxMode,
	})
}

// Signup handler.
type Signup struct {
	svc    service.IService
	cookie cookieConfig
}

func NewSignup(svc service.IService, cookie cookieConfig) *Signup { return &Signup{svc, cookie} }

func (h *Signup) Handle(params authops.SignupParams) middleware.Responder {
	email := string(params.Body.Email)
	user, err := h.svc.SignUp(email, params.Body.Password, params.HTTPRequest.UserAgent())
	switch {
	case err == service.ErrEmailTaken:
		return authops.NewSignupConflict().WithPayload(DefaultError(http.StatusConflict, err, nil))
	case err == service.ErrWeakPassword:
		return authops.NewSignupBadRequest().WithPayload(DefaultError(http.StatusBadRequest, err, nil))
	case err != nil:
		return authops.NewSignupInternalServerError().WithPayload(DefaultError(http.StatusInternalServerError, err, nil))
	}
	// log the user in immediately so signup also sets a session
	_, raw, err := h.svc.Login(email, params.Body.Password, params.HTTPRequest.UserAgent())
	if err != nil {
		return authops.NewSignupInternalServerError().WithPayload(DefaultError(http.StatusInternalServerError, err, nil))
	}
	result := &models.AuthResult{User: formatUser(user)}
	return middleware.ResponderFunc(func(w http.ResponseWriter, p runtime.Producer) {
		h.cookie.set(w, raw)
		authops.NewSignupOK().WithPayload(result).WriteResponse(w, p)
	})
}

// Login handler.
type Login struct {
	svc    service.IService
	cookie cookieConfig
}

func NewLogin(svc service.IService, cookie cookieConfig) *Login { return &Login{svc, cookie} }

func (h *Login) Handle(params authops.LoginParams) middleware.Responder {
	user, raw, err := h.svc.Login(string(params.Body.Email), params.Body.Password, params.HTTPRequest.UserAgent())
	if err == service.ErrInvalidCredentials {
		return authops.NewLoginUnauthorized().WithPayload(DefaultError(http.StatusUnauthorized, err, nil))
	}
	if err != nil {
		return authops.NewLoginInternalServerError().WithPayload(DefaultError(http.StatusInternalServerError, err, nil))
	}
	result := &models.AuthResult{User: formatUser(user)}
	return middleware.ResponderFunc(func(w http.ResponseWriter, p runtime.Producer) {
		h.cookie.set(w, raw)
		authops.NewLoginOK().WithPayload(result).WriteResponse(w, p)
	})
}

// Logout handler.
type Logout struct {
	svc    service.IService
	cookie cookieConfig
}

func NewLogout(svc service.IService, cookie cookieConfig) *Logout { return &Logout{svc, cookie} }

func (h *Logout) Handle(params authops.LogoutParams) middleware.Responder {
	if c, err := params.HTTPRequest.Cookie("db_session"); err == nil {
		_ = h.svc.Logout(c.Value)
	}
	return middleware.ResponderFunc(func(w http.ResponseWriter, p runtime.Producer) {
		h.cookie.clear(w)
		authops.NewLogoutNoContent().WriteResponse(w, p)
	})
}

// GetMe handler — reads the user injected by SessionAuth middleware.
type GetMe struct{ svc service.IService }

func NewGetMe(svc service.IService) *GetMe { return &GetMe{svc} }

func (h *GetMe) Handle(params authops.GetMeParams) middleware.Responder {
	user := auth.UserFromContext(params.HTTPRequest.Context())
	if user == nil {
		return authops.NewGetMeUnauthorized().WithPayload(DefaultError(http.StatusUnauthorized, service.ErrInvalidSession, nil))
	}
	return authops.NewGetMeOK().WithPayload(formatUser(user))
}
```

> **`formatUser` + `models.AuthResult`:** `models` here is the **generated swagger** models package (it owns `User`, `AuthResult`, `Error`). The template already has a formatter mapping a domain user → swagger `*models.User` (the Explore found `formatter.UserToAPI`). Reuse it: replace `formatUser(user)` with the real formatter call (`formatter.UserToAPI(user)`) and import that package. If no formatter exists, add a small `formatUser(*domainUser) *models.User` in this file mapping UUID/email/name/status/timestamps. Confirm whether handlers import the **domain** model (`dollbuilder/internal/models`) or the **generated** model — in the template, `service.IService` returns the **domain** model and handlers convert to the **generated** `models.User`. Keep the two straight: the imports in this file must distinguish them (alias the generated one, e.g. `apimodels "dollbuilder/internal/http/server/models"` if that's its path — verify with `grep -rn "func UserToAPI" internal`).

- [ ] **Step 3: Register handlers + build cookieConfig in `internal/http/module.go`**

Where the template sets `api.UsersGetUserByEmailHandler = ...`, add:
```go
cookie := handlers.NewCookieConfig(m.config.Auth.CookieDomain, m.config.Auth.CookieSecure, m.config.Auth.SessionTTL)
api.AuthSignupHandler = handlers.NewSignup(m.service, cookie)
api.AuthLoginHandler = handlers.NewLogin(m.service, cookie)
api.AuthLogoutHandler = handlers.NewLogout(m.service, cookie)
api.AuthGetMeHandler = handlers.NewGetMe(m.service)
```
Add an exported `NewCookieConfig(domain string, secure bool, ttl time.Duration) cookieConfig` constructor in `auth.go` (since `cookieConfig` is unexported, expose a constructor or export the struct). The `m.config.Auth.*` fields are added in Task 12 — if doing Task 12 first, they exist; otherwise temporarily hardcode `handlers.NewCookieConfig("", false, 30*24*time.Hour)` and replace in Task 12.

- [ ] **Step 4: Write a handler test for /me (unauth → 401, auth → user)**

`internal/http/handlers/auth_test.go`:
```go
package handlers

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofrs/uuid"
	"dollbuilder/internal/auth"
	domain "dollbuilder/internal/models"
	authops "dollbuilder/internal/http/server/operations/auth"
)

func TestGetMeUnauthenticated(t *testing.T) {
	h := NewGetMe(nil)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
	resp := h.Handle(authops.GetMeParams{HTTPRequest: req})
	if _, ok := resp.(*authops.GetMeUnauthorized); !ok {
		t.Fatalf("expected 401, got %T", resp)
	}
}

func TestGetMeAuthenticated(t *testing.T) {
	h := NewGetMe(nil)
	u := &domain.User{UUID: uuid.Must(uuid.NewV4()), Email: "x@y.com", Name: "X"}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
	req = req.WithContext(auth.WithUser(req.Context(), u))
	resp := h.Handle(authops.GetMeParams{HTTPRequest: req})
	if _, ok := resp.(*authops.GetMeOK); !ok {
		t.Fatalf("expected 200, got %T", resp)
	}
}
```

- [ ] **Step 5: Build + run handler tests**

```bash
cd /Users/dodonovpavel/gateway_fm/REAL_WORLD_ASSETS/4-ol-do/webapp-1/backend
go build ./... 2>&1 | head -20
go test ./internal/http/handlers/ -run TestGetMe -v
```
Expected: builds; both /me tests PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/dodonovpavel/gateway_fm/REAL_WORLD_ASSETS/4-ol-do
git add webapp-1/backend/internal/http/handlers webapp-1/backend/internal/http/module.go
git commit -m "Add auth handlers (signup/login/logout/me) + wiring"
```

---

## Task 12: Auth config (cookie/session/CORS via env) + end-to-end verify

**Files:**
- Modify: `webapp-1/backend/config/scheme.go` (add `AuthConfig`)
- Modify: `webapp-1/backend/config/init.go` (defaults)
- Create: `webapp-1/backend/.env.example`
- Modify: `webapp-1/backend/docker-compose.yml` (app env)

- [ ] **Step 1: Add `AuthConfig` to the config scheme**

In `config/scheme.go`, add the field to `Scheme` and the struct:
```go
	Auth *AuthConfig `mapstructure:"auth"`
```
```go
// AuthConfig configures session cookies.
type AuthConfig struct {
	CookieDomain string        `mapstructure:"cookie_domain"` // e.g. ".pashteto.com"; empty for localhost
	CookieSecure bool          `mapstructure:"cookie_secure"` // true in prod (HTTPS)
	SessionTTL   time.Duration `mapstructure:"session_ttl"`   // e.g. 720h
}
```
(import `time` if not already.)

- [ ] **Step 2: Add defaults in `config/init.go`**

```go
	viper.SetDefault("auth.cookie_domain", "")
	viper.SetDefault("auth.cookie_secure", false)
	viper.SetDefault("auth.session_ttl", "720h")
```

- [ ] **Step 3: Use the config in `module.go` (replace any hardcoded cookieConfig)**

Replace the temporary `handlers.NewCookieConfig(...)` from Task 11 Step 3 with the config-driven values (`m.config.Auth.CookieDomain`, `.CookieSecure`, `.SessionTTL`). Guard against a nil `m.config.Auth` by relying on the defaults loaded by Viper.

> **CORS:** the template already has `middlewares.Cors(m.config.CORS)`. Ensure the CORS config allows the frontend origin with credentials. Find the CORS config struct (`grep -rn "CORS" config/`) and confirm it sets `Access-Control-Allow-Credentials: true` and an exact allowed origin (not `*`, which is invalid with credentials). The allowed origins must be env-configurable; default to `http://localhost:3000` for dev. If the template's CORS middleware doesn't support credentialed origins, add `Access-Control-Allow-Credentials: true` and echo the request origin when it's in the allowlist. Document this as the dev default; prod sets `https://lindentar.pashteto.com`.

- [ ] **Step 4: Write `.env.example` (no secrets — placeholders only)**

`.env.example`:
```bash
# --- Database ---
DATABASE_ENABLED=true
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=dev
DATABASE_PASSWORD=dev            # local dev only; prod via secrets store
DATABASE_NAME=dollbuilder_dev
DATABASE_SSL_MODE=disable

# --- HTTP ---
HTTP_ENABLED=true
HTTP_PORT=8080

# --- Auth / session cookie ---
AUTH_COOKIE_DOMAIN=              # "" for localhost; ".pashteto.com" in prod
AUTH_COOKIE_SECURE=false         # true in prod (HTTPS)
AUTH_SESSION_TTL=720h

# --- CORS ---
HTTP_CORS_ALLOWED_ORIGINS=http://localhost:3000   # prod: https://lindentar.pashteto.com
```
> Match the exact env var names to the Viper key→env replacement (`.`→`_`, uppercased). Confirm the CORS env key by inspecting the CORS config struct's mapstructure tags.

- [ ] **Step 5: End-to-end smoke test with a cookie jar**

```bash
cd /Users/dodonovpavel/gateway_fm/REAL_WORLD_ASSETS/4-ol-do/webapp-1/backend
docker compose up -d postgres && docker compose run --rm migrate
DATABASE_ENABLED=true DATABASE_HOST=localhost DATABASE_USER=dev DATABASE_PASSWORD=dev \
DATABASE_NAME=dollbuilder_dev HTTP_ENABLED=true HTTP_PORT=8080 \
go run cmd/dollbuilder.go serve & sleep 4
JAR=$(mktemp)
echo "signup:"; curl -s -c "$JAR" -X POST localhost:8080/api/v1/auth/signup -H 'Content-Type: application/json' -d '{"email":"e2e@test.com","password":"hunter2hunter2"}'
echo; echo "me (with cookie):"; curl -s -b "$JAR" localhost:8080/api/v1/auth/me
echo; echo "logout:"; curl -s -b "$JAR" -c "$JAR" -X POST localhost:8080/api/v1/auth/logout -o /dev/null -w "%{http_code}\n"
echo "me (after logout, expect 401):"; curl -s -b "$JAR" -o /dev/null -w "%{http_code}\n" localhost:8080/api/v1/auth/me
kill %1; rm -f "$JAR"
```
Expected: signup returns `{"user":{...}}` + sets `db_session` cookie; `/me` returns the user; logout returns `204`; `/me` after logout returns `401`.

- [ ] **Step 6: Run the full backend test suite**

```bash
cd /Users/dodonovpavel/gateway_fm/REAL_WORLD_ASSETS/4-ol-do/webapp-1/backend
go test ./... 2>&1 | tail -20
```
Expected: all non-integration tests PASS.

- [ ] **Step 7: Commit**

```bash
cd /Users/dodonovpavel/gateway_fm/REAL_WORLD_ASSETS/4-ol-do
git add webapp-1/backend/config webapp-1/backend/.env.example webapp-1/backend/docker-compose.yml webapp-1/backend/internal/http/module.go
git commit -m "Add auth config (cookie/session/CORS) + .env.example"
```

---

## Self-Review (completed by plan author)

**Spec coverage (auth-relevant sections):**
- §Auth (email+password, argon2id, httpOnly/Secure/SameSite cookie, token hash only) → Tasks 4,5,8,10,11,12 ✓
- §Data model `users.password_hash`, `sessions` → Task 3, 6 ✓
- §API `/auth/signup|login|logout|me` → Tasks 9, 11 ✓
- §Security (argon2id, parametrized SQL via go-pg, CORS exact-origin+credentials, secrets via env, no PII/secret logging) → Tasks 4, 7, 12 ✓ (rate-limiting uses the template's existing `RateLimit` middleware; Redis deferred — see note)
- Deferred to later plans: projects sync (Plan 2), entitlements (Plan 3), frontend (Plan 4). ✓

**Deviations from spec, with rationale:**
- **Redis dropped from this plan.** The design listed Redis for session cache + rate-limit. Sessions live in Postgres (source of truth), and the template already ships a `RateLimit` middleware. Adding Redis now is premature (YAGNI) for a single-instance MVP. If multi-instance rate-limiting or entitlement caching is needed later, add a cache module then. *Flagging because it diverges from the written spec — confirm this is acceptable.*

**Placeholder scan:** No `TODO`/`TBD`. Two steps intentionally say "confirm the real symbol name via grep, then match" — these are accuracy guards against template drift, not placeholders; each gives the expected name and the grep to verify it.

**Type consistency:** `db_session` cookie name is used identically in `middlewares.SessionCookieName`, the handlers' `cookieConfig`, and the logout lookup. `Service.Authenticate(string) (*models.User, error)` matches the middleware `authFn` signature and the `authRepo` interface. The domain-vs-generated `models.User` ambiguity is called out explicitly in Task 11 Step 2.
