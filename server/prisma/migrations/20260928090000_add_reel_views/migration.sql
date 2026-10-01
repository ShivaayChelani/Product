-- Unique Reel view tracking.
--
-- One row per (reel, authenticated viewer). The unique index is the authority
-- for de-duplication: `reels.views` is incremented only when this row is newly
-- inserted, so concurrent duplicate requests can never double-count.
CREATE TABLE IF NOT EXISTS "reel_views" (
    "id" TEXT NOT NULL,
    "reel_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reel_views_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "reel_views_reel_id_user_id_key"
    ON "reel_views" USING BTREE ("reel_id", "user_id");

CREATE INDEX IF NOT EXISTS "reel_views_reel_id_idx" ON "reel_views" USING BTREE ("reel_id");
CREATE INDEX IF NOT EXISTS "reel_views_user_id_idx" ON "reel_views" USING BTREE ("user_id");
CREATE INDEX IF NOT EXISTS "reel_views_user_id_created_at_idx" ON "reel_views" USING BTREE ("user_id", "created_at");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'reel_views_reel_id_fkey'
    ) THEN
        ALTER TABLE "reel_views"
            ADD CONSTRAINT "reel_views_reel_id_fkey"
            FOREIGN KEY ("reel_id") REFERENCES "reels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'reel_views_user_id_fkey'
    ) THEN
        ALTER TABLE "reel_views"
            ADD CONSTRAINT "reel_views_user_id_fkey"
            FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
