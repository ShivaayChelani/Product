-- Owner archive state for self-serve vendor reels.
--
-- Additive and nullable: existing rows get NULL, which means "live". A timestamp
-- only marks the reel as archived by its vendor, removing it from the public
-- feed / map listing / profile while keeping it in the owner's Archived tab.
-- No enum or backfill is required, so no existing vendor reel changes state.

ALTER TABLE "vendor_reels"
    ADD COLUMN "archived_at" TIMESTAMP(3);

CREATE INDEX "vendor_reels_archived_at_idx" ON "vendor_reels"("archived_at");
