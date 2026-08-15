/**
 * Existing itinerary budget hard-filter.
 * LOW (and EXPENSIVE_ENTRY avoid) drop paid attractions above this adult ticket cap.
 * MEDIUM / HIGH / CUSTOM (budgetTier null) do not apply this cap.
 */
export const LOW_BUDGET_ENTRY_FEE_CAP = 200;

export type BudgetFilterParams = {
  budgetTier?: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  avoid?: readonly string[];
};

export function placePassesBudgetFilter(
  entryFee: number | null,
  params: BudgetFilterParams,
): boolean {
  const avoid = params.avoid ?? [];
  const lowBudget = params.budgetTier === 'LOW' || avoid.includes('EXPENSIVE_ENTRY');
  if (lowBudget && entryFee !== null && entryFee > LOW_BUDGET_ENTRY_FEE_CAP) {
    return false;
  }
  return true;
}
