package repository

import (
	"testing"

	"github.com/gofrs/uuid"

	"dollbuilder/internal/models"
)

// mockRepository implements IRepository for testing purposes.
type mockRepository struct{}

func (m *mockRepository) CreateUser(_ *models.User) error           { return nil }
func (m *mockRepository) UserBy(_ *models.User, _ UserGetter) error { return nil }
func (m *mockRepository) CreateUserWithPassword(_ *models.User) error {
	return nil
}
func (m *mockRepository) UserByEmail(_ string) (*models.User, error)     { return nil, nil }
func (m *mockRepository) UserByUUID(_ uuid.UUID) (*models.User, error)   { return nil, nil }
func (m *mockRepository) CreateSession(_ *models.Session) error          { return nil }
func (m *mockRepository) SessionByTokenHash(_ string) (*models.Session, error) {
	return nil, nil
}
func (m *mockRepository) DeleteSession(_ string) error { return nil }

func TestRepositoryInterface_MockImplementation(t *testing.T) {
	repo := &mockRepository{}

	if err := repo.CreateUser(&models.User{Email: "test@example.com"}); err != nil {
		t.Fatalf("CreateUser returned error: %v", err)
	}

	if err := repo.UserBy(&models.User{Email: "test@example.com"}, Email); err != nil {
		t.Fatalf("UserBy returned error: %v", err)
	}
}

//nolint:govet // test table alignment is acceptable here
func TestUserGetter_String(t *testing.T) {
	tests := []struct {
		getter UserGetter
		want   string
	}{
		{getter: UserUUID, want: "uuid"},
		{getter: Email, want: "email"},
	}

	for _, tt := range tests {
		if got := tt.getter.String(); got != tt.want {
			t.Errorf("UserGetter.String() = %v, want %v", got, tt.want)
		}
	}
}

func TestUserGetter_Validate(t *testing.T) {
	if err := UserUUID.Validate(); err != nil {
		t.Errorf("UserUUID should be valid: %v", err)
	}
	if err := Email.Validate(); err != nil {
		t.Errorf("Email should be valid: %v", err)
	}

	invalid := UserGetter(999)
	if err := invalid.Validate(); err == nil {
		t.Error("Invalid getter should return error")
	}
}
