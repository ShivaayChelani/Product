-- Let self-serve vendor reels reach the global Reels feed.
--
-- Context: `vendor_reels` and `reels` were disjoint tables. Vendor uploads went
-- to `vendor_reels`, while `social.service.listReels` only ever queried
-- `prisma.reel`, so a vendor's Reel was structurally incapable of appearing in
-- the normal feed even though it rendered on the business profile.
--
-- This migration adds NO duplicate Reel rows. It only adds the per-viewer like
-- bookkeeping and the share counter that the unioned feed needs, so "Like" and
-- "Share" on a vendor Reel behave exactly like a creator Reel instead of
-- 404-ing or silently doing nothing.
--
-- `reel_likes` is deliberately left untouched: its `reel_id` is a required FK
-- onto `reels`, and loosening it would weaken creator-reel constraints. Vendor
-- reels get their own table instead.

-- Share counter, mirroring `reels.shares`. Existing rows default to 0.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'vendor_reels' AND column_name = 'shares'
    ) THEN
        ALTER TABLE "vendor_reels"
            ADD COLUMN "shares" INTEGER NOT NULL DEFAULT 0;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "vendor_reel_likes" (
    "id" TEXT NOT NULL,
    "vendor_reel_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_reel_likes_pkey" PRIMARY KEY ("id")
);

-- The unique index is the de-duplication authority, exactly as in reel_views:
-- `vendor_reels.likes` is incremented only when a row is newly inserted.
CREATE UNIQUE INDEX IF NOT EXISTS "vendor_reel_likes_vendor_reel_id_user_id_key"
    ON "vendor_reel_likes" USING BTREE ("vendor_reel_id", "user_id");

CREATE INDEX IF NOT EXISTS "vendor_reel_likes_vendor_reel_id_idx"
    ON "vendor_reel_likes" USING BTREE ("vendor_reel_id");

CREATE INDEX IF NOT EXISTS "vendor_reel_likes_user_id_idx"
    ON "vendor_reel_likes" USING BTREE ("user_id");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'vendor_reel_likes_vendor_reel_id_fkey'
    ) THEN
        ALTER TABLE "vendor_reel_likes"
            ADD CONSTRAINT "vendor_reel_likes_vendor_reel_id_fkey"
            FOREIGN KEY ("vendor_reel_id") REFERENCES "vendor_reels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'vendor_reel_likes_user_id_fkey'
    ) THEN
        ALTER TABLE "vendor_reel_likes"
            ADD CONSTRAINT "vendor_reel_likes_user_id_fkey"
            FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;