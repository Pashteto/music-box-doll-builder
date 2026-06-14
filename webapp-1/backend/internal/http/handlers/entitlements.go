package handlers

import (
	"errors"
	"net/http"

	"github.com/go-openapi/runtime/middleware"

	"dollbuilder/internal/auth"
	apimodels "dollbuilder/internal/http/models"
	checkoutops "dollbuilder/internal/http/server/operations/checkout"
	entops "dollbuilder/internal/http/server/operations/entitlements"
	"dollbuilder/internal/service"
	stripeclient "dollbuilder/internal/stripe"
)

// GetEntitlement handler — returns the current user's export entitlement.
type GetEntitlement struct{ svc service.IService }

// NewGetEntitlement creates a new GetEntitlement handler.
func NewGetEntitlement(svc service.IService) *GetEntitlement { return &GetEntitlement{svc} }

// Handle returns the entitlement state for the authenticated user.
func (h *GetEntitlement) Handle(params entops.GetEntitlementParams) middleware.Responder {
	user := auth.UserFromContext(params.HTTPRequest.Context())
	if user == nil {
		return entops.NewGetEntitlementUnauthorized().WithPayload(DefaultError(http.StatusUnauthorized, service.ErrInvalidSession, nil))
	}
	entitled, source, err := h.svc.Entitlement(user.UUID)
	if err != nil {
		return entops.NewGetEntitlementInternalServerError().WithPayload(DefaultError(http.StatusInternalServerError, err, nil))
	}
	return entops.NewGetEntitlementOK().WithPayload(&apimodels.Entitlement{Entitled: &entitled, Source: source})
}

// MockCheckout handler — grants entitlement without Stripe (dev/test only).
type MockCheckout struct {
	svc     service.IService
	allowed bool
}

// NewMockCheckout creates a new MockCheckout handler. allowed gates the endpoint (off in prod).
func NewMockCheckout(svc service.IService, allowed bool) *MockCheckout {
	return &MockCheckout{svc, allowed}
}

// Handle grants a mock entitlement to the authenticated user.
func (h *MockCheckout) Handle(params entops.MockCheckoutParams) middleware.Responder {
	user := auth.UserFromContext(params.HTTPRequest.Context())
	if user == nil {
		return entops.NewMockCheckoutUnauthorized().WithPayload(DefaultError(http.StatusUnauthorized, service.ErrInvalidSession, nil))
	}
	if !h.allowed {
		return entops.NewMockCheckoutForbidden().WithPayload(DefaultError(http.StatusForbidden, service.ErrInvalidInput, nil))
	}
	if err := h.svc.GrantMock(user.UUID); err != nil {
		return entops.NewMockCheckoutInternalServerError().WithPayload(DefaultError(http.StatusInternalServerError, err, nil))
	}
	entitled := true
	return entops.NewMockCheckoutOK().WithPayload(&apimodels.Entitlement{Entitled: &entitled, Source: "mock"})
}

// CreateCheckoutSession handler — starts a real Stripe Checkout (test-mode) session.
type CreateCheckoutSession struct{ svc service.IService }

// NewCreateCheckoutSession creates a new CreateCheckoutSession handler.
func NewCreateCheckoutSession(svc service.IService) *CreateCheckoutSession {
	return &CreateCheckoutSession{svc}
}

// Handle returns a Stripe Checkout URL for the authenticated user.
func (h *CreateCheckoutSession) Handle(params checkoutops.CreateCheckoutSessionParams) middleware.Responder {
	user := auth.UserFromContext(params.HTTPRequest.Context())
	if user == nil {
		return checkoutops.NewCreateCheckoutSessionUnauthorized().WithPayload(DefaultError(http.StatusUnauthorized, service.ErrInvalidSession, nil))
	}
	url, err := h.svc.CheckoutSession(user.UUID, user.Email)
	if errors.Is(err, stripeclient.ErrNotConfigured) {
		return checkoutops.NewCreateCheckoutSessionServiceUnavailable().WithPayload(DefaultError(http.StatusServiceUnavailable, err, nil))
	}
	if err != nil {
		return checkoutops.NewCreateCheckoutSessionInternalServerError().WithPayload(DefaultError(http.StatusInternalServerError, err, nil))
	}
	return checkoutops.NewCreateCheckoutSessionOK().WithPayload(&apimodels.CheckoutSession{CheckoutURL: &url})
}
