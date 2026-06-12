-- per-user doll projects synced from the client (local-first; server stores JSON + thumbnail)
CREATE TABLE IF NOT EXISTS projects
(
    uuid       uuid NOT NULL CONSTRAINT project_uuid_pkey PRIMARY KEY,
    user_uuid  uuid NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
    name       text NOT NULL,
    data       jsonb NOT NULL DEFAULT '{}'::jsonb,
    thumbnail  text,
    updated_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS project_user_uuid_idx ON projects USING btree(user_uuid);
