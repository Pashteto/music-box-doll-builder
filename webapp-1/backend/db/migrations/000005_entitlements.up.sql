-- per-user export entitlement (Phase 1: one-time purchase => unlimited exports)
CREATE TABLE IF NOT EXISTS entitlements
(
    uuid                     uuid NOT NULL CONSTRAINT entitlement_uuid_pkey PRIMARY KEY,
    user_uuid                uuid NOT NULL UNIQUE REFERENCES users(uuid) ON DELETE CASCADE,
    status                   text NOT NULL DEFAULT 'none',
    source                   text NOT NULL DEFAULT '',
    stripe_customer_id       text,
    stripe_payment_intent_id text,
    product_id               text,
    updated_at               timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at               timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);
