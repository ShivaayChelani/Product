import { describe, expect, it } from 'vitest';
import { DEFAULT_POINT_RULES } from '../modules/point-rules/pointRules.validation';

describe('PalPoints default point rules', () => {
  const byKey = (key: string) => DEFAULT_POINT_RULES.find((r) => r.key === key);

  it('keeps photo reward aligned with Wallet UI (+5)', () => {
    expect(byKey('place_image_approved')?.points).toBe(5);
  });

  it('keeps itinerary, ad, daily, and review product amounts', () => {
    expect(byKey('itinerary_checkpoint')?.points).toBe(10);
    expect(byKey('itinerary_completion')?.points).toBe(100);
    expect(byKey('rewarded_ad')?.points).toBe(10);
    expect(byKey('daily_login')?.points).toBe(5);
    expect(byKey('review_write')?.points).toBe(10);
  });
});
