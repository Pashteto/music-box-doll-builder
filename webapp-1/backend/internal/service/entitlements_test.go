package service

import (
	"testing"

	"github.com/gofrs/uuid"
)

func TestGrantMockThenEntitlement(t *testing.T) {
	repo := &serviceMockRepository{}
	svc := NewService(repo)
	uid := uuid.Must(uuid.NewV4())

	entitled, _, err := svc.Entitlement(uid)
	if err != nil || entitled {
		t.Fatalf("fresh user must not be entitled; got entitled=%v err=%v", entitled, err)
	}
	if err := svc.GrantMock(uid); err != nil {
		t.Fatalf("GrantMock: %v", err)
	}
	entitled, source, err := svc.Entitlement(uid)
	if err != nil || !entitled || source != "mock" {
		t.Fatalf("after grant want entitled+mock; got entitled=%v source=%q err=%v", entitled, source, err)
	}
}

func TestGrantFromStripeIsActiveAndIdempotent(t *testing.T) {
	repo := &serviceMockRepository{}
	svc := NewService(repo)
	uid := uuid.Must(uuid.NewV4())

	if err := svc.GrantFromStripe(uid.String(), "cus_1", "pi_1", "price_1"); err != nil {
		t.Fatalf("GrantFromStripe: %v", err)
	}
	// Replaying the same event must not create a second row.
	if err := svc.GrantFromStripe(uid.String(), "cus_1", "pi_1", "price_1"); err != nil {
		t.Fatalf("GrantFromStripe replay: %v", err)
	}
	if got := len(repo.entitlements); got != 1 {
		t.Fatalf("expected 1 entitlement row after replay, got %d", got)
	}
	entitled, source, _ := svc.Entitlement(uid)
	if !entitled || source != "stripe" {
		t.Fatalf("want entitled+stripe; got %v %q", entitled, source)
	}
}

func TestGrantFromStripeRejectsBadUserID(t *testing.T) {
	svc := NewService(&serviceMockRepository{})
	if err := svc.GrantFromStripe("not-a-uuid", "", "", ""); err == nil {
		t.Fatal("expected error for non-uuid client_reference_id")
	}
}

func TestCheckoutSessionNotConfigured(t *testing.T) {
	svc := NewService(&serviceMockRepository{})
	if _, err := svc.CheckoutSession(uuid.Must(uuid.NewV4()), "a@b.c"); err == nil {
		t.Fatal("expected ErrNotConfigured when stripe is not attached")
	}
}
