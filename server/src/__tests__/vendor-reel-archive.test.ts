import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app';
import { prisma } from '../config/database';
import { getAuthToken } from './helpers/auth';
import { testRunId } from './helpers/testRunId';

/**
 * Field report: a vendor reel archived by its owner stayed on the public feed
 * because archive state lived only in the app's AsyncStorage. This exercises the
 * full server-backed lifecycle:
 *
 *   publish → owner archive → hidden from public profile + global feed +
 *   engagement → owner still sees it in their Archived list → unarchive →
 *   public visibility restored.
 */
describe('Vendor reel archive visibility', () => {
  const stamp = `varch-${testRunId}`;
  let vendorToken = '';
  let userToken = '';
  let vendorId = '';
  let vendorUserId = '';
  let liveReelId = '';
  let otherVendorId = '';
  let otherVendorUserId = '';
  let otherReelId = '';
  let createdSubscriptionId = '';
  let createdPlanId = '';
  let originalVendor: {
    status: string;
    subscriptionStatus: string;
    suspendedAt: Date | null;
  } | null = null;

  async function ensureVendorPlan(): Promise<string> {
    const existing = await prisma.subscriptionPlan.findFirst({
      where: { audience: 'VENDOR' },
      select: { id: true },
    });
    if (existing) return existing.id;
    const plan = await prisma.subscriptionPlan.create({
      data: {
        audience: 'VENDOR',
        name: `${stamp} plan`,
        slug: `${stamp}-plan`.slice(0, 40),
        status: 'ACTIVE',
        prices: {
          create: [{ period: 'MONTHLY', amountPaise: 9900, currency: 'INR', isActive: true }],
        },
      },
      select: { id: true },
    });
    createdPlanId = plan.id;
    return plan.id;
  }

  beforeAll(async () => {
    [vendorToken, userToken] = await Promise.all([getAuthToken('VENDOR'), getAuthToken('USER')]);

    const me = await request(app)
      .get('/api/v1/vendors/me')
      .set('Authorization', `Bearer ${vendorToken}`);
    vendorId = me.body.data?.id;
    vendorUserId = me.body.data?.userId;
    expect(vendorId).toBeTruthy();

    const vendorRow = await prisma.vendor.findUnique({ where: { id: vendorId } });
    originalVendor = {
      status: vendorRow!.status,
      subscriptionStatus: vendorRow!.subscriptionStatus,
      suspendedAt: vendorRow!.suspendedAt,
    };

    // Guarantee the listing is publicly visible for the whole test.
    await prisma.vendor.update({
      where: { id: vendorId },
      data: { status: 'APPROVED', subscriptionStatus: 'ACTIVE', suspendedAt: null },
    });
    const activeSub = await prisma.userSubscription.findFirst({
      where: {
        userId: vendorUserId,
        audience: 'VENDOR',
        status: { in: ['ACTIVE', 'TRIALING'] },
        currentPeriodEnd: { gte: new Date() },
      },
      select: { id: true },
    });
    if (!activeSub) {
      const planId = await ensureVendorPlan();
      const sub = await prisma.userSubscription.create({
        data: {
          userId: vendorUserId,
          planId,
          audience: 'VENDOR',
          status: 'ACTIVE',
          billingPeriod: 'MONTHLY',
          provider: 'ADMIN_GRANT',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
        select: { id: true },
      });
      createdSubscriptionId = sub.id;
    }

    const reel = await prisma.vendorReel.create({
      data: {
        vendorId,
        videoUrl: `https://example.test/${stamp}-live.mp4`,
        title: `${stamp} live reel`,
      },
      select: { id: true },
    });
    liveReelId = reel.id;

    // A second vendor we must never be able to touch with the first vendor's token.
    const otherUser = await prisma.user.create({
      data: { email: `${stamp}-other@example.test`, password: 'hash', name: 'Other Vendor' },
    });
    otherVendorUserId = otherUser.id;
    const otherVendor = await prisma.vendor.create({
      data: {
        userId: otherUser.id,
        businessName: `${stamp} Other Cafe`,
        businessType: 'cafe',
        phone: '+910000000099',
        address: 'Other Street',
        city: 'Jabalpur',
        state: 'MP',
        status: 'APPROVED',
      },
      select: { id: true },
    });
    otherVendorId = otherVendor.id;
    const otherReel = await prisma.vendorReel.create({
      data: {
        vendorId: otherVendorId,
        videoUrl: `https://example.test/${stamp}-other.mp4`,
        title: `${stamp} other reel`,
      },
      select: { id: true },
    });
    otherReelId = otherReel.id;
  }, 60_000);

  afterAll(async () => {
    await prisma.vendorReel.deleteMany({
      where: { id: { in: [liveReelId, otherReelId].filter(Boolean) } },
    });
    if (createdSubscriptionId) {
      await prisma.userSubscription.delete({ where: { id: createdSubscriptionId } }).catch(() => undefined);
    }
    if (createdPlanId) {
      await prisma.subscriptionPlan.delete({ where: { id: createdPlanId } }).catch(() => undefined);
    }
    if (otherVendorId) {
      await prisma.vendor.delete({ where: { id: otherVendorId } }).catch(() => undefined);
    }
    if (otherVendorUserId) {
      await prisma.user.delete({ where: { id: otherVendorUserId } }).catch(() => undefined);
    }
    if (vendorId && originalVendor) {
      await prisma.vendor
        .update({
          where: { id: vendorId },
          data: {
            status: originalVendor.status as any,
            subscriptionStatus: originalVendor.subscriptionStatus as any,
            suspendedAt: originalVendor.suspendedAt,
          },
        })
        .catch(() => undefined);
    }
  });

  async function publicReelIds(): Promise<string[]> {
    const res = await request(app).get(`/api/v1/vendors/${vendorId}/reels`);
    expect(res.status).toBe(200);
    return (res.body.data || []).map((r: { id: string }) => r.id);
  }

  async function ownerReels(): Promise<Array<{ id: string; archivedAt: string | null }>> {
    const res = await request(app)
      .get(`/api/v1/vendors/${vendorId}/reels`)
      .set('Authorization', `Bearer ${vendorToken}`);
    expect(res.status).toBe(200);
    return res.body.data || [];
  }

  it('publishes the reel to the public vendor profile while live', async () => {
    expect(await publicReelIds()).toContain(liveReelId);
  });

  it('archiving removes it from public and preview surfaces but keeps it for the owner', async () => {
    const res = await request(app)
      .patch(`/api/v1/vendors/reels/${liveReelId}/archive`)
      .set('Authorization', `Bearer ${vendorToken}`)
      .send({ archived: true });
    expect(res.status).toBe(200);
    expect(res.body.data?.archivedAt).toBeTruthy();

    expect(await publicReelIds()).not.toContain(liveReelId);

    const ownerList = await ownerReels();
    const row = ownerList.find((r) => r.id === liveReelId);
    expect(row).toBeTruthy();
    expect(row!.archivedAt).toBeTruthy();

    const preview = await request(app)
      .get('/api/v1/vendors/me/listing-preview')
      .set('Authorization', `Bearer ${vendorToken}`);
    expect(preview.status).toBe(200);
    const previewReelIds = (preview.body.data?.reels || []).map((r: { id: string }) => r.id);
    expect(previewReelIds).not.toContain(liveReelId);
  });

  it('hides the archived reel from the global feed and blocks engagement', async () => {
    const feed = await request(app).get('/api/v1/social/reels').query({ limit: 50 });
    expect(feed.status).toBe(200);
    const feedIds = (feed.body.data || []).map((r: { id: string }) => r.id);
    expect(feedIds).not.toContain(liveReelId);

    const like = await request(app)
      .post(`/api/v1/social/reels/${liveReelId}/like`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(like.status).toBe(404);
  });

  it('unarchiving restores public visibility', async () => {
    const res = await request(app)
      .patch(`/api/v1/vendors/reels/${liveReelId}/archive`)
      .set('Authorization', `Bearer ${vendorToken}`)
      .send({ archived: false });
    expect(res.status).toBe(200);
    expect(res.body.data?.archivedAt == null).toBe(true);

    expect(await publicReelIds()).toContain(liveReelId);
  });

  it("refuses to archive another vendor's reel", async () => {
    const res = await request(app)
      .patch(`/api/v1/vendors/reels/${otherReelId}/archive`)
      .set('Authorization', `Bearer ${vendorToken}`)
      .send({ archived: true });
    expect(res.status).toBe(403);

    const untouched = await prisma.vendorReel.findUnique({ where: { id: otherReelId } });
    expect(untouched?.archivedAt).toBeNull();
  });

  it('rejects a non-boolean archive payload', async () => {
    const res = await request(app)
      .patch(`/api/v1/vendors/reels/${liveReelId}/archive`)
      .set('Authorization', `Bearer ${vendorToken}`)
      .send({ archived: 'yes' });
    expect(res.status).toBe(400);
  });
});
