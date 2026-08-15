-- Creator reels tagged to a business stay off the vendor map card until the vendor allows them.

CREATE TYPE "VendorListingStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "reels" ADD COLUMN "vendor_listing_status" "VendorListingStatus";

UPDATE "reels"
SET "vendor_listing_status" = 'APPROVED'
WHERE "vendor_id" IS NOT NULL;

CREATE INDEX "reels_vendor_id_vendor_listing_status_idx"
ON "reels"("vendor_id", "vendor_listing_status");
