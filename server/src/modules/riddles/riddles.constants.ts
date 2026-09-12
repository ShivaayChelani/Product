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

/**
 * Canonical TreasureHuntImportLog lifecycle statuses.
 *
 * Import records are NEVER physically deleted: a deletion marks the log as
 * `DELETED` (with `deletedAt` / `deletedById`) so the audit trail and the
 * full Import History stay intact.
 */
export const IMPORT_LOG_STATUS = {
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  UPLOADED: 'UPLOADED',
  DELETED: 'DELETED',
} as const;

/**
 * The canonical server-side filter for the Overview "Recent Imports" list.
 *
 * Recent Imports must NEVER include DELETED logs — admins manage imports, so a
 * deleted file (e.g. a reverted Madhya Pradesh upload) must drop out of the
 * Overview list. DELETED rows remain permanently available in the full
 * Import History, which intentionally has NO status filter.
 *
 * This filters on the server (the source of truth), not merely in the client UI.
 */
export const RECENT_IMPORTS_STATUS_WHERE = { not: IMPORT_LOG_STATUS.DELETED } as const;

/**
 * Canonical definition of the "Total Imports" metric (single source of truth).
 *
 * `totalImports` = the count of ALL TreasureHuntImportLog records in the
 * system, including DELETED ones — an all-time, audit-preserving tally. It
 * intentionally matches "Import History > View all", which also includes
 * DELETED rows. Only the Overview "Recent Imports" list (the last 5 non-deleted
 * imports) is filtered. The frontend must read this value from the API and must
 * never compute its own import count.
 */
export const TOTAL_IMPORTS_METRIC_DEFINITION =
  'All-time count of import records, including DELETED ones (matches Import History).';
