/**
 * Documented API ↔ UI pace mapping contract (Section 15).
 *
 * Server canonical paces (server/src/modules/trips/trips.validation.ts):
 *   RELAXED, BALANCED, QUICK, VERY_RELAXED
 * Serial aliases accepted by the server (normalizePace):
 *   SLOW→RELAXED, MODERATE→BALANCED, FAST→QUICK, VERY_CHILL→VERY_RELAXED
 *
 * This helper mirrors that contract so mobile tests lock the documented
 * mapping into the three UI paces: relaxed / moderate / fast.
 */
export function normalizePaceAliases(): Record<string, 'relaxed' | 'moderate' | 'fast'> {
  const serverToUi: Record<string, 'relaxed' | 'moderate' | 'fast'> = {
    RELAXED: 'relaxed',
    VERY_RELAXED: 'relaxed',
    BALANCED: 'moderate',
    QUICK: 'fast',
    // Serial aliases normalize to canonicals above.
    SLOW: 'relaxed',
    MODERATE: 'moderate',
    FAST: 'fast',
    VERY_CHILL: 'relaxed',
  };
  return serverToUi;
}