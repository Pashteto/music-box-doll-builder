package handlers

import (
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-openapi/runtime"
	"github.com/go-openapi/strfmt"
	"github.com/gofrs/uuid"

	domainauth "dollbuilder/internal/auth"
	apimodels "dollbuilder/internal/http/models"
	projectsops "dollbuilder/internal/http/server/operations/projects"
	domainmodels "dollbuilder/internal/models"
	"dollbuilder/internal/service"
)

func apiProducer() runtime.Producer { return runtime.JSONProducer() }

func listProjectsReq(u *domainmodels.User) (params projectsops.ListProjectsParams) {
	r := httptest.NewRequest("GET", "/api/v1/projects", nil)
	if u != nil {
		r = r.WithContext(domainauth.WithUser(r.Context(), u))
	}
	params.HTTPRequest = r
	return params
}

func TestListProjectsUnauthenticated(t *testing.T) {
	h := NewListProjects(&mockService{})
	resp := h.Handle(listProjectsReq(nil))
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
	resp := h.Handle(listProjectsReq(user))
	rec := httptest.NewRecorder()
	resp.WriteResponse(rec, apiProducer())
	if rec.Code != 200 {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}

func TestGetProjectOK(t *testing.T) {
	user := &domainmodels.User{UUID: uuid.Must(uuid.NewV4())}
	id := uuid.Must(uuid.NewV4())
	svc := &mockService{
		getProjectFunc: func(uid, pid uuid.UUID) (*domainmodels.Project, error) {
			if uid != user.UUID || pid != id {
				t.Fatalf("scope/id mismatch: %s %s", uid, pid)
			}
			return &domainmodels.Project{UUID: id, Name: "p", UpdatedAt: time.Now()}, nil
		},
	}
	h := NewGetProject(svc)
	r := httptest.NewRequest("GET", "/api/v1/projects/"+id.String(), nil)
	r = r.WithContext(domainauth.WithUser(r.Context(), user))
	resp := h.Handle(projectsops.GetProjectParams{HTTPRequest: r, ID: strfmt.UUID(id.String())})
	rec := httptest.NewRecorder()
	resp.WriteResponse(rec, apiProducer())
	if rec.Code != 200 {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}

func TestGetProjectNotFound(t *testing.T) {
	user := &domainmodels.User{UUID: uuid.Must(uuid.NewV4())}
	id := uuid.Must(uuid.NewV4())
	h := NewGetProject(&mockService{}) // default getProjectFunc returns service.ErrNotFound
	r := httptest.NewRequest("GET", "/api/v1/projects/"+id.String(), nil)
	r = r.WithContext(domainauth.WithUser(r.Context(), user))
	resp := h.Handle(projectsops.GetProjectParams{HTTPRequest: r, ID: strfmt.UUID(id.String())})
	rec := httptest.NewRecorder()
	resp.WriteResponse(rec, apiProducer())
	if rec.Code != 404 {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestDeleteProjectNoContent(t *testing.T) {
	user := &domainmodels.User{UUID: uuid.Must(uuid.NewV4())}
	id := uuid.Must(uuid.NewV4())
	called := false
	svc := &mockService{
		deleteProjectFunc: func(uid, pid uuid.UUID) error {
			called = true
			if uid != user.UUID || pid != id {
				t.Fatalf("scope/id mismatch: %s %s", uid, pid)
			}
			return nil
		},
	}
	h := NewDeleteProject(svc)
	r := httptest.NewRequest("DELETE", "/api/v1/projects/"+id.String(), nil)
	r = r.WithContext(domainauth.WithUser(r.Context(), user))
	resp := h.Handle(projectsops.DeleteProjectParams{HTTPRequest: r, ID: strfmt.UUID(id.String())})
	rec := httptest.NewRecorder()
	resp.WriteResponse(rec, apiProducer())
	if rec.Code != 204 {
		t.Fatalf("expected 204, got %d", rec.Code)
	}
	if !called {
		t.Fatal("expected service DeleteProject to be called")
	}
}

func TestUpsertProjectBadRequestOnInvalidInput(t *testing.T) {
	user := &domainmodels.User{UUID: uuid.Must(uuid.NewV4())}
	id := uuid.Must(uuid.NewV4())
	name := ""
	now := strfmt.DateTime(time.Now())
	svc := &mockService{
		upsertProjectFunc: func(_ uuid.UUID, _ *domainmodels.Project) (*domainmodels.Project, error) {
			return nil, service.ErrInvalidInput
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
	if rec.Code != 400 {
		t.Fatalf("expected 400, got %d", rec.Code)
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
