/**
 * Canonical Treasure Hunt reward amounts.
 *
 * The riddle reward is exactly 20 points and is decided ONLY by the backend —
 * the mobile client never supplies or chooses this value. The award path in
 * `riddles.service.ts` reads this constant, so the amount cannot drift with
 * column values or client input.
 *
 * There is NO separate hunt completion bonus. The spec is: correct riddle = 20
 * points, wrong = 0 points. Nothing more. Any historical completion bonus
 * transactions (referenceType = 'TREASURE_HUNT') remain in the ledger unchanged
 * but no new ones are ever minted.
 */
export const TREASURE_HUNT_RIDDLE_REWARD_POINTS = 20;
export const TREASURE_HUNT_COMPLETION_BONUS_POINTS = 0;
