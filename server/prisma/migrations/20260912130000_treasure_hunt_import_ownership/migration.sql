-- Import-scoped Treasure Hunt deletion support.
--
-- Ownership: each Riddle now records which TreasureHuntImportLog created it
-- (riddles.import_log_id). Future imports populate this via the backend at
-- createMany time, so an import can safely be deleted/archived WITHOUT
-- filename or timestamp guessing.
--
-- Audit: treasure_hunt_import_logs gains deleted_at / deleted_by_id so the
-- import history row is preserved and marked as DELETED instead of erased.
--
-- Backfill note: historical imports (before this column existed) stay
-- untouched. Their riddles have import_log_id = NULL and are therefore NOT
-- deletable via the new import-scoped action — this is intentional, since
-- attributing them to a specific import after the fact would be unreliable.
-- Existing content is unaffected by this migration.

ALTER TABLE "riddles" ADD COLUMN IF NOT EXISTS "import_log_id" TEXT;

ALTER TABLE "treasure_hunt_import_logs" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);
ALTER TABLE "treasure_hunt_import_logs" ADD COLUMN IF NOT EXISTS "deleted_by_id" TEXT;

CREATE INDEX IF NOT EXISTS "riddles_import_log_id_idx" ON "riddles"("import_log_id");

-- Foreign keys (guarded so they are never re-added twice on any environment).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'riddles_import_log_id_fkey') THEN
        ALTER TABLE "riddles" ADD CONSTRAINT "riddles_import_log_id_fkey"
            FOREIGN KEY ("import_log_id") REFERENCES "treasure_hunt_import_logs"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treasure_hunt_import_logs_deleted_by_id_fkey') THEN
        ALTER TABLE "treasure_hunt_import_logs" ADD CONSTRAINT "treasure_hunt_import_logs_deleted_by_id_fkey"
            FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;