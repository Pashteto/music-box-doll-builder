-- email+password auth: store the argon2id hash on the existing users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text NOT NULL DEFAULT '';

-- server-side sessions (opaque token; only its hash is stored)
CREATE TABLE IF NOT EXISTS sessions
(
    uuid       uuid NOT NULL CONSTRAINT session_uuid_pkey PRIMARY KEY,
    user_uuid  uuid NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
    token_hash text NOT NULL,
    user_agent text,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS session_token_hash_idx ON sessions USING btree(token_hash);
CREATE INDEX IF NOT EXISTS session_user_uuid_idx ON sessions USING btree(user_uuid);
