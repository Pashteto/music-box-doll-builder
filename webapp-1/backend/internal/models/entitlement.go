package models

import (
	"time"

	"github.com/gofrs/uuid"
)

// Entitlement is a per-user export entitlement. Phase 1 is a one-time purchase:
// status "active" => the user may export without limit. One row per user
// (unique user_uuid), upserted idempotently from the mock path or a Stripe webhook.
//
//nolint:govet // field alignment kept for readability and conventional ordering
type Entitlement struct {
	tableName struct{} `pg:"entitlements,discard_unknown_columns"` //nolint:unused // go-pg table marker

	UUID                  uuid.UUID `pg:"uuid,pk,type:uuid"`
	UserUUID              uuid.UUID `pg:"user_uuid,type:uuid,notnull"`
	Status                string    `pg:"status,notnull"`
	Source                string    `pg:"source,notnull"`
	StripeCustomerID      string    `pg:"stripe_customer_id"`
	StripePaymentIntentID string    `pg:"stripe_payment_intent_id"`
	ProductID             string    `pg:"product_id"`
	UpdatedAt             time.Time `pg:"updated_at,notnull"`
	CreatedAt             time.Time `pg:"created_at,notnull,default:now()"`
}

// Entitled reports whether the user may export without limit.
func (e *Entitlement) Entitled() bool { return e != nil && e.Status == "active" }
