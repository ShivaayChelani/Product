import { buildVendorRecentActivity, formatActivityWhen } from '../features/vendor/vendorRecentActivity';

describe('buildVendorRecentActivity', () => {
  it('returns an empty list when the vendor has no real events', () => {
    expect(buildVendorRecentActivity({ redemptions: [], offers: [], reels: [] })).toEqual([]);
  });

  it('does not invent sample pizza or PalPoints rows', () => {
    const items = buildVendorRecentActivity({ redemptions: [], offers: [], reels: [] });
    expect(items.some((i) => /pizza/i.test(i.title))).toBe(false);
    expect(items.some((i) => /250 PalPoints/i.test(i.title))).toBe(false);
  });

  it('includes only this vendor’s redemptions, offers, and published reels', () => {
    const items = buildVendorRecentActivity({
      redemptions: [{
        id: 'r1',
        userName: 'Monika',
        pointsSpent: 80,
        offerTitle: 'Tea combo',
        redeemedAt: '2026-08-15T06:00:00.000Z',
        status: 'verified',
      }],
      offers: [{
        id: 'o1',
        offerTitle: 'Morning chai',
        isActive: true,
        isApproved: true,
        createdAt: '2026-08-15T04:00:00.000Z',
      }],
      reels: [{
        id: 'v1',
        title: 'Cafe walkthrough',
        createdAt: '2026-08-14T12:00:00.000Z',
      }],
      limit: 10,
    });
    expect(items.map((i) => i.kind)).toEqual(['redemption', 'offer', 'reel']);
    expect(items[0].title).toMatch(/Monika.*80 PalPoints/);
    expect(items[1].title).toBe('Morning chai');
    expect(items[2].title).toBe('Cafe walkthrough');
  });

  it('labels today vs yesterday', () => {
    const now = new Date('2026-08-15T12:00:00+05:30').getTime();
    expect(formatActivityWhen(new Date('2026-08-15T11:24:00+05:30').getTime(), now)).toMatch(/^Today,/);
    expect(formatActivityWhen(new Date('2026-08-14T17:30:00+05:30').getTime(), now)).toMatch(/^Yesterday,/);
  });
});
