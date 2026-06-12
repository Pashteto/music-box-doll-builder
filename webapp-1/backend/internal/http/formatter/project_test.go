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
	m, ok := out.Data.(map[string]interface{})
	if !ok || m["a"] != float64(1) {
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

func TestProjectInputFromAPI_NilInput(t *testing.T) {
	p := ProjectInputFromAPI(nil)
	if p == nil {
		t.Fatal("expected non-nil zero-value Project for nil input")
	}
	if p.Name != "" || p.Data != nil {
		t.Fatalf("expected empty Project, got %+v", p)
	}
}
