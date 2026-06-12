package repository

import (
	"fmt"

	"github.com/gofrs/uuid"

	"dollbuilder/internal/models"
)

// CreateUserWithPassword inserts a new user row (including password_hash).
func (r *PostgresRepository) CreateUserWithPassword(user *models.User) error {
	if _, err := r.db.Model(user).Returning("*").Insert(); err != nil {
		return fmt.Errorf("insert user %s: %w", user.Email, err)
	}
	return nil
}

// UserByEmail returns the user with the given email.
func (r *PostgresRepository) UserByEmail(email string) (*models.User, error) {
	user := new(models.User)
	if err := r.db.Model(user).Where("email = ?", email).Select(); err != nil {
		return nil, fmt.Errorf("get user by email %s: %w", email, err)
	}
	return user, nil
}

// UserByUUID returns the user with the given id.
func (r *PostgresRepository) UserByUUID(id uuid.UUID) (*models.User, error) {
	user := new(models.User)
	if err := r.db.Model(user).Where("uuid = ?", id).Select(); err != nil {
		return nil, fmt.Errorf("get user by uuid %s: %w", id, err)
	}
	return user, nil
}

// CreateSession inserts a session row.
func (r *PostgresRepository) CreateSession(s *models.Session) error {
	if _, err := r.db.Model(s).Insert(); err != nil {
		return fmt.Errorf("insert session: %w", err)
	}
	return nil
}

// SessionByTokenHash returns the session for a token hash.
func (r *PostgresRepository) SessionByTokenHash(tokenHash string) (*models.Session, error) {
	s := new(models.Session)
	if err := r.db.Model(s).Where("token_hash = ?", tokenHash).Select(); err != nil {
		return nil, fmt.Errorf("get session by token hash: %w", err)
	}
	return s, nil
}

// DeleteSession removes a session by token hash (logout). Missing rows are not an error.
func (r *PostgresRepository) DeleteSession(tokenHash string) error {
	if _, err := r.db.Model((*models.Session)(nil)).Where("token_hash = ?", tokenHash).Delete(); err != nil {
		return fmt.Errorf("delete session: %w", err)
	}
	return nil
}
