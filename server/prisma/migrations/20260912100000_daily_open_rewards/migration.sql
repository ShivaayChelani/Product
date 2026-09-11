-- Daily app-open reward: one credit per (user, India calendar day, reward type).
-- The unique index is the race-safe guard that prevents double-crediting when
-- concurrent app-open/foreground claims land at the same time.

CREATE TABLE IF NOT EXISTS "daily_open_rewards" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "reward_date" TEXT NOT NULL,
    "reward_type" TEXT NOT NULL DEFAULT 'DAILY_OPEN',
    "points" INTEGER NOT NULL DEFAULT 5,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_open_rewards_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "daily_open_rewards_user_id_reward_date_reward_type_key"
    ON "daily_open_rewards"("user_id", "reward_date", "reward_type");
CREATE INDEX IF NOT EXISTS "daily_open_rewards_user_id_reward_date_idx"
    ON "daily_open_rewards"("user_id", "reward_date");