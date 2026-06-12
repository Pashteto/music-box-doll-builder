package handlers

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofrs/uuid"

	"dollbuilder/internal/auth"
	domain "dollbuilder/internal/models"
	authops "dollbuilder/internal/http/server/operations/auth"
)

func TestGetMeUnauthenticated(t *testing.T) {
	h := NewGetMe(nil)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
	resp := h.Handle(authops.GetMeParams{HTTPRequest: req})
	if _, ok := resp.(*authops.GetMeUnauthorized); !ok {
		t.Fatalf("expected 401 GetMeUnauthorized, got %T", resp)
	}
}

func TestGetMeAuthenticated(t *testing.T) {
	h := NewGetMe(nil)
	u := &domain.User{UUID: uuid.Must(uuid.NewV4()), Email: "x@y.com", Name: "X"}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
	req = req.WithContext(auth.WithUser(req.Context(), u))
	resp := h.Handle(authops.GetMeParams{HTTPRequest: req})
	if _, ok := resp.(*authops.GetMeOK); !ok {
		t.Fatalf("expected 200 GetMeOK, got %T", resp)
	}
}
