/**
 * CUSTOM budget amount recovery for regeneration.
 *
 * Initial AI build still requires a numeric customBudgetAmount. Regeneration
 * with tripId may omit the field; we then reuse the persisted trip amount
 * (column, then aiPreferences) instead of inventing a number or weakening
 * the public contract for new plans.
 */

export function parseNonNegativeAmount(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return undefined;
}

export function recoverCustomBudgetAmount(args: {
  budget?: string | null;
  requestAmount?: unknown;
  persistedAmount?: unknown;
  aiPreferences?: unknown;
}): number | undefined {
  const requested = parseNonNegativeAmount(args.requestAmount);
  if (requested != null) return requested;
  if (String(args.budget || '').toUpperCase() !== 'CUSTOM') return undefined;
  const persisted = parseNonNegativeAmount(args.persistedAmount);
  if (persisted != null) return persisted;
  const prefs = args.aiPreferences;
  if (prefs && typeof prefs === 'object' && prefs !== null) {
    return parseNonNegativeAmount((prefs as Record<string, unknown>).customBudgetAmount);
  }
  return undefined;
}
