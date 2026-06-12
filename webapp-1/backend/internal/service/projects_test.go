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

func TestUpsertProjectEqualTimestampKeepsServerCopy(t *testing.T) {
	repo := newProjectMockRepo()
	svc := NewService(repo)
	user := uuid.Must(uuid.NewV4())
	id := uuid.Must(uuid.NewV4())
	ts := time.Now()

	if _, err := svc.UpsertProject(user, &models.Project{UUID: id, Name: "server", UpdatedAt: ts}); err != nil {
		t.Fatalf("seed: %v", err)
	}
	// Same timestamp, different name → server copy must be kept (no overwrite).
	got, err := svc.UpsertProject(user, &models.Project{UUID: id, Name: "incoming", UpdatedAt: ts})
	if err != nil || got.Name != "server" {
		t.Fatalf("expected server copy kept on equal timestamp, got %v %+v", err, got)
	}
}

func TestUpsertProjectDoesNotMutateInput(t *testing.T) {
	svc := NewService(newProjectMockRepo())
	user := uuid.Must(uuid.NewV4())
	in := &models.Project{UUID: uuid.Must(uuid.NewV4()), Name: "x", UpdatedAt: time.Now()}
	if _, err := svc.UpsertProject(user, in); err != nil {
		t.Fatalf("upsert: %v", err)
	}
	if in.UserUUID != uuid.Nil {
		t.Fatalf("UpsertProject must not mutate caller's input; UserUUID was set to %s", in.UserUUID)
	}
}
