package middlewares

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofrs/uuid"
)

type fakeGranter struct {
	called bool
	uid    string
}

func (f *fakeGranter) GrantFromStripe(userID, _, _, _ string) error {
	f.called = true
	f.uid = userID
	return nil
}

func next404() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNotFound) })
}

func TestWebhookRejectsBadSignature(t *testing.T) {
	g := &fakeGranter{}
	verify := func(_ []byte, _ string) (string, string, string, bool, error) {
		return "", "", "", false, errors.New("bad signature")
	}
	h := StripeWebhook("/api/v1/webhooks/stripe", verify, g)(next404())
	req := httptest.NewRequest(http.MethodPost, "/api/v1/webhooks/stripe", strings.NewReader("{}"))
	req.Header.Set("Stripe-Signature", "bad")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %d", rr.Code)
	}
	if g.called {
		t.Fatal("must not grant on bad signature")
	}
}

func TestWebhookGrantsOnValidEvent(t *testing.T) {
	g := &fakeGranter{}
	uid := uuid.Must(uuid.NewV4()).String()
	verify := func(_ []byte, _ string) (string, string, string, bool, error) {
		return uid, "cus_1", "pi_1", true, nil
	}
	h := StripeWebhook("/api/v1/webhooks/stripe", verify, g)(next404())
	req := httptest.NewRequest(http.MethodPost, "/api/v1/webhooks/stripe", strings.NewReader("{}"))
	req.Header.Set("Stripe-Signature", "ok")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", rr.Code)
	}
	if !g.called || g.uid != uid {
		t.Fatalf("expected grant for %s, got called=%v uid=%q", uid, g.called, g.uid)
	}
}

func TestWebhookAcksNonGrantEvent(t *testing.T) {
	g := &fakeGranter{}
	verify := func(_ []byte, _ string) (string, string, string, bool, error) {
		return "", "", "", false, nil // valid signature, not a grant event
	}
	h := StripeWebhook("/api/v1/webhooks/stripe", verify, g)(next404())
	req := httptest.NewRequest(http.MethodPost, "/api/v1/webhooks/stripe", strings.NewReader("{}"))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK || g.called {
		t.Fatalf("non-grant event must ack 200 without granting; got code=%d called=%v", rr.Code, g.called)
	}
}

func TestWebhookPassesThroughOtherRequests(t *testing.T) {
	g := &fakeGranter{}
	verify := func(_ []byte, _ string) (string, string, string, bool, error) { return "", "", "", false, nil }
	h := StripeWebhook("/api/v1/webhooks/stripe", verify, g)(next404())
	req := httptest.NewRequest(http.MethodGet, "/api/v1/entitlements", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusNotFound {
		t.Fatalf("non-webhook request must pass through to next (404), got %d", rr.Code)
	}
}
