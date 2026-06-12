package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/gofrs/uuid"

	"dollbuilder/internal/models"
	"dollbuilder/internal/repository"
	"dollbuilder/pkg/logger"
)

// IService defines the business logic interface for domain operations.
// This service orchestrates repository operations and implements business rules.
type IService interface {
	// CreateUser creates a new user.
	CreateUser(ctx context.Context, user *models.User) error

	// GetUserByEmail retrieves a user by email address.
	GetUserByEmail(ctx context.Context, email string) (*models.User, error)

	// SignUp creates a new user account with an email and password.
	SignUp(email, password, userAgent string) (*models.User, error)

	// Login validates credentials and returns the user and a raw session token.
	Login(email, password, userAgent string) (*models.User, string, error)

	// Authenticate resolves a raw session token to its user.
	Authenticate(rawToken string) (*models.User, error)

	// Logout invalidates the session for the given raw token.
	Logout(rawToken string) error

	// ListProjects returns all projects owned by userID, newest first.
	ListProjects(userID uuid.UUID) ([]*models.Project, error)

	// GetProject returns one project owned by userID, or ErrNotFound.
	GetProject(userID, id uuid.UUID) (*models.Project, error)

	// UpsertProject creates or updates a project for userID using last-write-wins
	// by UpdatedAt. Returns the project the server now holds.
	UpsertProject(userID uuid.UUID, p *models.Project) (*models.Project, error)

	// DeleteProject removes a project owned by userID.
	DeleteProject(userID, id uuid.UUID) error
}

// Service implements IService interface.
type Service struct {
	repository repository.IRepository

	// cache is the optional Redis session cache. Nil when cache is disabled.
	// All cache accesses are guarded by nil checks so the service works without it.
	cache sessionCache
}

// NewService creates a new service instance.
// Dependencies:
//   - repository: Required. Handles data persistence.
//
// Future dependencies (add as needed):
//   - sessions: Optional. Session management for auth.
//   - cache: Optional. Caching layer for performance.
//   - events: Optional. Event publishing for async operations.
func NewService(repository repository.IRepository) IService {
	return &Service{
		repository: repository,
	}
}

// CreateUser creates a new user in the system.
// TODO: Add validation, business rules, etc.
func (s *Service) CreateUser(_ context.Context, user *models.User) error {
	logger.Log().Info("creating user")

	if user == nil {
		return fmt.Errorf("%w: user is required", ErrInvalidInput)
	}

	// TODO: Validate user data (e.g., user.Validate())
	// TODO: Check for duplicates
	// TODO: Apply business rules

	if s.repository == nil {
		return fmt.Errorf("repository not available: %w", ErrRepositoryUnavailable)
	}

	if err := s.repository.CreateUser(user); err != nil {
		return fmt.Errorf("create user: %w", err)
	}

	// TODO: Publish user created event (when event system is added)
	// TODO: Send welcome email (when notification system is added)

	return nil
}

// GetUserByEmail retrieves a user by email address.
// TODO: Implement caching when cache module is added.
func (s *Service) GetUserByEmail(_ context.Context, email string) (*models.User, error) {
	logger.Log().Infof("getting user by email: %s", email)

	if email == "" {
		return nil, fmt.Errorf("%w: email is required", ErrInvalidInput)
	}

	// TODO: Check cache first (when cache module is added)

	if s.repository == nil {
		return nil, fmt.Errorf("repository not available: %w", ErrRepositoryUnavailable)
	}

	user := &models.User{Email: email}

	if err := s.repository.UserBy(user, repository.Email); err != nil {
		// Check if it's a not found error from go-pg
		if errors.Unwrap(err).Error() == "pg: no rows in result set" {
			return nil, fmt.Errorf("%w: user with email %s", ErrNotFound, email)
		}
		return nil, fmt.Errorf("get user by email: %w", err)
	}

	// TODO: Store in cache (when cache module is added)

	return user, nil
}
