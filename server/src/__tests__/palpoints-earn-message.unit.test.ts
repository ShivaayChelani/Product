import { describe, expect, it } from 'vitest';
import { palPointsEarnMessage } from '../modules/wallet/walletEarnMessages';

describe('palPointsEarnMessage', () => {
  it('uses a review-specific body instead of the raw rule key', () => {
    expect(palPointsEarnMessage('review_write')).toMatch(/business review/i);
  });

  it('uses a place-photo body instead of the raw rule key', () => {
    expect(palPointsEarnMessage('place_image_approved')).toMatch(/place photo/i);
  });

  it('humanizes unknown reason keys', () => {
    expect(palPointsEarnMessage('custom_bonus')).toBe('custom bonus');
  });
});
