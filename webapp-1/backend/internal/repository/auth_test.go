//go:build integration

package repository

import (
	"os"
	"testing"
	"time"

	"github.com/go-pg/pg/v10"
	"github.com/gofrs/uuid"

	"dollbuilder/internal/models"
)

// newTestRepo opens a *PostgresRepository backed by the DSN in DATABASE_URL.
func newTestRepo(t *testing.T, dsn string) *PostgresRepository {
	t.Helper()

	opts, err := pg.ParseURL(dsn)
	if err != nil {
		t.Fatalf("parse DATABASE_URL: %v", err)
	}

	db := pg.Connect(opts)
	t.Cleanup(func() { _ = db.Close() })

	return &PostgresRepository{db: db}
}

// cleanupTestUser deletes the test user (and FK-cascaded sessions) by email.
func cleanupTestUser(t *testing.T, repo *PostgresRepository, email string) {
	t.Helper()

	if _, err := repo.db.Model((*models.User)(nil)).Where("email = ?", email).Delete(); err != nil {
		t.Logf("cleanup: delete user %q: %v", email, err)
	}
}

func TestAuthRepoRoundTrip(t *testing.T) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set")
	}

	repo := newTestRepo(t, dsn)
	t.Cleanup(func() { cleanupTestUser(t, repo, "repo-test@example.com") })

	// --- User round-trip ---
	u := &models.User{
		UUID:         uuid.Must(uuid.NewV4()),
		Email:        "repo-test@example.com",
		Name:         "Repo Test",
		PasswordHash: "x",
		Status:       models.UserActive,
	}
	if err := repo.CreateUserWithPassword(u); err != nil {
		t.Fatalf("CreateUserWithPassword: %v", err)
	}

	got, err := repo.UserByEmail("repo-test@example.com")
	if err != nil {
		t.Fatalf("UserByEmail error: %v", err)
	}
	if got.UUID != u.UUID {
		t.Fatalf("UserByEmail UUID mismatch: want %s, got %s", u.UUID, got.UUID)
	}

	got2, err := repo.UserByUUID(u.UUID)
	if err != nil {
		t.Fatalf("UserByUUID error: %v", err)
	}
	if got2.Email != "repo-test@example.com" {
		t.Fatalf("UserByUUID email mismatch: got %s", got2.Email)
	}

	// --- Session round-trip ---
	s := &models.Session{
		UUID:      uuid.Must(uuid.NewV4()),
		UserUUID:  u.UUID,
		TokenHash: "hash123",
		ExpiresAt: time.Now().Add(time.Hour),
	}
	if err := repo.CreateSession(s); err != nil {
		t.Fatalf("CreateSession: %v", err)
	}

	sess, err := repo.SessionByTokenHash("hash123")
	if err != nil {
		t.Fatalf("SessionByTokenHash: %v", err)
	}
	if sess.UserUUID != u.UUID {
		t.Fatalf("SessionByTokenHash UserUUID mismatch: want %s, got %s", u.UUID, sess.UserUUID)
	}

	if err := repo.DeleteSession("hash123"); err != nil {
		t.Fatalf("DeleteSession: %v", err)
	}

	if _, err := repo.SessionByTokenHash("hash123"); err == nil {
		t.Fatal("expected error after delete, got nil")
	}
}
