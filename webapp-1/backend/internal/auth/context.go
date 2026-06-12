package auth

import (
	"context"

	"dollbuilder/internal/models"
)

// SessionCookieName is the httpOnly cookie carrying the raw session token.
const SessionCookieName = "db_session"

type ctxKey int

const userKey ctxKey = 0

// WithUser returns a context carrying the authenticated user.
func WithUser(ctx context.Context, u *models.User) context.Context {
	return context.WithValue(ctx, userKey, u)
}

// UserFromContext returns the authenticated user, or nil if unauthenticated.
func UserFromContext(ctx context.Context) *models.User {
	u, _ := ctx.Value(userKey).(*models.User)
	return u
}
