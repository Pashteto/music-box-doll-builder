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
