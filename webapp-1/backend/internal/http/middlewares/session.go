package middlewares

import (
	"net/http"

	domainauth "dollbuilder/internal/auth"
	"dollbuilder/internal/models"
)

// SessionAuth reads the session cookie (if present), validates it via authFn,
// and injects the user into the request context. It NEVER rejects — handlers
// that require auth check the context and return 401 themselves. This keeps
// public routes (signup/login/health) working through the same chain.
func SessionAuth(authFn func(rawToken string) (*models.User, error)) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if c, err := r.Cookie(domainauth.SessionCookieName); err == nil && c.Value != "" {
				if user, err := authFn(c.Value); err == nil && user != nil {
					r = r.WithContext(domainauth.WithUser(r.Context(), user))
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}
