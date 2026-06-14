package service

import (
	"fmt"

	"github.com/gofrs/uuid"

	"dollbuilder/internal/models"
	stripeclient "dollbuilder/internal/stripe"
)

// Entitlement returns the export entitlement state for userID.
func (s *Service) Entitlement(userID uuid.UUID) (bool, string, error) {
	if s.repository == nil {
		return false, "", fmt.Errorf("repository not available: %w", ErrRepositoryUnavailable)
	}
	e, err := s.repository.EntitlementByUserID(userID)
	if err != nil {
		return false, "", fmt.Errorf("entitlement lookup: %w", err)
	}
	if e == nil {
		return false, "", nil
	}
	return e.Entitled(), e.Source, nil
}

// GrantMock marks userID entitled via the mock path (test/dev only).
func (s *Service) GrantMock(userID uuid.UUID) error {
	return s.grant(userID, "mock", "", "", "")
}

// GrantFromStripe upserts an active entitlement from a verified Stripe webhook.
func (s *Service) GrantFromStripe(userID, customerID, paymentIntentID, productID string) error {
	id, err := uuid.FromString(userID)
	if err != nil {
		return fmt.Errorf("%w: client_reference_id is not a user uuid", ErrInvalidInput)
	}
	return s.grant(id, "stripe", customerID, paymentIntentID, productID)
}

func (s *Service) grant(userID uuid.UUID, source, customerID, paymentIntentID, productID string) error {
	if s.repository == nil {
		return fmt.Errorf("repository not available: %w", ErrRepositoryUnavailable)
	}
	_, err := s.repository.UpsertEntitlement(&models.Entitlement{
		UserUUID:              userID,
		Status:                "active",
		Source:                source,
		StripeCustomerID:      customerID,
		StripePaymentIntentID: paymentIntentID,
		ProductID:             productID,
	})
	if err != nil {
		return fmt.Errorf("grant entitlement: %w", err)
	}
	return nil
}

// CheckoutSession creates a Stripe Checkout session for userID and returns its URL.
func (s *Service) CheckoutSession(userID uuid.UUID, email string) (string, error) {
	if s.stripe == nil || !s.stripe.Enabled() {
		return "", stripeclient.ErrNotConfigured
	}
	return s.stripe.CreateCheckoutSession(userID.String(), email)
}
