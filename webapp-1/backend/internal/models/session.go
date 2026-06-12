package models

import (
	"time"

	"github.com/gofrs/uuid"
)

// Session is a server-side authentication session. Only the SHA-256 hash of the
// raw token is stored; the raw token lives only in the client's httpOnly cookie.
type Session struct {
	tableName struct{} `pg:"sessions,discard_unknown_columns"` //nolint:unused // go-pg table marker

	UUID      uuid.UUID `json:"uuid" pg:"uuid,pk,type:uuid"`
	UserUUID  uuid.UUID `json:"user_uuid" pg:"user_uuid,type:uuid"`
	TokenHash string    `json:"-" pg:"token_hash"`
	UserAgent string    `json:"user_agent" pg:"user_agent"`
	ExpiresAt time.Time `json:"expires_at" pg:"expires_at"`
	CreatedAt time.Time `json:"created_at" pg:"created_at"`
}
