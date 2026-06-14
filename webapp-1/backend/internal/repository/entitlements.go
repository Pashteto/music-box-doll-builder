package repository

import (
	"time"

	"github.com/gofrs/uuid"

	"dollbuilder/internal/models"
)

// EntitlementByUserID returns the entitlement for userID, or (nil, nil) if none.
func (r *PostgresRepository) EntitlementByUserID(userID uuid.UUID) (*models.Entitlement, error) {
	e := &models.Entitlement{}
	err := r.db.Model(e).Where("user_uuid = ?", userID).Limit(1).Select()
	if err != nil {
		if err.Error() == "pg: no rows in result set" {
			return nil, nil
		}
		return nil, err
	}
	return e, nil
}

// UpsertEntitlement inserts or updates the entitlement by user_uuid, returning the stored row.
func (r *PostgresRepository) UpsertEntitlement(e *models.Entitlement) (*models.Entitlement, error) {
	now := time.Now().UTC()
	e.UpdatedAt = now
	if e.UUID == uuid.Nil {
		id, err := uuid.NewV4()
		if err != nil {
			return nil, err
		}
		e.UUID = id
		e.CreatedAt = now
	}
	_, err := r.db.Model(e).
		OnConflict("(user_uuid) DO UPDATE").
		Set("status = EXCLUDED.status").
		Set("source = EXCLUDED.source").
		Set("stripe_customer_id = EXCLUDED.stripe_customer_id").
		Set("stripe_payment_intent_id = EXCLUDED.stripe_payment_intent_id").
		Set("product_id = EXCLUDED.product_id").
		Set("updated_at = EXCLUDED.updated_at").
		Insert()
	if err != nil {
		return nil, err
	}
	return r.EntitlementByUserID(e.UserUUID)
}
