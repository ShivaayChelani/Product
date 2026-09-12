/**
 * Canonical Treasure Hunt reward amounts.
 *
 * The riddle reward is exactly 10 points and is decided ONLY by the backend —
 * the mobile client never supplies or chooses this value. The award path in
 * `riddles.service.ts` reads this constant, so the amount cannot drift with
 * column values or client input.
 *
 * The hunt completion bonus (150 points, stored on TreasureHunt.rewardCoins)
 * is a SEPARATE business rule and is preserved unchanged; it is awarded once
 * per hunt, never per answer.
 */
export const TREASURE_HUNT_RIDDLE_REWARD_POINTS = 10;