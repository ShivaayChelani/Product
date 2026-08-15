import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ApiError } from '../shared/utils/ApiError';

const getForUser = vi.fn();
const vendorFindUnique = vi.fn();
const offerCount = vi.fn();
const reelCount = vi.fn();
const settingFindUnique = vi.fn();

vi.mock('../config/database', () => ({
  prisma: {
    vendor: { findUnique: (...args: unknown[]) => vendorFindUnique(...args) },
    vendorOffer: { count: (...args: unknown[]) => offerCount(...args) },
    vendorReel: { count: (...args: unknown[]) => reelCount(...args) },
    systemSetting: { findUnique: (...args: unknown[]) => settingFindUnique(...args) },
    reel: { count: vi.fn() },
    creatorProfile: { findFirst: vi.fn() },
    subscriptionPlan: { findUnique: vi.fn() },
  },
}));

vi.mock('../modules/monetization/entitlements.service', () => ({
  entitlementsService: { getForUser: (...args: unknown[]) => getForUser(...args) },
}));

import { planEnforcementService } from '../modules/monetization/plan-enforcement.service';
import { UNLIMITED } from '../modules/monetization/plan-catalog.service';

describe('vendor plan enforcement', () => {
  beforeEach(() => {
    getForUser.mockReset();
    vendorFindUnique.mockReset();
    offerCount.mockReset();
    reelCount.mockReset();
    settingFindUnique.mockResolvedValue(null);
    vendorFindUnique.mockResolvedValue({ id: 'v1', userId: 'u1' });
  });

  it('rejects a second active offer on Starter (1 offer)', async () => {
    getForUser.mockResolvedValue({
      vendorSubscription: { maxOffers: 1, maxReels: 2, name: 'Starter', planId: 'p-starter', features: {}, slug: 'vendor-starter' },
    });
    offerCount.mockResolvedValue(1);
    await expect(planEnforcementService.assertVendorCanCreateOffer('u1')).rejects.toMatchObject({
      statusCode: 403,
      code: 'PLAN_LIMIT_REACHED',
      message: expect.stringMatching(/up to 1 active offer/i),
    });
  });

  it('rejects a sixth active offer on Growth (5 offers)', async () => {
    getForUser.mockResolvedValue({
      vendorSubscription: { maxOffers: 5, maxReels: 7, name: 'Growth', planId: 'p-growth', features: {}, slug: 'vendor-growth' },
    });
    offerCount.mockResolvedValue(5);
    await expect(planEnforcementService.assertVendorCanCreateOffer('u1')).rejects.toBeInstanceOf(ApiError);
  });

  it('allows unlimited offers', async () => {
    getForUser.mockResolvedValue({
      vendorSubscription: { maxOffers: 999999, maxReels: 999999, name: 'Unlimited', planId: 'p-unl', features: {}, slug: 'vendor-unlimited' },
    });
    const limits = await planEnforcementService.assertVendorCanCreateOffer('u1');
    expect(limits.maxOffers).toBe(UNLIMITED);
    expect(offerCount).not.toHaveBeenCalled();
  });

  it('enforces monthly reel limits, not lifetime reel counts', async () => {
    getForUser.mockResolvedValue({
      vendorSubscription: { maxOffers: 1, maxReels: 2, name: 'Starter', planId: 'p-starter', features: {}, slug: 'vendor-starter' },
    });
    reelCount.mockResolvedValue(2);
    await expect(planEnforcementService.assertVendorCanCreateReel('u1')).rejects.toMatchObject({
      statusCode: 403,
      message: expect.stringMatching(/2 reels per month/i),
    });
    expect(reelCount.mock.calls[0][0].where.createdAt.gte).toBeInstanceOf(Date);
  });

  it('defaults unsubscribed vendors to zero offers/reels', async () => {
    getForUser.mockResolvedValue({ vendorSubscription: null });
    offerCount.mockResolvedValue(0);
    await expect(planEnforcementService.assertVendorCanCreateOffer('u1')).rejects.toMatchObject({
      statusCode: 403,
      message: expect.stringMatching(/Subscribe to a vendor plan/i),
    });
  });

  it('blocks collaboration requests without an active vendor plan', async () => {
    getForUser.mockResolvedValue({ vendorSubscription: null, vendorListing: { visible: false } });
    await expect(planEnforcementService.assertVendorCanCollaborate('u1')).rejects.toMatchObject({
      statusCode: 403,
      code: 'PLAN_LIMIT_REACHED',
      message: expect.stringMatching(/Subscribe to a vendor plan to send collaboration/i),
    });
  });

  it('allows collaboration requests with an active vendor plan', async () => {
    getForUser.mockResolvedValue({
      vendorSubscription: { maxOffers: 1, maxReels: 2, name: 'Starter', planId: 'p-starter', features: {}, slug: 'vendor-starter' },
      vendorListing: { visible: true },
    });
    await expect(planEnforcementService.assertVendorCanCollaborate('u1')).resolves.toBeTruthy();
  });
});
