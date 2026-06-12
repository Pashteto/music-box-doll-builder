package service

import (
	"fmt"
	"time"

	"github.com/gofrs/uuid"

	"dollbuilder/internal/models"
)

// ListProjects returns all projects owned by userID, newest first.
func (s *Service) ListProjects(userID uuid.UUID) ([]*models.Project, error) {
	ps, err := s.repository.ListProjects(userID)
	if err != nil {
		return nil, fmt.Errorf("list projects: %w", err)
	}
	return ps, nil
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
// The caller's *p is never mutated — work happens on a copy and the result is returned.
func (s *Service) UpsertProject(userID uuid.UUID, p *models.Project) (*models.Project, error) {
	if p.Name == "" {
		return nil, fmt.Errorf("%w: name is required", ErrInvalidInput)
	}

	existing, err := s.repository.ProjectByID(userID, p.UUID)
	if err != nil {
		return nil, fmt.Errorf("lookup project: %w", err)
	}

	// Work on a copy so we never mutate the caller's input.
	proj := *p
	proj.UserUUID = userID

	if existing == nil {
		if proj.CreatedAt.IsZero() {
			proj.CreatedAt = time.Now()
		}
		if proj.UpdatedAt.IsZero() {
			proj.UpdatedAt = proj.CreatedAt
		}
		if err := s.repository.CreateProject(&proj); err != nil {
			return nil, fmt.Errorf("create project: %w", err)
		}
		return &proj, nil
	}

	// Last-write-wins: keep the server copy unless the incoming version is
	// STRICTLY newer. Equal timestamps (e.g. a client re-pushing the version it
	// just received) are a no-op that returns the server copy without a write.
	if !existing.UpdatedAt.Before(proj.UpdatedAt) {
		return existing, nil
	}
	proj.CreatedAt = existing.CreatedAt
	if err := s.repository.UpdateProject(&proj); err != nil {
		return nil, fmt.Errorf("update project: %w", err)
	}
	return &proj, nil
}

// DeleteProject removes a project owned by userID.
func (s *Service) DeleteProject(userID, id uuid.UUID) error {
	if err := s.repository.DeleteProject(userID, id); err != nil {
		return fmt.Errorf("delete project: %w", err)
	}
	return nil
}
