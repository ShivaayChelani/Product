/**
 * Existing itinerary budget hard-filter.
 * LOW (and EXPENSIVE_ENTRY avoid) drop paid attractions above this adult ticket cap.
 * MEDIUM / HIGH / CUSTOM (budgetTier null) do not apply this cap.
 */
export const LOW_BUDGET_ENTRY_FEE_CAP = 200;

export type BudgetFilterParams = {
  budgetTier?: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  customBudgetAmount?: number | null;
  avoid?: readonly string[];
  days?: number;
  travelers?: string | null;
};

export function placePassesBudgetFilter(
  entryFee: number | null,
  params: BudgetFilterParams,
): boolean {
  const avoid = params.avoid ?? [];
  const lowBudgetTier = params.budgetTier === 'LOW' || avoid.includes('EXPENSIVE_ENTRY');
  
  // Try to deduce if the custom budget amount implies a LOW budget
  let lowCustomBudget = false;
  if (params.customBudgetAmount != null && params.customBudgetAmount > 0) {
    const days = Math.max(1, params.days || 3);
    const travelerStr = String(params.travelers || '').toUpperCase();
    let travelers = 1;
    if (travelerStr === 'COUPLE') travelers = 2;
    else if (travelerStr === 'FAMILY' || travelerStr === 'FRIENDS') travelers = 3;
    
    const perPersonPerDay = params.customBudgetAmount / (days * travelers);
    if (perPersonPerDay < 1000) {
      lowCustomBudget = true;
    }
  }

  const lowBudget = lowBudgetTier || lowCustomBudget;
  
  if (lowBudget && entryFee !== null && entryFee > LOW_BUDGET_ENTRY_FEE_CAP) {
    return false;
  }
  return true;
}
