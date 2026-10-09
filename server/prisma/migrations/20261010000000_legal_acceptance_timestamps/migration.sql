-- Additive only: split server-authored Terms / Privacy acceptance timestamps.
-- Existing rows keep a single accepted_at value copied onto both new columns.

ALTER TABLE "legal_acceptances"
    ADD COLUMN "terms_accepted_at" TIMESTAMPTZ(6),
    ADD COLUMN "privacy_accepted_at" TIMESTAMPTZ(6);

UPDATE "legal_acceptances"
SET
    "terms_accepted_at" = COALESCE("terms_accepted_at", "accepted_at"),
    "privacy_accepted_at" = COALESCE("privacy_accepted_at", "accepted_at");

ALTER TABLE "legal_acceptances"
    ALTER COLUMN "terms_accepted_at" SET NOT NULL,
    ALTER COLUMN "terms_accepted_at" SET DEFAULT CURRENT_TIMESTAMP,
    ALTER COLUMN "privacy_accepted_at" SET NOT NULL,
    ALTER COLUMN "privacy_accepted_at" SET DEFAULT CURRENT_TIMESTAMP;
