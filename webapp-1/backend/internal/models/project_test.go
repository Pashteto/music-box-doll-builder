package models

import (
	"testing"

	"github.com/gofrs/uuid"
)

func TestProject_Validate_Valid(t *testing.T) {
	p := &Project{
		UUID:     uuid.Must(uuid.NewV4()),
		UserUUID: uuid.Must(uuid.NewV4()),
		Name:     "My Doll",
	}
	if err := p.Validate(); err != nil {
		t.Fatalf("expected valid project, got %v", err)
	}
}

func TestProject_Validate_MissingName(t *testing.T) {
	p := &Project{UUID: uuid.Must(uuid.NewV4())}
	assertValidationError(t, p.Validate(), "name", "is required")
}
