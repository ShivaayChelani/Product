-- Migration: 20260913120000_treasure_hunt_daily_lock
-- Purpose: Add per-user-per-riddle-per-IST-day lock table for Treasure Hunt.
--
-- This is ADDITIVE ONLY -- no existing tables or columns are modified.
-- The UNIQUE constraint on (user_id, riddle_id, reward_date) is the race-safe
-- arbiter for the daily lock: a concurrent duplicate submission aborts on P2002
-- and is reported as already-attempted without minting any points.
--
-- reward_date is always YYYY-MM-DD in IST, computed by the server using
-- getIndiaRewardDate(). The client never supplies this value.

CREATE TABLE "riddle_daily_attempts" (
    "id"          TEXT NOT NULL,
    "user_id"     TEXT NOT NULL,
    "riddle_id"   TEXT NOT NULL,
    "hunt_id"     TEXT NOT NULL,
    "reward_date" TEXT NOT NULL,
    "is_correct"  BOOLEAN NOT NULL DEFAULT false,
    "created_at"  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "riddle_daily_attempts_pkey" PRIMARY KEY ("id")
);

-- Unique lock: one attempt record per user per riddle per IST calendar day
CREATE UNIQUE INDEX "riddle_daily_attempts_user_riddle_date_key"
    ON "riddle_daily_attempts"("user_id", "riddle_id", "reward_date");

-- Supporting indexes
CREATE INDEX "riddle_daily_attempts_user_id_idx"   ON "riddle_daily_attempts"("user_id");
CREATE INDEX "riddle_daily_attempts_riddle_id_idx" ON "riddle_daily_attempts"("riddle_id");
CREATE INDEX "riddle_daily_attempts_hunt_id_idx"   ON "riddle_daily_attempts"("hunt_id");

-- Foreign keys
ALTER TABLE "riddle_daily_attempts"
    ADD CONSTRAINT "riddle_daily_attempts_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "riddle_daily_attempts"
    ADD CONSTRAINT "riddle_daily_attempts_riddle_id_fkey"
        FOREIGN KEY ("riddle_id") REFERENCES "riddles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "riddle_daily_attempts"
    ADD CONSTRAINT "riddle_daily_attempts_hunt_id_fkey"
        FOREIGN KEY ("hunt_id") REFERENCES "treasure_hunts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
