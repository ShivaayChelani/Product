-- Remove banner ad configuration from AdConfiguration
-- Banner ads are being fully removed from PalSafar (admin, API, mobile).
-- These columns are banner-only, never returned to mobile clients (getClientConfig
-- omits them) and never persisted via the admin API (updateAdConfigSchema strips them),
-- so no functional feature depends on them. The follow-up data values are historical-only.

ALTER TABLE "ad_configurations" DROP COLUMN "banner_enabled";
ALTER TABLE "ad_configurations" DROP COLUMN "banner_ad_unit_id_android";
ALTER TABLE "ad_configurations" DROP COLUMN "banner_ad_unit_id_ios";

-- Down (restore, for reference only — do not run in production automatically):
-- ALTER TABLE "ad_configurations"
--   ADD COLUMN "banner_enabled" BOOLEAN NOT NULL DEFAULT true,
--   ADD COLUMN "banner_ad_unit_id_android" TEXT,
--   ADD COLUMN "banner_ad_unit_id_ios" TEXT;