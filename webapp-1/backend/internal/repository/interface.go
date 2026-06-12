// Package repository defines persistence interfaces and helpers.
package repository

import (
	"dollbuilder/internal/models"

	"github.com/gofrs/uuid"
)

// IRepository defines the storage interface for database operations.
// This interface abstracts the underlying database implementation.
type IRepository interface {
	// CreateUser creates a new user in the database.
	CreateUser(user *models.User) error

	// UserBy retrieves a user from database using the specified getter.
	UserBy(user *models.User, getter UserGetter) error

	// CreateUserWithPassword inserts a new user row including the password_hash column.
	CreateUserWithPassword(user *models.User) error

	// UserByEmail returns the user with the given email address.
	UserByEmail(email string) (*models.User, error)

	// UserByUUID returns the user with the given UUID.
	UserByUUID(id uuid.UUID) (*models.User, error)

	// CreateSession inserts a new session row.
	CreateSession(s *models.Session) error

	// SessionByTokenHash returns the session matching the given token hash.
	SessionByTokenHash(tokenHash string) (*models.Session, error)

	// DeleteSession removes a session by token hash (logout). Missing rows are not an error.
	DeleteSession(tokenHash string) error

	// CreateProject inserts a new project row.
	CreateProject(p *models.Project) error

	// UpdateProject updates an existing project row by primary key.
	UpdateProject(p *models.Project) error

	// ProjectByID returns the project with the given id owned by userID, or
	// (nil, nil) if no such row exists (not an error).
	ProjectByID(userID, id uuid.UUID) (*models.Project, error)

	// ListProjects returns all projects owned by userID, newest first.
	ListProjects(userID uuid.UUID) ([]*models.Project, error)

	// DeleteProject removes a project owned by userID. Missing rows are not an error.
	DeleteProject(userID, id uuid.UUID) error

	// TODO: Additional repository methods (uncomment and implement as needed):
	//
	// // GetOrCreateUser retrieves a user by getter or creates if not found.
	// // Returns (created bool, error). If created=true, user was inserted.
	// GetOrCreateUser(user *models.User, getter UserGetter) (bool, error)
	//
	// // UpdateUserBy updates a user matching the getter with specified columns.
	// // Pass column names to update selectively, or no columns to update all.
	// UpdateUserBy(user *models.User, getter UserGetter, columns ...string) error
	//
	// // AllUsers retrieves all users from the database.
	// // Use with caution in production - consider pagination for large datasets.
	// AllUsers() ([]*models.User, error)
}
