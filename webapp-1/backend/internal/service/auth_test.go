package service

import (
	"errors"
	"testing"
	"time"

	"github.com/gofrs/uuid"
	"dollbuilder/internal/models"
	"dollbuilder/internal/repository"
)

type authMockRepo struct {
	repository.IRepository // embedded (nil); only auth methods overridden
	usersByEmail map[string]*models.User
	usersByID    map[uuid.UUID]*models.User
	sessions     map[string]*models.Session
}

func newAuthMockRepo() *authMockRepo {
	return &authMockRepo{
		usersByEmail: map[string]*models.User{},
		usersByID:    map[uuid.UUID]*models.User{},
		sessions:     map[string]*models.Session{},
	}
}
func (m *authMockRepo) CreateUserWithPassword(u *models.User) error {
	if _, ok := m.usersByEmail[u.Email]; ok {
		return errors.New("duplicate")
	}
	m.usersByEmail[u.Email] = u
	m.usersByID[u.UUID] = u
	return nil
}
func (m *authMockRepo) UserByEmail(email string) (*models.User, error) {
	u, ok := m.usersByEmail[email]
	if !ok {
		return nil, errors.New("not found")
	}
	return u, nil
}
func (m *authMockRepo) UserByUUID(id uuid.UUID) (*models.User, error) {
	u, ok := m.usersByID[id]
	if !ok {
		return nil, errors.New("not found")
	}
	return u, nil
}
func (m *authMockRepo) CreateSession(s *models.Session) error { m.sessions[s.TokenHash] = s; return nil }
func (m *authMockRepo) SessionByTokenHash(h string) (*models.Session, error) {
	s, ok := m.sessions[h]
	if !ok {
		return nil, errors.New("not found")
	}
	return s, nil
}
func (m *authMockRepo) DeleteSession(h string) error { delete(m.sessions, h); return nil }

func TestSignUpThenLogin(t *testing.T) {
	repo := newAuthMockRepo()
	svc := NewService(repo) // adjust if NewService needs more args

	user, err := svc.SignUp("A@b.com ", "hunter2hunter2", "ua")
	if err != nil {
		t.Fatalf("SignUp: %v", err)
	}
	if user.Email != "a@b.com" { // normalized to lowercase+trimmed
		t.Fatalf("expected normalized email, got %q", user.Email)
	}

	if _, err := svc.SignUp("a@b.com", "another-pass", "ua"); !errors.Is(err, ErrEmailTaken) {
		t.Fatalf("expected ErrEmailTaken, got %v", err)
	}
	if _, err := svc.SignUp("weak@b.com", "short", "ua"); !errors.Is(err, ErrWeakPassword) {
		t.Fatalf("expected ErrWeakPassword, got %v", err)
	}

	if _, _, err := svc.Login("a@b.com", "wrong", "ua"); !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("expected ErrInvalidCredentials, got %v", err)
	}

	u2, raw, err := svc.Login("a@b.com", "hunter2hunter2", "ua")
	if err != nil || raw == "" || u2.UUID != user.UUID {
		t.Fatalf("Login: %v raw=%q", err, raw)
	}

	au, err := svc.Authenticate(raw)
	if err != nil || au.UUID != user.UUID {
		t.Fatalf("Authenticate: %v", err)
	}

	if err := svc.Logout(raw); err != nil {
		t.Fatalf("Logout: %v", err)
	}
	if _, err := svc.Authenticate(raw); !errors.Is(err, ErrInvalidSession) {
		t.Fatalf("expected ErrInvalidSession after logout, got %v", err)
	}
	if _, err := svc.Authenticate(""); !errors.Is(err, ErrInvalidSession) {
		t.Fatalf("expected ErrInvalidSession for empty token, got %v", err)
	}
}

func TestAuthenticateExpired(t *testing.T) {
	repo := newAuthMockRepo()
	svc := NewService(repo)
	repo.sessions["expiredhash"] = &models.Session{
		UUID: uuid.Must(uuid.NewV4()), TokenHash: "expiredhash", ExpiresAt: time.Now().Add(-time.Minute),
	}
	// Type-assert to concrete *Service to call unexported method
	if _, err := svc.(*Service).authenticateByHash("expiredhash"); !errors.Is(err, ErrInvalidSession) {
		t.Fatalf("expected ErrInvalidSession for expired, got %v", err)
	}
}
