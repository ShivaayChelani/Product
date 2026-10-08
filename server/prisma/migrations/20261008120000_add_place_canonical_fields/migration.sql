-- AlterTable
-- Add canonical place metadata to support the canonical Places import/export contract.
-- Both columns are nullable; existing rows remain NULL and are not backfilled.
ALTER TABLE "places" ADD COLUMN     "canonical_name" TEXT,
ADD COLUMN     "image_metadata" JSONB;