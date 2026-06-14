// Package stripe wraps the Stripe SDK behind a small, config-driven surface so the
// rest of the service has no hard dependency on Stripe being configured. An empty
// secret key yields a disabled client whose operations return ErrNotConfigured.
package stripe

import (
	"encoding/json"
	"errors"

	stripe "github.com/stripe/stripe-go/v81"
	"github.com/stripe/stripe-go/v81/checkout/session"
	"github.com/stripe/stripe-go/v81/webhook"
)

// ErrNotConfigured is returned by operations when no secret key is set.
var ErrNotConfigured = errors.New("stripe not configured")

// Config carries the deployment Stripe settings (all from env).
type Config struct {
	SecretKey     string
	WebhookSecret string
	PriceID       string
	SuccessURL    string
	CancelURL     string
}

// Client is a thin Stripe facade.
type Client struct{ cfg Config }

// New builds a Client. A zero/empty SecretKey yields a disabled client.
func New(cfg Config) *Client { return &Client{cfg: cfg} }

// Enabled reports whether Stripe is configured (a secret key is present).
func (c *Client) Enabled() bool { return c != nil && c.cfg.SecretKey != "" }

// CreateCheckoutSession creates a one-time-payment Checkout Session and returns its URL.
// userID is set as client_reference_id so the webhook can map the payment back to the user.
func (c *Client) CreateCheckoutSession(userID, email string) (string, error) {
	if !c.Enabled() {
		return "", ErrNotConfigured
	}
	stripe.Key = c.cfg.SecretKey
	params := &stripe.CheckoutSessionParams{
		Mode:              stripe.String(string(stripe.CheckoutSessionModePayment)),
		ClientReferenceID: stripe.String(userID),
		SuccessURL:        stripe.String(c.cfg.SuccessURL),
		CancelURL:         stripe.String(c.cfg.CancelURL),
		LineItems: []*stripe.CheckoutSessionLineItemParams{
			{Price: stripe.String(c.cfg.PriceID), Quantity: stripe.Int64(1)},
		},
	}
	if email != "" {
		params.CustomerEmail = stripe.String(email)
	}
	s, err := session.New(params)
	if err != nil {
		return "", err
	}
	return s.URL, nil
}

// CompletedSession is the minimal data extracted from a verified webhook.
type CompletedSession struct {
	UserID          string
	CustomerID      string
	PaymentIntentID string
}

// VerifyAndParse validates the webhook signature and, for checkout.session.completed,
// returns the completed session data. (nil, false, nil) means "valid but not a grant event".
func (c *Client) VerifyAndParse(payload []byte, sigHeader string) (*CompletedSession, bool, error) {
	if c.cfg.WebhookSecret == "" {
		return nil, false, ErrNotConfigured
	}
	event, err := webhook.ConstructEvent(payload, sigHeader, c.cfg.WebhookSecret)
	if err != nil {
		return nil, false, err
	}
	if event.Type != "checkout.session.completed" {
		return nil, false, nil
	}
	var s stripe.CheckoutSession
	if err := json.Unmarshal(event.Data.Raw, &s); err != nil {
		return nil, false, err
	}
	out := &CompletedSession{UserID: s.ClientReferenceID}
	if s.Customer != nil {
		out.CustomerID = s.Customer.ID
	}
	if s.PaymentIntent != nil {
		out.PaymentIntentID = s.PaymentIntent.ID
	}
	return out, true, nil
}
