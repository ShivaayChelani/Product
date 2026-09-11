-- Treasure Hunt: replace the legacy photo-upload / manual-review game
-- with the GPS -> current city -> text riddle -> auto-validated -> coins flow.
--
-- Notes on data:
--   - "riddle_submissions" (manual photo approval flow) and the legacy
--     "riddles" columns (title/clue/hint_image/correct_place_name/coords) are
--     removed. Legacy rows do not map to the new schema and were empty at the
--     time of this migration, so they are dropped.
--   - Environments that previously drifted via `prisma db push` already carry
--     the new treasure hunt tables; all statements below are guarded so the
--     migration is safe on both a fresh baseline and a Drift-migrated DB.

-- Remove the legacy manual-approval submission table and its status enum.
DROP TABLE IF EXISTS "riddle_submissions";
DROP TYPE IF EXISTS "RiddleSubmissionStatus";

-- Rebuild the "riddles" table for the text-based game. The legacy table
-- (signed by the correct_place_name column) is dropped first; a DB that
-- already has the new shape is left untouched.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'riddles'
          AND column_name = 'correct_place_name'
    ) THEN
        DROP TABLE IF EXISTS "riddles";
        DROP INDEX IF EXISTS "riddles_city_is_active_idx";
        DROP INDEX IF EXISTS "riddles_is_active_starts_at_ends_at_idx";
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "riddles" (
    "id" TEXT NOT NULL,
    "hunt_id" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "clue_english" TEXT NOT NULL,
    "answer_english" TEXT NOT NULL,
    "clue_hindi" TEXT NOT NULL,
    "answer_hindi" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "reward_coins" INTEGER NOT NULL DEFAULT 50,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "riddles_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "riddles_hunt_id_idx" ON "riddles"("hunt_id");
CREATE INDEX IF NOT EXISTS "riddles_city_idx" ON "riddles"("city");

CREATE TABLE IF NOT EXISTS "treasure_hunts" (
    "id" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Treasure Hunt',
    "description" TEXT,
    "reward_coins" INTEGER NOT NULL DEFAULT 150,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "treasure_hunts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "treasure_hunts_city_key" ON "treasure_hunts"("city");

CREATE TABLE IF NOT EXISTS "treasure_hunt_progress" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "hunt_id" TEXT NOT NULL,
    "current_riddle_id" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "is_completed" BOOLEAN NOT NULL DEFAULT false,
    "coins_earned" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "treasure_hunt_progress_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "treasure_hunt_progress_user_id_idx" ON "treasure_hunt_progress"("user_id");
CREATE INDEX IF NOT EXISTS "treasure_hunt_progress_hunt_id_idx" ON "treasure_hunt_progress"("hunt_id");

CREATE TABLE IF NOT EXISTS "riddle_progress" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "hunt_id" TEXT NOT NULL,
    "riddle_id" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "is_correct" BOOLEAN NOT NULL DEFAULT false,
    "coins_earned" INTEGER NOT NULL DEFAULT 0,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "riddle_progress_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "riddle_progress_user_id_idx" ON "riddle_progress"("user_id");
CREATE INDEX IF NOT EXISTS "riddle_progress_hunt_id_idx" ON "riddle_progress"("hunt_id");
CREATE INDEX IF NOT EXISTS "riddle_progress_riddle_id_idx" ON "riddle_progress"("riddle_id");

CREATE TABLE IF NOT EXISTS "treasure_hunt_import_logs" (
    "id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "uploaded_by_id" TEXT NOT NULL,
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "valid_rows" INTEGER NOT NULL DEFAULT 0,
    "failed_rows" INTEGER NOT NULL DEFAULT 0,
    "cities" TEXT[] NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "treasure_hunt_import_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "treasure_hunt_import_logs_uploaded_by_id_idx" ON "treasure_hunt_import_logs"("uploaded_by_id");
CREATE INDEX IF NOT EXISTS "treasure_hunt_import_logs_created_at_idx" ON "treasure_hunt_import_logs"("created_at");

-- Restore unique constraints on DBs that had the progress tables created by
-- `prisma db push` *before* the new unique keys were added.
-- (Prisma creates unique keys as unique indexes, visible in pg_class, not pg_constraint.)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'treasure_hunt_progress_user_id_hunt_id_key' AND relkind = 'i') THEN
        ALTER TABLE "treasure_hunt_progress" ADD CONSTRAINT "treasure_hunt_progress_user_id_hunt_id_key" UNIQUE ("user_id", "hunt_id");
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'riddle_progress_user_id_riddle_id_key' AND relkind = 'i') THEN
        ALTER TABLE "riddle_progress" ADD CONSTRAINT "riddle_progress_user_id_riddle_id_key" UNIQUE ("user_id", "riddle_id");
    END IF;
END $$;

-- Foreign keys (guarded so they are not re-added on DBs that already have them).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'riddles_hunt_id_fkey') THEN
        ALTER TABLE "riddles" ADD CONSTRAINT "riddles_hunt_id_fkey"
            FOREIGN KEY ("hunt_id") REFERENCES "treasure_hunts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treasure_hunt_progress_user_id_fkey') THEN
        ALTER TABLE "treasure_hunt_progress" ADD CONSTRAINT "treasure_hunt_progress_user_id_fkey"
            FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treasure_hunt_progress_hunt_id_fkey') THEN
        ALTER TABLE "treasure_hunt_progress" ADD CONSTRAINT "treasure_hunt_progress_hunt_id_fkey"
            FOREIGN KEY ("hunt_id") REFERENCES "treasure_hunts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'riddle_progress_user_id_fkey') THEN
        ALTER TABLE "riddle_progress" ADD CONSTRAINT "riddle_progress_user_id_fkey"
            FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'riddle_progress_hunt_id_fkey') THEN
        ALTER TABLE "riddle_progress" ADD CONSTRAINT "riddle_progress_hunt_id_fkey"
            FOREIGN KEY ("hunt_id") REFERENCES "treasure_hunts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'riddle_progress_riddle_id_fkey') THEN
        ALTER TABLE "riddle_progress" ADD CONSTRAINT "riddle_progress_riddle_id_fkey"
            FOREIGN KEY ("riddle_id") REFERENCES "riddles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treasure_hunt_import_logs_uploaded_by_id_fkey') THEN
        ALTER TABLE "treasure_hunt_import_logs" ADD CONSTRAINT "treasure_hunt_import_logs_uploaded_by_id_fkey"
            FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;