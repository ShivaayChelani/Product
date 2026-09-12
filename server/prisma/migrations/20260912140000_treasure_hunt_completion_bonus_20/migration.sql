-- Treasure Hunt completion bonus: 150 -> 20 points (canonical reward).
-- The completion bonus is now decided server-side (20) and is no longer read
-- from this column; this migration simply keeps the config column in step so
-- new hunts default to 20 and existing hunt configs record the new amount.
--
-- This touches CONFIG ONLY (treasure_hunts.reward_coins). Historical wallet
-- transactions and user progress rows (coinsEarned) are intentionally left
-- untouched — previously-earned rewards are not adjusted.

ALTER TABLE "treasure_hunts" ALTER COLUMN "reward_coins" SET DEFAULT 20;

UPDATE "treasure_hunts"
SET "reward_coins" = 20
WHERE "reward_coins" = 150;