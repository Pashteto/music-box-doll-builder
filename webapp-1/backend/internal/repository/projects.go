package repository

import (
	"errors"
	"fmt"

	"github.com/go-pg/pg/v10"
	"github.com/gofrs/uuid"

	"dollbuilder/internal/models"
)

// CreateProject inserts a new project row.
func (r *PostgresRepository) CreateProject(p *models.Project) error {
	if _, err := r.db.Model(p).Insert(); err != nil {
		return fmt.Errorf("insert project %s: %w", p.UUID, err)
	}
	return nil
}

// UpdateProject updates an existing project row by primary key.
func (r *PostgresRepository) UpdateProject(p *models.Project) error {
	if _, err := r.db.Model(p).WherePK().Update(); err != nil {
		return fmt.Errorf("update project %s: %w", p.UUID, err)
	}
	return nil
}

// ProjectByID returns the project owned by userID, or (nil, nil) if absent.
func (r *PostgresRepository) ProjectByID(userID, id uuid.UUID) (*models.Project, error) {
	p := new(models.Project)
	err := r.db.Model(p).Where("uuid = ? AND user_uuid = ?", id, userID).Select()
	if errors.Is(err, pg.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get project %s: %w", id, err)
	}
	return p, nil
}

// ListProjects returns all projects owned by userID, newest first.
func (r *PostgresRepository) ListProjects(userID uuid.UUID) ([]*models.Project, error) {
	var ps []*models.Project
	if err := r.db.Model(&ps).Where("user_uuid = ?", userID).Order("updated_at DESC").Select(); err != nil {
		return nil, fmt.Errorf("list projects for %s: %w", userID, err)
	}
	return ps, nil
}

// DeleteProject removes a project owned by userID. Missing rows are not an error.
func (r *PostgresRepository) DeleteProject(userID, id uuid.UUID) error {
	if _, err := r.db.Model((*models.Project)(nil)).
		Where("uuid = ? AND user_uuid = ?", id, userID).Delete(); err != nil {
		return fmt.Errorf("delete project %s: %w", id, err)
	}
	return nil
}
