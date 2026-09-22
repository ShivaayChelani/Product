-- Create legal_acceptances table to track user acceptance of Terms and Privacy Policy.
-- Safe: additive only. No existing tables or data are modified.
-- Grandfathered users (created before this migration) will simply have no record —
-- the absence of a record never blocks login or existing sessions.

CREATE TABLE "legal_acceptances" (
    "id"              TEXT NOT NULL,
    "user_id"         TEXT NOT NULL,
    "terms_version"   INTEGER NOT NULL,
    "privacy_version" INTEGER NOT NULL,
    "accepted_at"     TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "platform"        TEXT,

    CONSTRAINT "legal_acceptances_pkey" PRIMARY KEY ("id")
);

-- One acceptance record per user (upsert pattern on re-acceptance)
CREATE UNIQUE INDEX "legal_acceptances_user_id_key" ON "legal_acceptances"("user_id");

-- Index for fast lookup by userId
CREATE INDEX "legal_acceptances_user_id_idx" ON "legal_acceptances"("user_id");

-- Cascade-delete acceptance record when user is deleted
ALTER TABLE "legal_acceptances"
    ADD CONSTRAINT "legal_acceptances_user_id_fkey"
    FOREIGN KEY ("user_id")
    REFERENCES "users"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
