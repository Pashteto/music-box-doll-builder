package models

import (
	"time"

	"github.com/gofrs/uuid"
)

// Project is a per-user doll project synced from the client. The UUID is the
// client-generated project id (so the same project keeps one identity across
// devices). Only the project definition JSON (Data) and a small Thumbnail are
// stored server-side — never the rendered video.
//
//nolint:govet // field alignment kept for readability and conventional ordering
type Project struct {
	tableName struct{} `pg:"projects,discard_unknown_columns"` //nolint:unused // go-pg table marker

	UUID     uuid.UUID `pg:"uuid,pk,type:uuid"`
	UserUUID uuid.UUID `pg:"user_uuid,type:uuid,notnull"`
	Name     string    `pg:"name,notnull"`
	// Data is required (the API layer enforces non-nil); the DB column is jsonb NOT NULL DEFAULT '{}'.
	Data      map[string]interface{} `pg:"data,type:jsonb"`
	Thumbnail string                 `pg:"thumbnail"`
	UpdatedAt time.Time              `pg:"updated_at,notnull"`
	CreatedAt time.Time              `pg:"created_at,notnull,default:now()"`
}

// Validate checks required fields. UUID/UserUUID/timestamps are managed by the
// repository and service layers.
func (p *Project) Validate() error {
	if p.Name == "" {
		return newValidationError("name", "is required")
	}
	return nil
}
