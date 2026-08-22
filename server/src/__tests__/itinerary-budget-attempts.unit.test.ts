import { describe, expect, it } from 'vitest';
import {
  compactBonusAllowedForPace,
  resolveTravelerCount,
  routeDetourIndex,
  selectBestAttempt,
} from '../modules/trips/itineraryEngine';

describe('resolveTravelerCount (per-person fee math)', () => {
  it('mirrors the mobile app mapping', () => {
    expect(resolveTravelerCount('SOLO')).toBe(1);
    expect(resolveTravelerCount('COUPLE')).toBe(2);
    expect(resolveTravelerCount('FAMILY')).toBe(3);
    expect(resolveTravelerCount('FRIENDS')).toBe(3);
    expect(resolveTravelerCount(undefined)).toBe(1);
    expect(resolveTravelerCount('weird')).toBe(1);
  });
});

describe('compactBonusAllowedForPace (relaxed pace density)', () => {
  it('allows the compact bonus only for fast paces', () => {
    expect(compactBonusAllowedForPace('QUICK')).toBe(true);
    expect(compactBonusAllowedForPace('BALANCED')).toBe(true);
    expect(compactBonusAllowedForPace('RELAXED')).toBe(false);
    expect(compactBonusAllowedForPace('VERY_RELAXED')).toBe(false);
  });
});

describe('routeDetourIndex (regeneration quality guard)', () => {
  const pt = (lat: number, lng: number) => ({ latitude: lat, longitude: lng });

  it('straight-line sequences score ~1', () => {
    // Jaipur linear corridor
    expect(routeDetourIndex([pt(26.90, 75.80), pt(26.91, 75.81), pt(26.92, 75.82)])).toBeLessThanOrEqual(1.05);
  });

  it('zigzag sequences score high', () => {
    const zigzag = [pt(26.90, 75.80), pt(26.98, 75.98), pt(26.90, 75.96), pt(26.98, 75.80)];
    expect(routeDetourIndex(zigzag)).toBeGreaterThan(1.8);
  });

  it('single-complex days are compact by definition', () => {
    expect(routeDetourIndex([pt(23.1311, 79.8011), pt(23.1312, 79.8012)])).toBe(1);
  });
});

describe('selectBestAttempt (budget + route quality policy)', () => {
  const mk = (over: number, detour: number) => ({
    result: { dayInfo: [], stops: [], estimatedBudget: 1000 + over, totalDistanceKm: 10, note: '', warnings: [] },
    maxDetour: detour,
    overBudgetBy: over,
  });

  it('prefers within-budget attempts over degraded-but-cheap ones', () => {
    const best = selectBestAttempt([mk(500, 1.05), mk(0, 1.4)], 2000)!;
    expect(best.overBudgetBy).toBe(0);
    expect(best.maxDetour).toBe(1.4);
  });

  it('when all over budget, picks the least overrun', () => {
    const best = selectBestAttempt([mk(400, 1.05), mk(120, 2.5)], 2000)!;
    expect(best.overBudgetBy).toBe(120);
  });

  it('when budget is not binding, picks the best route quality', () => {
    const best = selectBestAttempt([mk(0, 2.9), mk(0, 1.12)], null)!;
    expect(best.maxDetour).toBe(1.12);
  });

  it('returns null for an empty attempt list', () => {
    expect(selectBestAttempt([], 1000)).toBeNull();
  });
});
