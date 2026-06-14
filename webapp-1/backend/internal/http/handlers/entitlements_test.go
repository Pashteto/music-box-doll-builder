package handlers

import (
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofrs/uuid"

	domainauth "dollbuilder/internal/auth"
	checkoutops "dollbuilder/internal/http/server/operations/checkout"
	entops "dollbuilder/internal/http/server/operations/entitlements"
	domainmodels "dollbuilder/internal/models"
)

func entReq(u *domainmodels.User) (params entops.GetEntitlementParams) {
	r := httptest.NewRequest("GET", "/api/v1/entitlements", nil)
	if u != nil {
		r = r.WithContext(domainauth.WithUser(r.Context(), u))
	}
	params.HTTPRequest = r
	return params
}

func mockReq(u *domainmodels.User) (params entops.MockCheckoutParams) {
	r := httptest.NewRequest("POST", "/api/v1/entitlements/mock-checkout", nil)
	if u != nil {
		r = r.WithContext(domainauth.WithUser(r.Context(), u))
	}
	params.HTTPRequest = r
	return params
}

func checkoutReq(u *domainmodels.User) (params checkoutops.CreateCheckoutSessionParams) {
	r := httptest.NewRequest("POST", "/api/v1/checkout/session", nil)
	if u != nil {
		r = r.WithContext(domainauth.WithUser(r.Context(), u))
	}
	params.HTTPRequest = r
	return params
}

func TestGetEntitlementUnauthenticated(t *testing.T) {
	h := NewGetEntitlement(&mockService{})
	rec := httptest.NewRecorder()
	h.Handle(entReq(nil)).WriteResponse(rec, apiProducer())
	if rec.Code != 401 {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestGetEntitlementOK(t *testing.T) {
	user := &domainmodels.User{UUID: uuid.Must(uuid.NewV4())}
	svc := &mockService{
		entitlementFunc: func(uid uuid.UUID) (bool, string, error) {
			if uid != user.UUID {
				t.Fatalf("handler must scope to ctx user")
			}
			return true, "stripe", nil
		},
	}
	rec := httptest.NewRecorder()
	NewGetEntitlement(svc).Handle(entReq(user)).WriteResponse(rec, apiProducer())
	if rec.Code != 200 {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if body := rec.Body.String(); !strings.Contains(body, `"entitled":true`) {
		t.Fatalf("expected entitled:true in body, got %s", body)
	}
}

func TestMockCheckoutForbiddenWhenDisabled(t *testing.T) {
	user := &domainmodels.User{UUID: uuid.Must(uuid.NewV4())}
	rec := httptest.NewRecorder()
	NewMockCheckout(&mockService{}, false).Handle(mockReq(user)).WriteResponse(rec, apiProducer())
	if rec.Code != 403 {
		t.Fatalf("expected 403 when mock disabled, got %d", rec.Code)
	}
}

func TestMockCheckoutGrants(t *testing.T) {
	user := &domainmodels.User{UUID: uuid.Must(uuid.NewV4())}
	granted := false
	svc := &mockService{grantMockFunc: func(uid uuid.UUID) error {
		if uid != user.UUID {
			t.Fatalf("scope mismatch")
		}
		granted = true
		return nil
	}}
	rec := httptest.NewRecorder()
	NewMockCheckout(svc, true).Handle(mockReq(user)).WriteResponse(rec, apiProducer())
	if rec.Code != 200 || !granted {
		t.Fatalf("expected 200 + grant; got code=%d granted=%v", rec.Code, granted)
	}
}

func TestCheckoutUnauthenticated(t *testing.T) {
	rec := httptest.NewRecorder()
	NewCreateCheckoutSession(&mockService{}).Handle(checkoutReq(nil)).WriteResponse(rec, apiProducer())
	if rec.Code != 401 {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}
