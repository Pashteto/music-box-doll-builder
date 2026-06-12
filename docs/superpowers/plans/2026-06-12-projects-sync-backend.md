# Projects Sync (Backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-user `projects` module to the `dollbuilder` Go backend so the frontend can sync doll-project JSON + thumbnail to the server with last-write-wins conflict resolution.

**Architecture:** Spec-first go-swagger monolith. Endpoints are declared in `api/swagger.yaml`, generated via `make generate-all`, and wired in `internal/http/module.go`. Requests flow handler → `service.IService` → `repository.IRepository` (go-pg/Postgres). Auth is the existing cookie-session middleware that injects the user into the request context; project handlers read it and 401 if absent (same pattern as `GetMe`). All project rows are scoped by `user_uuid` for tenant isolation. Conflict resolution is last-write-wins by `updated_at`, enforced in the service layer.

**Tech Stack:** Go 1.26, go-swagger, go-pg/v10, gofrs/uuid, go-openapi/strfmt, golang-migrate. Tests: stdlib `testing` (service/handler/formatter = pure unit with embedded-interface mocks; repository = `//go:build integration` against `DATABASE_URL`).

**This is Plan 2 of the accounts/sync/paywall effort.** Design spec: `docs/superpowers/specs/2026-06-12-accounts-sync-mocked-paywall-design.md`. Plan 1 (auth) is already merged (PR #3). Plan 3 (entitlements) and Plan 4 (frontend wiring) come after.

---

## Conventions you must follow (from the existing codebase)

- **Module is `dollbuilder`** (imports like `dollbuilder/internal/...`).
- **Generated code is gitignored.** `internal/http/server/**` and `internal/http/models/**` are produced by `make generate-all`. Never hand-edit them; edit `api/swagger.yaml` and regenerate. Commit only the source you wrote (swagger, migrations, models, repo, service, formatter, handlers, module wiring, tests).
- **All `make`/`go` commands run from `webapp-1/backend/`.**
- **go-swagger required-field typing** (verified from the existing `User`/`Credentials` models): a *required* primitive or strfmt field is generated as a **pointer** (`*string`, `*strfmt.Email`, `*strfmt.DateTime`); a *readOnly, non-required* field is a **value** (`strfmt.UUID`, `strfmt.DateTime`); a `type: object, additionalProperties: true` field is `map[string]interface{}`; an optional primitive is a value (`string`).
- **`make generate-all` runs `proto-generate-all` then `generate-api`.** If `protoc`/`buf` are not installed in your environment, run **`make generate-api`** instead (it is the swagger half and is all this plan needs). Both regenerate `internal/http/server` + `internal/http/models`.
- **Run a single test** with `go test ./internal/<pkg>/ -run TestName -v`. Run all unit tests with `make test` (which is `go test ./...`). Integration repo tests need the `integration` build tag and a `DATABASE_URL`.

---

## File Structure

| File | Responsibility | New/Modify |
|------|----------------|------------|
| `db/migrations/000004_projects.up.sql` / `.down.sql` | `projects` table + indexes | Create |
| `internal/models/project.go` | Domain `Project` (go-pg model) | Create |
| `internal/repository/interface.go` | Add project methods to `IRepository` | Modify |
| `internal/repository/projects.go` | go-pg implementations of project methods | Create |
| `internal/repository/projects_test.go` | Integration round-trip (build tag) | Create |
| `internal/service/service.go` | Add project methods to `IService` | Modify |
| `internal/service/projects.go` | Project business logic incl. last-write-wins | Create |
| `internal/service/projects_test.go` | Unit tests (mock repo): LWW, not-found, create/update | Create |
| `api/swagger.yaml` | `projects` paths + `Project`/`ProjectInput` definitions | Modify |
| `internal/http/formatter/project.go` | domain ↔ API conversion | Create |
| `internal/http/formatter/project_test.go` | formatter unit tests | Create |
| `internal/http/handlers/projects.go` | 4 HTTP handlers | Create |
| `internal/http/handlers/handlers_test.go` | Extend `mockService` with project methods | Modify |
| `internal/http/handlers/projects_test.go` | handler unit tests (mock svc + ctx user) | Create |
| `internal/http/module.go` | Register the 4 project handlers | Modify |

---

### Task 1: Database migration

**Files:**
- Create: `db/migrations/000004_projects.up.sql`
- Create: `db/migrations/000004_projects.down.sql`

- [ ] **Step 1: Write the up migration**

`db/migrations/000004_projects.up.sql`:

```sql
-- per-user doll projects synced from the client (local-first; server stores JSON + thumbnail)
CREATE TABLE IF NOT EXISTS projects
(
    uuid       uuid NOT NULL CONSTRAINT project_uuid_pkey PRIMARY KEY,
    user_uuid  uuid NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
    name       text NOT NULL,
    data       jsonb NOT NULL DEFAULT '{}'::jsonb,
    thumbnail  text,
    updated_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS project_user_uuid_idx ON projects USING btree(user_uuid);
```

- [ ] **Step 2: Write the down migration**

`db/migrations/000004_projects.down.sql`:

```sql
DROP TABLE IF EXISTS projects;
```

- [ ] **Step 3: Apply and verify against a local DB**

Bring up Postgres and apply migrations (the app's compose deps):

Run:
```bash
make compose-up        # or: docker compose up -d postgres
export DATABASE_URL="postgres://dollbuilder:dollbuilder@localhost:5432/dollbuilder?sslmode=disable"
make migrate-up
```
Expected: migrate reports version 4 with no error.

Verify the table exists:
```bash
docker compose exec -T postgres psql -U dollbuilder -d dollbuilder -c '\d projects'
```
Expected: columns `uuid, user_uuid, name, data (jsonb), thumbnail, updated_at, created_at` and index `project_user_uuid_idx`.

> If your local DB credentials differ, read them from `docker-compose.yml` / `.env` and adjust `DATABASE_URL`. If Docker is unavailable in your environment, skip execution but still confirm the SQL is valid by review; Task 3's integration test will exercise it where a DB is available.

- [ ] **Step 4: Commit**

```bash
git add db/migrations/000004_projects.up.sql db/migrations/000004_projects.down.sql
git commit -m "feat(projects): add projects table migration"
```

---

### Task 2: Domain model

**Files:**
- Create: `internal/models/project.go`
- Test: `internal/models/project_test.go`

- [ ] **Step 1: Write the failing test**

`internal/models/project_test.go`:

```go
package models

import (
	"testing"

	"github.com/gofrs/uuid"
)

func TestProjectValidate(t *testing.T) {
	valid := &Project{
		UUID:     uuid.Must(uuid.NewV4()),
		UserUUID: uuid.Must(uuid.NewV4()),
		Name:     "My Doll",
	}
	if err := valid.Validate(); err != nil {
		t.Fatalf("expected valid project, got %v", err)
	}

	missingName := &Project{UUID: uuid.Must(uuid.NewV4())}
	if err := missingName.Validate(); err == nil {
		t.Fatal("expected error for missing name, got nil")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/models/ -run TestProjectValidate -v`
Expected: FAIL — `Project` undefined.

- [ ] **Step 3: Write minimal implementation**

`internal/models/project.go`:

```go
package models

import (
	"time"

	"github.com/gofrs/uuid"
)

// Project is a per-user doll project synced from the client. The UUID is the
// client-generated project id (so the same project keeps one identity across
// devices). Only the project definition JSON (Data) and a small Thumbnail are
// stored server-side — never the rendered video.
//
//nolint:govet // field alignment kept for readability and conventional ordering
type Project struct {
	tableName struct{} `pg:"projects,discard_unknown_columns"` //nolint:unused // go-pg table marker

	UUID      uuid.UUID              `pg:"uuid,pk,type:uuid"`
	UserUUID  uuid.UUID              `pg:"user_uuid,type:uuid"`
	Name      string                 `pg:"name,notnull"`
	Data      map[string]interface{} `pg:"data,type:jsonb"`
	Thumbnail string                 `pg:"thumbnail"`
	UpdatedAt time.Time              `pg:"updated_at,notnull"`
	CreatedAt time.Time              `pg:"created_at,notnull,default:now()"`
}

// Validate checks required fields. UUID/UserUUID/timestamps are managed by the
// repository and service layers.
func (p *Project) Validate() error {
	if p.Name == "" {
		return newValidationError("name", "is required")
	}
	return nil
}
```

> `newValidationError` already exists in `internal/models/validation_error.go` (used by `User.Validate`).

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./internal/models/ -run TestProjectValidate -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add internal/models/project.go internal/models/project_test.go
git commit -m "feat(projects): add Project domain model"
```

---

### Task 3: Repository methods

**Files:**
- Modify: `internal/repository/interface.go`
- Create: `internal/repository/projects.go`
- Test: `internal/repository/projects_test.go` (integration build tag)

- [ ] **Step 1: Add methods to the `IRepository` interface**

In `internal/repository/interface.go`, inside the `IRepository` interface (after `DeleteSession`, before the `// TODO:` block), add:

```go
	// CreateProject inserts a new project row.
	CreateProject(p *models.Project) error

	// UpdateProject updates an existing project row by primary key.
	UpdateProject(p *models.Project) error

	// ProjectByID returns the project with the given id owned by userID, or
	// (nil, nil) if no such row exists (not an error).
	ProjectByID(userID, id uuid.UUID) (*models.Project, error)

	// ListProjects returns all projects owned by userID, newest first.
	ListProjects(userID uuid.UUID) ([]*models.Project, error)

	// DeleteProject removes a project owned by userID. Missing rows are not an error.
	DeleteProject(userID, id uuid.UUID) error
```

- [ ] **Step 2: Implement the methods**

`internal/repository/projects.go`:

```go
package repository

import (
	"errors"
	"fmt"

	"github.com/go-pg/pg/v10"
	"github.com/gofrs/uuid"

	"dollbuilder/internal/models"
)

// CreateProject inserts a new project row.
func (r *PostgresRepository) CreateProject(p *models.Project) error {
	if _, err := r.db.Model(p).Insert(); err != nil {
		return fmt.Errorf("insert project %s: %w", p.UUID, err)
	}
	return nil
}

// UpdateProject updates an existing project row by primary key.
func (r *PostgresRepository) UpdateProject(p *models.Project) error {
	if _, err := r.db.Model(p).WherePK().Update(); err != nil {
		return fmt.Errorf("update project %s: %w", p.UUID, err)
	}
	return nil
}

// ProjectByID returns the project owned by userID, or (nil, nil) if absent.
func (r *PostgresRepository) ProjectByID(userID, id uuid.UUID) (*models.Project, error) {
	p := new(models.Project)
	err := r.db.Model(p).Where("uuid = ? AND user_uuid = ?", id, userID).Select()
	if errors.Is(err, pg.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get project %s: %w", id, err)
	}
	return p, nil
}

// ListProjects returns all projects owned by userID, newest first.
func (r *PostgresRepository) ListProjects(userID uuid.UUID) ([]*models.Project, error) {
	var ps []*models.Project
	if err := r.db.Model(&ps).Where("user_uuid = ?", userID).Order("updated_at DESC").Select(); err != nil {
		return nil, fmt.Errorf("list projects for %s: %w", userID, err)
	}
	return ps, nil
}

// DeleteProject removes a project owned by userID. Missing rows are not an error.
func (r *PostgresRepository) DeleteProject(userID, id uuid.UUID) error {
	if _, err := r.db.Model((*models.Project)(nil)).
		Where("uuid = ? AND user_uuid = ?", id, userID).Delete(); err != nil {
		return fmt.Errorf("delete project %s: %w", id, err)
	}
	return nil
}
```

- [ ] **Step 3: Verify it compiles**

Run: `go build ./internal/repository/...`
Expected: no output (success). The build proves `*PostgresRepository` now satisfies the expanded `IRepository`.

- [ ] **Step 4: Write the integration test**

`internal/repository/projects_test.go` (mirrors `auth_test.go`'s `//go:build integration` + `DATABASE_URL` style; reuses `newTestRepo`/`cleanupTestUser` from that file in the same package):

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

func TestProjectRepoRoundTrip(t *testing.T) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set")
	}

	repo := newTestRepo(t, dsn)
	t.Cleanup(func() { cleanupTestUser(t, repo, "proj-test@example.com") })

	owner := &models.User{
		UUID:         uuid.Must(uuid.NewV4()),
		Email:        "proj-test@example.com",
		Name:         "Proj Test",
		PasswordHash: "x",
		Status:       models.UserActive,
	}
	if err := repo.CreateUserWithPassword(owner); err != nil {
		t.Fatalf("create owner: %v", err)
	}

	id := uuid.Must(uuid.NewV4())
	p := &models.Project{
		UUID:      id,
		UserUUID:  owner.UUID,
		Name:      "First",
		Data:      map[string]interface{}{"slots": []interface{}{}},
		Thumbnail: "data:image/png;base64,AAAA",
		UpdatedAt: time.Now().Truncate(time.Second),
		CreatedAt: time.Now().Truncate(time.Second),
	}
	if err := repo.CreateProject(p); err != nil {
		t.Fatalf("CreateProject: %v", err)
	}

	got, err := repo.ProjectByID(owner.UUID, id)
	if err != nil || got == nil {
		t.Fatalf("ProjectByID: %v (got=%v)", err, got)
	}
	if got.Name != "First" {
		t.Fatalf("name mismatch: %q", got.Name)
	}

	// isolation: a different user must not see it
	other := uuid.Must(uuid.NewV4())
	if iso, err := repo.ProjectByID(other, id); err != nil || iso != nil {
		t.Fatalf("expected nil for other user, got %v / %v", iso, err)
	}

	p.Name = "Renamed"
	if err := repo.UpdateProject(p); err != nil {
		t.Fatalf("UpdateProject: %v", err)
	}

	list, err := repo.ListProjects(owner.UUID)
	if err != nil || len(list) != 1 || list[0].Name != "Renamed" {
		t.Fatalf("ListProjects: %v len=%d", err, len(list))
	}

	if err := repo.DeleteProject(owner.UUID, id); err != nil {
		t.Fatalf("DeleteProject: %v", err)
	}
	if gone, err := repo.ProjectByID(owner.UUID, id); err != nil || gone != nil {
		t.Fatalf("expected nil after delete, got %v / %v", gone, err)
	}
}
```

- [ ] **Step 5: Run the integration test (where a DB is available)**

Run:
```bash
make compose-up
export DATABASE_URL="postgres://dollbuilder:dollbuilder@localhost:5432/dollbuilder?sslmode=disable"
make migrate-up
go test -tags=integration ./internal/repository/ -run TestProjectRepoRoundTrip -v
```
Expected: PASS. If Docker/DB is unavailable, the test `t.Skip`s on a missing `DATABASE_URL`; record that it was skipped rather than claiming a pass.

- [ ] **Step 6: Commit**

```bash
git add internal/repository/interface.go internal/repository/projects.go internal/repository/projects_test.go
git commit -m "feat(projects): add project repository methods + integration test"
```

---

### Task 4: Service layer (last-write-wins)

**Files:**
- Modify: `internal/service/service.go`
- Create: `internal/service/projects.go`
- Test: `internal/service/projects_test.go`

- [ ] **Step 1: Add methods to the `IService` interface**

In `internal/service/service.go`, inside the `IService` interface (after `Logout(rawToken string) error`), add:

```go
	// ListProjects returns all projects owned by userID, newest first.
	ListProjects(userID uuid.UUID) ([]*models.Project, error)

	// GetProject returns one project owned by userID, or ErrNotFound.
	GetProject(userID, id uuid.UUID) (*models.Project, error)

	// UpsertProject creates or updates a project for userID using last-write-wins
	// by UpdatedAt. Returns the project the server now holds.
	UpsertProject(userID uuid.UUID, p *models.Project) (*models.Project, error)

	// DeleteProject removes a project owned by userID.
	DeleteProject(userID, id uuid.UUID) error
```

Add the import `"github.com/gofrs/uuid"` to `service.go`'s import block (it currently imports `context`, `errors`, `fmt`, and the dollbuilder packages).

- [ ] **Step 2: Write the failing test**

`internal/service/projects_test.go`:

```go
package service

import (
	"errors"
	"testing"
	"time"

	"github.com/gofrs/uuid"

	"dollbuilder/internal/models"
	"dollbuilder/internal/repository"
)

// projectMockRepo overrides only the project methods (embeds IRepository = nil).
type projectMockRepo struct {
	repository.IRepository
	rows map[uuid.UUID]*models.Project
}

func newProjectMockRepo() *projectMockRepo {
	return &projectMockRepo{rows: map[uuid.UUID]*models.Project{}}
}

func (m *projectMockRepo) CreateProject(p *models.Project) error {
	m.rows[p.UUID] = p
	return nil
}
func (m *projectMockRepo) UpdateProject(p *models.Project) error {
	m.rows[p.UUID] = p
	return nil
}
func (m *projectMockRepo) ProjectByID(userID, id uuid.UUID) (*models.Project, error) {
	p, ok := m.rows[id]
	if !ok || p.UserUUID != userID {
		return nil, nil
	}
	return p, nil
}
func (m *projectMockRepo) ListProjects(userID uuid.UUID) ([]*models.Project, error) {
	var out []*models.Project
	for _, p := range m.rows {
		if p.UserUUID == userID {
			out = append(out, p)
		}
	}
	return out, nil
}
func (m *projectMockRepo) DeleteProject(userID, id uuid.UUID) error {
	if p, ok := m.rows[id]; ok && p.UserUUID == userID {
		delete(m.rows, id)
	}
	return nil
}

func TestUpsertProjectCreatesThenLastWriteWins(t *testing.T) {
	repo := newProjectMockRepo()
	svc := NewService(repo)
	user := uuid.Must(uuid.NewV4())
	id := uuid.Must(uuid.NewV4())
	t0 := time.Now()

	// create
	created, err := svc.UpsertProject(user, &models.Project{UUID: id, Name: "v1", UpdatedAt: t0})
	if err != nil || created.Name != "v1" || created.UserUUID != user {
		t.Fatalf("create: %v %+v", err, created)
	}
	if created.CreatedAt.IsZero() {
		t.Fatal("expected CreatedAt to be set on create")
	}

	// newer incoming wins
	newer, err := svc.UpsertProject(user, &models.Project{UUID: id, Name: "v2", UpdatedAt: t0.Add(time.Minute)})
	if err != nil || newer.Name != "v2" {
		t.Fatalf("update: %v %+v", err, newer)
	}

	// older incoming is ignored — server keeps v2 (last-write-wins)
	stale, err := svc.UpsertProject(user, &models.Project{UUID: id, Name: "stale", UpdatedAt: t0.Add(-time.Hour)})
	if err != nil || stale.Name != "v2" {
		t.Fatalf("expected server copy v2 to win, got %v %+v", err, stale)
	}
}

func TestUpsertProjectRequiresName(t *testing.T) {
	svc := NewService(newProjectMockRepo())
	_, err := svc.UpsertProject(uuid.Must(uuid.NewV4()), &models.Project{UUID: uuid.Must(uuid.NewV4())})
	if !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("expected ErrInvalidInput, got %v", err)
	}
}

func TestGetProjectNotFound(t *testing.T) {
	svc := NewService(newProjectMockRepo())
	_, err := svc.GetProject(uuid.Must(uuid.NewV4()), uuid.Must(uuid.NewV4()))
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

func TestProjectsAreUserScoped(t *testing.T) {
	repo := newProjectMockRepo()
	svc := NewService(repo)
	owner := uuid.Must(uuid.NewV4())
	intruder := uuid.Must(uuid.NewV4())
	id := uuid.Must(uuid.NewV4())

	if _, err := svc.UpsertProject(owner, &models.Project{UUID: id, Name: "secret", UpdatedAt: time.Now()}); err != nil {
		t.Fatalf("seed: %v", err)
	}
	if _, err := svc.GetProject(intruder, id); !errors.Is(err, ErrNotFound) {
		t.Fatalf("intruder must not read another user's project, got %v", err)
	}
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `go test ./internal/service/ -run TestUpsertProject -v`
Expected: FAIL — `UpsertProject` not defined on the service.

- [ ] **Step 4: Implement the service methods**

`internal/service/projects.go`:

```go
package service

import (
	"fmt"
	"time"

	"github.com/gofrs/uuid"

	"dollbuilder/internal/models"
)

// ListProjects returns all projects owned by userID, newest first.
func (s *Service) ListProjects(userID uuid.UUID) ([]*models.Project, error) {
	return s.repository.ListProjects(userID)
}

// GetProject returns one project owned by userID, or ErrNotFound.
func (s *Service) GetProject(userID, id uuid.UUID) (*models.Project, error) {
	p, err := s.repository.ProjectByID(userID, id)
	if err != nil {
		return nil, fmt.Errorf("get project: %w", err)
	}
	if p == nil {
		return nil, ErrNotFound
	}
	return p, nil
}

// UpsertProject creates or updates a project using last-write-wins by UpdatedAt.
// p.UUID must be the client-generated project id; p.UserUUID is set from userID.
func (s *Service) UpsertProject(userID uuid.UUID, p *models.Project) (*models.Project, error) {
	if p.Name == "" {
		return nil, fmt.Errorf("%w: name is required", ErrInvalidInput)
	}

	existing, err := s.repository.ProjectByID(userID, p.UUID)
	if err != nil {
		return nil, fmt.Errorf("lookup project: %w", err)
	}

	p.UserUUID = userID

	if existing == nil {
		if p.CreatedAt.IsZero() {
			p.CreatedAt = time.Now()
		}
		if p.UpdatedAt.IsZero() {
			p.UpdatedAt = p.CreatedAt
		}
		if err := s.repository.CreateProject(p); err != nil {
			return nil, fmt.Errorf("create project: %w", err)
		}
		return p, nil
	}

	// Last-write-wins: a strictly newer server copy is kept; otherwise incoming wins.
	if existing.UpdatedAt.After(p.UpdatedAt) {
		return existing, nil
	}
	p.CreatedAt = existing.CreatedAt
	if err := s.repository.UpdateProject(p); err != nil {
		return nil, fmt.Errorf("update project: %w", err)
	}
	return p, nil
}

// DeleteProject removes a project owned by userID.
func (s *Service) DeleteProject(userID, id uuid.UUID) error {
	return s.repository.DeleteProject(userID, id)
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `go test ./internal/service/ -v`
Expected: PASS (new project tests + existing auth tests).

- [ ] **Step 6: Commit**

```bash
git add internal/service/service.go internal/service/projects.go internal/service/projects_test.go
git commit -m "feat(projects): add project service with last-write-wins"
```

---

### Task 5: Swagger spec + code generation

**Files:**
- Modify: `api/swagger.yaml`

- [ ] **Step 1: Add the project paths**

In `api/swagger.yaml`, inside `paths:`, after the `/auth/me:` block and before `definitions:`, add:

```yaml
  /projects:
    get:
      summary: List the current user's projects
      operationId: listProjects
      tags: [projects]
      security: []
      responses:
        200:
          description: The user's projects (newest first)
          schema:
            type: array
            items: { $ref: "#/definitions/Project" }
        401: { description: Not authenticated, schema: { $ref: "#/definitions/Error" } }
        500: { description: Server error, schema: { $ref: "#/definitions/Error" } }

  /projects/{id}:
    get:
      summary: Fetch one project
      operationId: getProject
      tags: [projects]
      security: []
      parameters:
        - name: id
          in: path
          required: true
          type: string
          format: uuid
      responses:
        200: { description: The project, schema: { $ref: "#/definitions/Project" } }
        400: { description: Invalid id, schema: { $ref: "#/definitions/Error" } }
        401: { description: Not authenticated, schema: { $ref: "#/definitions/Error" } }
        404: { description: Not found, schema: { $ref: "#/definitions/Error" } }
        500: { description: Server error, schema: { $ref: "#/definitions/Error" } }
    put:
      summary: Create or update (sync push) a project
      operationId: upsertProject
      tags: [projects]
      security: []
      parameters:
        - name: id
          in: path
          required: true
          type: string
          format: uuid
        - name: body
          in: body
          required: true
          schema: { $ref: "#/definitions/ProjectInput" }
      responses:
        200: { description: The stored project (after last-write-wins), schema: { $ref: "#/definitions/Project" } }
        400: { description: Invalid input, schema: { $ref: "#/definitions/Error" } }
        401: { description: Not authenticated, schema: { $ref: "#/definitions/Error" } }
        500: { description: Server error, schema: { $ref: "#/definitions/Error" } }
    delete:
      summary: Delete a project
      operationId: deleteProject
      tags: [projects]
      security: []
      parameters:
        - name: id
          in: path
          required: true
          type: string
          format: uuid
      responses:
        204: { description: Deleted }
        400: { description: Invalid id, schema: { $ref: "#/definitions/Error" } }
        401: { description: Not authenticated, schema: { $ref: "#/definitions/Error" } }
        500: { description: Server error, schema: { $ref: "#/definitions/Error" } }
```

- [ ] **Step 2: Add the definitions**

In `api/swagger.yaml`, inside `definitions:`, after the `AuthResult` block, add:

```yaml
  Project:
    type: object
    required: [name]
    properties:
      uuid:
        type: string
        format: uuid
        description: Client-generated project id
        readOnly: true
      name:
        type: string
        minLength: 1
        maxLength: 255
      data:
        type: object
        additionalProperties: true
        description: The DollProject definition JSON
      thumbnail:
        type: string
        description: Small encoded thumbnail (data URL)
      updated_at:
        type: string
        format: date-time
        readOnly: true
      created_at:
        type: string
        format: date-time
        readOnly: true

  ProjectInput:
    type: object
    required: [name, data, updated_at]
    properties:
      name:
        type: string
        minLength: 1
        maxLength: 255
      data:
        type: object
        additionalProperties: true
      thumbnail:
        type: string
      updated_at:
        type: string
        format: date-time
        description: Client's last-modified time, used for last-write-wins
```

- [ ] **Step 3: Regenerate the server + models**

Run: `make generate-api`
Expected: regenerates `internal/http/server/**` and `internal/http/models/**`. New files include `internal/http/server/operations/projects/{list_projects,get_project,upsert_project,delete_project}.go` and `internal/http/models/{project.go,project_input.go}`.

> Use `make generate-all` instead if `protoc`/`buf` are installed; `make generate-api` is sufficient for this plan.

- [ ] **Step 4: Confirm generated field types match the formatter assumptions**

Run: `grep -nE 'Name|Data|Thumbnail|UpdatedAt|UUID|CreatedAt' internal/http/models/project.go internal/http/models/project_input.go`

Expected (confirm before writing Task 6):
- `models.Project`: `UUID strfmt.UUID`, `Name *string`, `Data map[string]interface{}`, `Thumbnail string`, `UpdatedAt strfmt.DateTime`, `CreatedAt strfmt.DateTime`.
- `models.ProjectInput`: `Name *string`, `Data map[string]interface{}`, `Thumbnail string`, `UpdatedAt *strfmt.DateTime`.

If any type differs (e.g. `UpdatedAt` is a value rather than a pointer), adjust the dereference in Task 6's formatter accordingly — the conversion logic is otherwise unchanged.

- [ ] **Step 5: Verify the project still builds**

Run: `go build ./...`
Expected: success. (Handlers aren't wired yet; generated default handlers return "not implemented" until Task 8 — that's fine.)

- [ ] **Step 6: Commit**

```bash
git add api/swagger.yaml
git commit -m "feat(projects): add projects endpoints + schemas to swagger spec"
```

> Generated code under `internal/http/server` and `internal/http/models` is gitignored and intentionally not committed.

---

### Task 6: Formatter

**Files:**
- Create: `internal/http/formatter/project.go`
- Test: `internal/http/formatter/project_test.go`

- [ ] **Step 1: Write the failing test**

`internal/http/formatter/project_test.go`:

```go
package formatter

import (
	"testing"
	"time"

	"github.com/go-openapi/strfmt"
	"github.com/gofrs/uuid"

	apiModels "dollbuilder/internal/http/models"
	domainModels "dollbuilder/internal/models"
)

func TestProjectToAPI(t *testing.T) {
	id := uuid.Must(uuid.NewV4())
	now := time.Now().UTC().Truncate(time.Second)
	p := &domainModels.Project{
		UUID:      id,
		Name:      "Doll",
		Data:      map[string]interface{}{"a": float64(1)},
		Thumbnail: "data:img",
		UpdatedAt: now,
		CreatedAt: now,
	}
	out := ProjectToAPI(p)
	if out.UUID.String() != id.String() {
		t.Fatalf("uuid mismatch: %s", out.UUID)
	}
	if out.Name == nil || *out.Name != "Doll" {
		t.Fatalf("name mismatch: %v", out.Name)
	}
	if out.Data["a"] != float64(1) {
		t.Fatalf("data mismatch: %v", out.Data)
	}
	if ProjectToAPI(nil) != nil {
		t.Fatal("nil should map to nil")
	}
}

func TestProjectInputFromAPI(t *testing.T) {
	name := "Doll"
	now := strfmt.DateTime(time.Now().UTC().Truncate(time.Second))
	in := &apiModels.ProjectInput{
		Name:      &name,
		Data:      map[string]interface{}{"k": "v"},
		Thumbnail: "thumb",
		UpdatedAt: &now,
	}
	p := ProjectInputFromAPI(in)
	if p.Name != "Doll" || p.Thumbnail != "thumb" || p.Data["k"] != "v" {
		t.Fatalf("conversion mismatch: %+v", p)
	}
	if p.UpdatedAt.IsZero() {
		t.Fatal("expected UpdatedAt to be set")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/http/formatter/ -run TestProject -v`
Expected: FAIL — `ProjectToAPI`/`ProjectInputFromAPI` undefined.

- [ ] **Step 3: Implement the formatter**

`internal/http/formatter/project.go`:

```go
package formatter

import (
	"time"

	"github.com/go-openapi/strfmt"

	apiModels "dollbuilder/internal/http/models"
	domainModels "dollbuilder/internal/models"
)

// ProjectToAPI converts a domain Project to its API representation.
func ProjectToAPI(p *domainModels.Project) *apiModels.Project {
	if p == nil {
		return nil
	}
	name := p.Name
	return &apiModels.Project{
		UUID:      strfmt.UUID(p.UUID.String()),
		Name:      &name,
		Data:      p.Data,
		Thumbnail: p.Thumbnail,
		UpdatedAt: strfmt.DateTime(p.UpdatedAt),
		CreatedAt: strfmt.DateTime(p.CreatedAt),
	}
}

// ProjectInputFromAPI converts a PUT body into a partial domain Project.
// UUID and UserUUID are set by the handler/service, not here.
func ProjectInputFromAPI(in *apiModels.ProjectInput) *domainModels.Project {
	p := &domainModels.Project{}
	if in == nil {
		return p
	}
	if in.Name != nil {
		p.Name = *in.Name
	}
	p.Data = in.Data
	p.Thumbnail = in.Thumbnail
	if in.UpdatedAt != nil {
		p.UpdatedAt = time.Time(*in.UpdatedAt)
	}
	return p
}
```

> If Task 5 Step 4 showed `ProjectInput.UpdatedAt` is a value type (`strfmt.DateTime`, not `*strfmt.DateTime`), replace the `if in.UpdatedAt != nil { ... }` block with `p.UpdatedAt = time.Time(in.UpdatedAt)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./internal/http/formatter/ -run TestProject -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add internal/http/formatter/project.go internal/http/formatter/project_test.go
git commit -m "feat(projects): add project domain<->API formatter"
```

---

### Task 7: HTTP handlers

**Files:**
- Create: `internal/http/handlers/projects.go`
- Modify: `internal/http/handlers/handlers_test.go` (extend `mockService`)
- Test: `internal/http/handlers/projects_test.go`

- [ ] **Step 1: Extend the shared `mockService` with project methods**

In `internal/http/handlers/handlers_test.go`, add these func fields to the `mockService` struct (alongside `getUserByEmailFunc`/`createUserFunc`):

```go
	listProjectsFunc  func(userID uuid.UUID) ([]*domainmodels.Project, error)
	getProjectFunc    func(userID, id uuid.UUID) (*domainmodels.Project, error)
	upsertProjectFunc func(userID uuid.UUID, p *domainmodels.Project) (*domainmodels.Project, error)
	deleteProjectFunc func(userID, id uuid.UUID) error
```

Then add these methods (after the existing `Logout` method) so `mockService` still satisfies `service.IService`:

```go
func (m *mockService) ListProjects(userID uuid.UUID) ([]*domainmodels.Project, error) {
	if m.listProjectsFunc != nil {
		return m.listProjectsFunc(userID)
	}
	return nil, nil
}

func (m *mockService) GetProject(userID, id uuid.UUID) (*domainmodels.Project, error) {
	if m.getProjectFunc != nil {
		return m.getProjectFunc(userID, id)
	}
	return nil, service.ErrNotFound
}

func (m *mockService) UpsertProject(userID uuid.UUID, p *domainmodels.Project) (*domainmodels.Project, error) {
	if m.upsertProjectFunc != nil {
		return m.upsertProjectFunc(userID, p)
	}
	return p, nil
}

func (m *mockService) DeleteProject(userID, id uuid.UUID) error {
	if m.deleteProjectFunc != nil {
		return m.deleteProjectFunc(userID, id)
	}
	return nil
}
```

> `uuid` and `service` are already imported in `handlers_test.go`. If `go vet` flags `service` as unused after edits, it's already used elsewhere in the file — no new import needed.

- [ ] **Step 2: Write the failing handler test**

`internal/http/handlers/projects_test.go`:

```go
package handlers

import (
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-openapi/strfmt"
	"github.com/gofrs/uuid"

	domainauth "dollbuilder/internal/auth"
	apimodels "dollbuilder/internal/http/models"
	projectsops "dollbuilder/internal/http/server/operations/projects"
	domainmodels "dollbuilder/internal/models"
)

func reqWithUser(u *domainmodels.User) *httptest.ResponseRecorder {
	return httptest.NewRecorder()
}

func ctxReq(u *domainmodels.User) (params projectsops.ListProjectsParams) {
	r := httptest.NewRequest("GET", "/api/v1/projects", nil)
	if u != nil {
		r = r.WithContext(domainauth.WithUser(r.Context(), u))
	}
	params.HTTPRequest = r
	return params
}

func TestListProjectsUnauthenticated(t *testing.T) {
	h := NewListProjects(&mockService{})
	resp := h.Handle(ctxReq(nil))
	rec := httptest.NewRecorder()
	resp.WriteResponse(rec, apiProducer())
	if rec.Code != 401 {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestListProjectsOK(t *testing.T) {
	user := &domainmodels.User{UUID: uuid.Must(uuid.NewV4())}
	svc := &mockService{
		listProjectsFunc: func(uid uuid.UUID) ([]*domainmodels.Project, error) {
			if uid != user.UUID {
				t.Fatalf("handler must scope to ctx user")
			}
			return []*domainmodels.Project{{UUID: uuid.Must(uuid.NewV4()), Name: "p", UpdatedAt: time.Now()}}, nil
		},
	}
	h := NewListProjects(svc)
	resp := h.Handle(ctxReq(user))
	rec := httptest.NewRecorder()
	resp.WriteResponse(rec, apiProducer())
	if rec.Code != 200 {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}

func TestUpsertProjectOK(t *testing.T) {
	user := &domainmodels.User{UUID: uuid.Must(uuid.NewV4())}
	id := uuid.Must(uuid.NewV4())
	name := "Doll"
	now := strfmt.DateTime(time.Now())
	svc := &mockService{
		upsertProjectFunc: func(uid uuid.UUID, p *domainmodels.Project) (*domainmodels.Project, error) {
			if uid != user.UUID || p.UUID != id {
				t.Fatalf("scope/id mismatch: %s %s", uid, p.UUID)
			}
			p.UserUUID = uid
			p.CreatedAt = time.Now()
			return p, nil
		},
	}
	h := NewUpsertProject(svc)

	r := httptest.NewRequest("PUT", "/api/v1/projects/"+id.String(), nil)
	r = r.WithContext(domainauth.WithUser(r.Context(), user))
	params := projectsops.UpsertProjectParams{
		HTTPRequest: r,
		ID:          strfmt.UUID(id.String()),
		Body:        &apimodels.ProjectInput{Name: &name, Data: map[string]interface{}{}, UpdatedAt: &now},
	}
	resp := h.Handle(params)
	rec := httptest.NewRecorder()
	resp.WriteResponse(rec, apiProducer())
	if rec.Code != 200 {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}
```

Add this helper at the bottom of `projects_test.go` (a JSON producer for `WriteResponse`):

```go
func apiProducer() runtime.Producer { return runtime.JSONProducer() }
```

and add the import `"github.com/go-openapi/runtime"`. Remove the unused `reqWithUser` helper if `go vet` complains — it's only a scaffold; keep the file to the helpers actually referenced.

> If Task 5 Step 4 showed `ProjectInput.UpdatedAt` is a value type, drop the `&` before `now` in the test.

- [ ] **Step 3: Run test to verify it fails**

Run: `go test ./internal/http/handlers/ -run TestListProjects -v`
Expected: FAIL — `NewListProjects` undefined.

- [ ] **Step 4: Implement the handlers**

`internal/http/handlers/projects.go`:

```go
package handlers

import (
	"errors"
	"net/http"

	"github.com/go-openapi/runtime/middleware"
	"github.com/gofrs/uuid"

	"dollbuilder/internal/auth"
	"dollbuilder/internal/http/formatter"
	apimodels "dollbuilder/internal/http/models"
	projectsops "dollbuilder/internal/http/server/operations/projects"
	"dollbuilder/internal/service"
)

// ListProjects handler.
type ListProjects struct{ svc service.IService }

// NewListProjects creates a new ListProjects handler.
func NewListProjects(svc service.IService) *ListProjects { return &ListProjects{svc} }

// Handle returns the current user's projects.
func (h *ListProjects) Handle(params projectsops.ListProjectsParams) middleware.Responder {
	user := auth.UserFromContext(params.HTTPRequest.Context())
	if user == nil {
		return projectsops.NewListProjectsUnauthorized().WithPayload(DefaultError(http.StatusUnauthorized, service.ErrInvalidSession, nil))
	}
	ps, err := h.svc.ListProjects(user.UUID)
	if err != nil {
		return projectsops.NewListProjectsInternalServerError().WithPayload(DefaultError(http.StatusInternalServerError, err, nil))
	}
	out := make([]*apimodels.Project, 0, len(ps))
	for _, p := range ps {
		out = append(out, formatter.ProjectToAPI(p))
	}
	return projectsops.NewListProjectsOK().WithPayload(out)
}

// GetProject handler.
type GetProject struct{ svc service.IService }

// NewGetProject creates a new GetProject handler.
func NewGetProject(svc service.IService) *GetProject { return &GetProject{svc} }

// Handle returns one project owned by the current user.
func (h *GetProject) Handle(params projectsops.GetProjectParams) middleware.Responder {
	user := auth.UserFromContext(params.HTTPRequest.Context())
	if user == nil {
		return projectsops.NewGetProjectUnauthorized().WithPayload(DefaultError(http.StatusUnauthorized, service.ErrInvalidSession, nil))
	}
	id, err := uuid.FromString(params.ID.String())
	if err != nil {
		return projectsops.NewGetProjectBadRequest().WithPayload(DefaultError(http.StatusBadRequest, err, nil))
	}
	p, err := h.svc.GetProject(user.UUID, id)
	if errors.Is(err, service.ErrNotFound) {
		return projectsops.NewGetProjectNotFound().WithPayload(DefaultError(http.StatusNotFound, err, nil))
	}
	if err != nil {
		return projectsops.NewGetProjectInternalServerError().WithPayload(DefaultError(http.StatusInternalServerError, err, nil))
	}
	return projectsops.NewGetProjectOK().WithPayload(formatter.ProjectToAPI(p))
}

// UpsertProject handler.
type UpsertProject struct{ svc service.IService }

// NewUpsertProject creates a new UpsertProject handler.
func NewUpsertProject(svc service.IService) *UpsertProject { return &UpsertProject{svc} }

// Handle creates or updates a project (sync push) with last-write-wins.
func (h *UpsertProject) Handle(params projectsops.UpsertProjectParams) middleware.Responder {
	user := auth.UserFromContext(params.HTTPRequest.Context())
	if user == nil {
		return projectsops.NewUpsertProjectUnauthorized().WithPayload(DefaultError(http.StatusUnauthorized, service.ErrInvalidSession, nil))
	}
	id, err := uuid.FromString(params.ID.String())
	if err != nil {
		return projectsops.NewUpsertProjectBadRequest().WithPayload(DefaultError(http.StatusBadRequest, err, nil))
	}
	domainP := formatter.ProjectInputFromAPI(params.Body)
	domainP.UUID = id
	saved, err := h.svc.UpsertProject(user.UUID, domainP)
	if errors.Is(err, service.ErrInvalidInput) {
		return projectsops.NewUpsertProjectBadRequest().WithPayload(DefaultError(http.StatusBadRequest, err, nil))
	}
	if err != nil {
		return projectsops.NewUpsertProjectInternalServerError().WithPayload(DefaultError(http.StatusInternalServerError, err, nil))
	}
	return projectsops.NewUpsertProjectOK().WithPayload(formatter.ProjectToAPI(saved))
}

// DeleteProject handler.
type DeleteProject struct{ svc service.IService }

// NewDeleteProject creates a new DeleteProject handler.
func NewDeleteProject(svc service.IService) *DeleteProject { return &DeleteProject{svc} }

// Handle deletes a project owned by the current user.
func (h *DeleteProject) Handle(params projectsops.DeleteProjectParams) middleware.Responder {
	user := auth.UserFromContext(params.HTTPRequest.Context())
	if user == nil {
		return projectsops.NewDeleteProjectUnauthorized().WithPayload(DefaultError(http.StatusUnauthorized, service.ErrInvalidSession, nil))
	}
	id, err := uuid.FromString(params.ID.String())
	if err != nil {
		return projectsops.NewDeleteProjectBadRequest().WithPayload(DefaultError(http.StatusBadRequest, err, nil))
	}
	if err := h.svc.DeleteProject(user.UUID, id); err != nil {
		return projectsops.NewDeleteProjectInternalServerError().WithPayload(DefaultError(http.StatusInternalServerError, err, nil))
	}
	return projectsops.NewDeleteProjectNoContent()
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `go test ./internal/http/handlers/ -v`
Expected: PASS (new project handler tests + existing auth/user handler tests).

- [ ] **Step 6: Commit**

```bash
git add internal/http/handlers/projects.go internal/http/handlers/projects_test.go internal/http/handlers/handlers_test.go
git commit -m "feat(projects): add project HTTP handlers"
```

---

### Task 8: Wire handlers into the HTTP module

**Files:**
- Modify: `internal/http/module.go`

- [ ] **Step 1: Register the project handlers**

In `internal/http/module.go`, inside `initAPI()`, after the auth handler registrations (`api.AuthGetMeHandler = handlers.NewGetMe(m.service)`) and before the `// TODO: Add more handlers` comment, add:

```go
	// Project handlers — session enforced inside each handler via request context.
	api.ProjectsListProjectsHandler = handlers.NewListProjects(m.service)
	api.ProjectsGetProjectHandler = handlers.NewGetProject(m.service)
	api.ProjectsUpsertProjectHandler = handlers.NewUpsertProject(m.service)
	api.ProjectsDeleteProjectHandler = handlers.NewDeleteProject(m.service)
```

> The generated setter/handler-interface names follow the `<Tag><OperationId>Handler` convention (tag `projects`, operationIds `listProjects` etc.). Confirm against `internal/http/server/operations/dollbuilder_api_api.go` if a name differs.

- [ ] **Step 2: Build and run the full suite**

Run:
```bash
go build ./...
make test
```
Expected: build succeeds; all packages pass (integration repo tests skip without `DATABASE_URL`).

- [ ] **Step 3: Lint**

Run: `make lint`
Expected: no new findings. (Generated code is excluded by the repo's golangci config.)

- [ ] **Step 4: Commit**

```bash
git add internal/http/module.go
git commit -m "feat(projects): wire project handlers into HTTP module"
```

---

### Task 9: End-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Run the stack locally**

Run:
```bash
make compose-up                       # postgres + redis + app, or run the app via `make run`
export DATABASE_URL="postgres://dollbuilder:dollbuilder@localhost:5432/dollbuilder?sslmode=disable"
make migrate-up
```
Expected: migrations at version 4; app healthy on `127.0.0.1:8080`.

- [ ] **Step 2: Exercise the full flow with a session cookie**

Run (signup captures the session cookie, then upsert → list → get → delete):

```bash
BASE=http://127.0.0.1:8080/api/v1
JAR=$(mktemp)
curl -s -c "$JAR" -X POST "$BASE/auth/signup" \
  -H 'Content-Type: application/json' \
  -d '{"email":"e2e-projects@example.com","password":"hunter2hunter2"}' > /dev/null

PID=$(uuidgen | tr 'A-Z' 'a-z')
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)

echo "--- upsert ---"
curl -s -b "$JAR" -X PUT "$BASE/projects/$PID" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"My Doll\",\"data\":{\"slots\":[]},\"thumbnail\":\"data:img\",\"updated_at\":\"$NOW\"}"
echo; echo "--- list ---"
curl -s -b "$JAR" "$BASE/projects"
echo; echo "--- get ---"
curl -s -b "$JAR" "$BASE/projects/$PID"
echo; echo "--- delete (expect 204) ---"
curl -s -b "$JAR" -o /dev/null -w "%{http_code}\n" -X DELETE "$BASE/projects/$PID"
echo "--- unauth list (expect 401) ---"
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/projects"
```

Expected:
- upsert → JSON project with `uuid` == `$PID`, `name` "My Doll".
- list → array containing that project.
- get → the same project.
- delete → `204`.
- unauth list (no cookie) → `401`.

- [ ] **Step 3: Record the verification result**

Paste the actual curl output into your completion summary. If anything deviates from Expected, do NOT mark complete — debug with the systematic-debugging skill.

> No commit in this task (verification only). If you fixed code to make it pass, commit that fix with its own message.

---

## Self-Review (completed by plan author)

**Spec coverage** (against `2026-06-12-accounts-sync-mocked-paywall-design.md`):
- `projects` module, per-user CRUD + sync upsert → Tasks 3,4,7,8 ✓
- Data model `projects(...)` + indexes → Task 1 ✓
- API `GET/PUT/DELETE /projects[/{id}]` → Tasks 5,7 ✓
- Session auth (cookie middleware injects user; handler 401s) → Task 7 ✓ (reuses Plan 1 middleware)
- Last-write-wins by `updated_at` per id → Task 4 (`UpsertProject`) + tests ✓
- Synced payload = definition JSON + thumbnail, no video → `Project.Data` jsonb + `Thumbnail`; no video field ✓
- User isolation (parametrized, scoped queries) → repo `WHERE user_uuid = ?` + service/repo tests ✓
- Out of scope (entitlements `GET /entitlements`, `mock-checkout`) → deliberately **deferred to Plan 3**, not in this plan ✓

**Placeholder scan:** No TBD/"add error handling"/"write tests for the above"/"similar to Task N". Every code step has full code. ✓

**Type consistency:** `UpsertProject(userID uuid.UUID, p *models.Project) (*models.Project, error)`, `ProjectByID(userID, id uuid.UUID)`, `ListProjects(userID uuid.UUID)`, `DeleteProject(userID, id uuid.UUID)` are identical across interface, impl, service, handler, and mocks. Formatter funcs `ProjectToAPI`/`ProjectInputFromAPI` match their call sites. Generated-type assumptions are explicitly re-checked in Task 5 Step 4 with a documented fallback. ✓

**Note on generated names:** go-swagger handler setters (`api.ProjectsListProjectsHandler`, responders `NewListProjectsOK` etc.) are derived from `tag=projects` + operationIds. Task 8 Step 1 includes a one-line confirmation against the generated `operations` package in case a name differs.
