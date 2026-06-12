package service

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/gofrs/uuid"

	"dollbuilder/internal/auth"
	"dollbuilder/internal/models"
)

// sessionCache is the optional Redis cache; nil-safe (service works without it).
type sessionCache interface {
	GetSessionUserID(ctx context.Context, tokenHash string) (string, bool)
	SetSessionUserID(ctx context.Context, tokenHash, userID string, ttl time.Duration)
	DeleteSession(ctx context.Context, tokenHash string)
	AllowLoginAttempt(ctx context.Context, id string, limit int64, window time.Duration) bool
}

// SetCache attaches an optional session cache (nil-safe).
func (s *Service) SetCache(c sessionCache) { s.cache = c }

const sessionTTL = 30 * 24 * time.Hour

// SignUp creates a user with a hashed password.
func (s *Service) SignUp(email, password, userAgent string) (*models.User, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	if len(password) < 8 {
		return nil, ErrWeakPassword
	}
	if u, err := s.repository.UserByEmail(email); err == nil && u != nil {
		return nil, ErrEmailTaken
	}
	hash, err := auth.HashPassword(password)
	if err != nil {
		return nil, err
	}
	user := &models.User{
		UUID:         uuid.Must(uuid.NewV4()),
		Email:        email,
		Name:         email,
		PasswordHash: hash,
		Status:       models.UserActive,
	}
	if err := s.repository.CreateUserWithPassword(user); err != nil {
		if strings.Contains(err.Error(), "duplicate key") || strings.Contains(err.Error(), "23505") {
			return nil, ErrEmailTaken
		}
		return nil, fmt.Errorf("create user: %w", err)
	}
	return user, nil
}

// Login verifies credentials and creates a session; returns the raw token.
func (s *Service) Login(email, password, userAgent string) (*models.User, string, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	if s.cache != nil && !s.cache.AllowLoginAttempt(context.Background(), email, 10, 15*time.Minute) {
		return nil, "", ErrInvalidCredentials // do not reveal rate-limit state
	}
	user, err := s.repository.UserByEmail(email)
	if err != nil || user == nil || user.PasswordHash == "" {
		return nil, "", ErrInvalidCredentials
	}
	ok, err := auth.VerifyPassword(password, user.PasswordHash)
	if err != nil || !ok {
		return nil, "", ErrInvalidCredentials
	}
	raw, err := auth.NewSessionToken()
	if err != nil {
		return nil, "", err
	}
	session := &models.Session{
		UUID:      uuid.Must(uuid.NewV4()),
		UserUUID:  user.UUID,
		TokenHash: auth.HashToken(raw),
		UserAgent: userAgent,
		ExpiresAt: time.Now().Add(sessionTTL),
	}
	if err := s.repository.CreateSession(session); err != nil {
		return nil, "", err
	}
	return user, raw, nil
}

// Authenticate resolves a raw session token to its user.
func (s *Service) Authenticate(rawToken string) (*models.User, error) {
	if rawToken == "" {
		return nil, ErrInvalidSession
	}
	return s.authenticateByHash(auth.HashToken(rawToken))
}

func (s *Service) authenticateByHash(tokenHash string) (*models.User, error) {
	// Session row is the source of truth — always validated so revocation is prompt.
	session, err := s.repository.SessionByTokenHash(tokenHash)
	if err != nil || session == nil {
		if s.cache != nil {
			s.cache.DeleteSession(context.Background(), tokenHash) // evict any stale cache entry
		}
		return nil, ErrInvalidSession
	}
	if time.Now().After(session.ExpiresAt) {
		_ = s.repository.DeleteSession(tokenHash)
		if s.cache != nil {
			s.cache.DeleteSession(context.Background(), tokenHash)
		}
		return nil, ErrInvalidSession
	}

	// Cache only short-circuits the user lookup (not session validity).
	if s.cache != nil {
		if uid, ok := s.cache.GetSessionUserID(context.Background(), tokenHash); ok {
			if id, err := uuid.FromString(uid); err == nil && id == session.UserUUID {
				if u, err := s.repository.UserByUUID(id); err == nil && u != nil {
					return u, nil
				}
			}
		}
	}

	user, err := s.repository.UserByUUID(session.UserUUID)
	if err != nil || user == nil {
		return nil, ErrInvalidSession
	}
	// Populate cache for subsequent user lookups.
	if s.cache != nil {
		s.cache.SetSessionUserID(context.Background(), tokenHash, user.UUID.String(), 10*time.Minute)
	}
	return user, nil
}

// Logout deletes the session for a raw token.
func (s *Service) Logout(rawToken string) error {
	if s.cache != nil {
		s.cache.DeleteSession(context.Background(), auth.HashToken(rawToken))
	}
	return s.repository.DeleteSession(auth.HashToken(rawToken))
}
