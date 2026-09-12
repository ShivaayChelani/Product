-- Canonical Treasure Hunt riddle reward = 10 points (previously 50).
-- The riddle reward is decided server-side and set to exactly 10.
-- Existing riddles are backfilled so every riddle reward is 10 going forward.
-- The 150-point hunt completion bonus (treasure_hunts.reward_coins) is a
-- separate business rule and is intentionally left unchanged.

ALTER TABLE "riddles" ALTER COLUMN "reward_coins" SET DEFAULT 10;

UPDATE "riddles"
SET "reward_coins" = 10
WHERE "reward_coins" IS DISTINCT FROM 10;