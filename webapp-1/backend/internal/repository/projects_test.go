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
