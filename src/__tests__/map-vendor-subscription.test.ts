import fs from 'fs';
import path from 'path';

describe('Map vendor pins for active subscriptions', () => {
  it('does not drop subscribed vendor pins when showOnMap is false', () => {
    const map = fs.readFileSync(
      path.join(__dirname, '../screens/MapScreen.tsx'),
      'utf8',
    );
    expect(map).not.toMatch(/showOnMap !== false/);
    expect(map).toMatch(/mapInViewport/);
    expect(map).toMatch(/listForMap/);
  });

  it('treats an active subscription as enough for a public map pin', () => {
    const vis = fs.readFileSync(
      path.join(__dirname, '../../server/src/modules/vendors/vendor-public-visibility.ts'),
      'utf8',
    );
    expect(vis).toMatch(/getPublicVendorMapWhere/);
    // Live UserSubscription check — denormalized vendor.subscriptionStatus can stay
    // ACTIVE after expiry until reconcile runs, so pins must key off current_period_end.
    expect(vis).toMatch(/LIVE_VENDOR_SUB_STATUSES/);
    expect(vis).toMatch(/currentPeriodEnd: \{ gte: now \}/);
    expect(vis).not.toMatch(/showOnMap: true,/);
  });
});
