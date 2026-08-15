import {
  budgetSliderPosition,
  budgetTierFromSliderPosition,
  buildAiBudgetPayload,
  estimateBudgetRange,
} from '../features/aiTripPlanner/constants';
import fs from 'fs';
import path from 'path';

jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(async () => undefined),
  getItem: jest.fn(async () => null),
}));

import { useAiPlannerStore } from '../features/aiTripPlanner/store';

const root = path.join(__dirname, '..');

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

describe('budget range control', () => {
  it('maps slider min/max and mid positions to existing budget tiers', () => {
    expect(budgetTierFromSliderPosition(0)).toBe('LOW');
    expect(budgetTierFromSliderPosition(0.12)).toBe('LOW');
    expect(budgetTierFromSliderPosition(0.42)).toBe('MEDIUM');
    expect(budgetTierFromSliderPosition(0.68)).toBe('HIGH');
    expect(budgetTierFromSliderPosition(0.88)).toBe('CUSTOM');
    expect(budgetTierFromSliderPosition(1)).toBe('CUSTOM');
  });

  it('changing the range selects a different tier than the previous one', () => {
    const first = budgetTierFromSliderPosition(0.12);
    const next = budgetTierFromSliderPosition(0.88);
    expect(first).toBe('LOW');
    expect(next).toBe('CUSTOM');
    expect(next).not.toBe(first);
    expect(budgetSliderPosition(next)).not.toBe(budgetSliderPosition(first));
  });

  it('confirm payload: LOW has no custom amount; CUSTOM includes catalog luxury amount', () => {
    expect(buildAiBudgetPayload('LOW')).toEqual({ budget: 'LOW' });
    expect(buildAiBudgetPayload('HIGH')).toEqual({ budget: 'HIGH' });
    const luxury = buildAiBudgetPayload('CUSTOM');
    expect(luxury.budget).toBe('CUSTOM');
    expect(luxury.customBudgetAmount).toBe(85000);
  });

  it('does not retain the previous payload after a new selection', () => {
    const previous = buildAiBudgetPayload('LOW');
    const confirmed = buildAiBudgetPayload('HIGH');
    expect(confirmed).toEqual({ budget: 'HIGH' });
    expect(confirmed).not.toEqual(previous);
  });

  it('clamps invalid slider positions instead of inventing a range', () => {
    expect(budgetTierFromSliderPosition(Number.NaN)).toBe('MEDIUM');
    expect(budgetTierFromSliderPosition(-4)).toBe('LOW');
    expect(budgetTierFromSliderPosition(2)).toBe('CUSTOM');
  });

  it('estimated displayed range follows the selected tier', () => {
    const low = estimateBudgetRange('LOW', 4);
    const high = estimateBudgetRange('HIGH', 4);
    expect(low.min).toBeLessThan(high.min);
    expect(low.max).toBeLessThan(high.max);
  });

  it('store setBudget updates selectedBudget for reopen', () => {
    const prev = useAiPlannerStore.getState().selectedBudget;
    useAiPlannerStore.getState().setBudget('LOW');
    expect(useAiPlannerStore.getState().selectedBudget).toBe('LOW');
    useAiPlannerStore.getState().setBudget('HIGH');
    expect(useAiPlannerStore.getState().selectedBudget).toBe('HIGH');
    useAiPlannerStore.getState().setBudget(prev);
  });
});

describe('budget range wiring', () => {
  it('AI planner slider is interactive and sends buildAiBudgetPayload, not a hardcoded amount', () => {
    const screen = read('screens/AITripPlannerScreen.tsx');
    expect(screen).toMatch(/BudgetRangeSlider/);
    expect(screen).toMatch(/budgetTierFromSliderPosition/);
    expect(screen).toMatch(/buildAiBudgetPayload\(selectedBudget\)/);
    expect(screen).not.toMatch(/85000/);
    expect(screen).toMatch(/onSelectPosition/);
    expect(screen).toMatch(/persistDraft/);
  });

  it('BudgetRangeSlider uses PanResponder so the track is not visual-only', () => {
    const src = read('features/aiTripPlanner/BudgetRangeSlider.tsx');
    expect(src).toMatch(/PanResponder\.create/);
    expect(src).toMatch(/onPanResponderGrant/);
    expect(src).toMatch(/onPanResponderMove/);
    expect(src).toMatch(/onSelectPosition/);
  });
});
