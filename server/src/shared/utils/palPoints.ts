/**
 * Canonical PalSafar points ⇄ rupees conversion.
 *
 * Single, authoritative rule for every points↔rupee calculation:
 *   10 Pal Points = ₹1
 *
 * All other rates (e.g. the legacy hardcoded `points * 0.5` in the
 * redemptions pay-flow) are INCONSISTENT and must not be used.
 */
export const POINTS_PER_RUPEE = 10;

/** Convert Pal Points to whole rupees (floor — partial rupees never round up). */
export function pointsToRupees(points: number): number {
  return Math.floor(points / POINTS_PER_RUPEE);
}

/** Convert rupees to Pal Points (floor to whole points). */
export function rupeesToPoints(rupees: number): number {
  return Math.floor(rupees * POINTS_PER_RUPEE);
}