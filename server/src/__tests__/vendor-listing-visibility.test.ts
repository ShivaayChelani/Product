import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app';
import { prisma } from '../config/database';
import { getAuthToken } from './helpers/auth';
import { testRunId } from './helpers/testRunId';

describe('Public vendor listing entitlement', () => {
  const stamp = `vlist-${testRunId}`;
  let hiddenId = '';
  let liveId = '';
  let staleId = '';
  let vendorToken = '';
  let userToken = '';
  let originalStatus: string | null = null;
  let seededVendorId = '';
  let seededUserId = '';
  let liveUserId = '';
  let staleUserId = '';
  let hiddenUserId = '';
  let liveSubId = '';
  let vendorPlanId = '';

  async function vendorPlan(): Promise<string> {
    if (vendorPlanId) return vendorPlanId;
    const existing = await prisma.subscriptionPlan.findFirst({
      where: { audience: 'VENDOR' },
      select: { id: true },
    });
    if (existing) {
      vendorPlanId = existing.id;
      return vendorPlanId;
    }
    const created = await prisma.subscriptionPlan.create({
      data: {
        audience: 'VENDOR',
        name: `${stamp} Plan`,
        slug: `vendor-vis-${testRunId}`.slice(0, 40),
        status: 'ACTIVE',
        prices: { create: [{ period: 'MONTHLY', amountPaise: 9900, currency: 'INR', isActive: true }] },
      },
      select: { id: true },
    });
    vendorPlanId = created.id;
    return vendorPlanId;
  }

  async function grantLiveVendorSub(userId: string) {
    const planId = await vendorPlan();
    return prisma.userSubscription.create({
      data: {
        userId,
        planId,
        audience: 'VENDOR',
        status: 'ACTIVE',
        billingPeriod: 'MONTHLY',
        provider: 'ADMIN_GRANT',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
  }

  beforeAll(async () => {
    [vendorToken, userToken] = await Promise.all([
      getAuthToken('VENDOR'),
      getAuthToken('USER'),
    ]);

    const me = await request(app).get('/api/v1/vendors/me').set('Authorization', `Bearer ${vendorToken}`);
    seededVendorId = me.body.data?.id;
    originalStatus = me.body.data?.subscriptionStatus ?? null;
    if (seededVendorId) {
      const row = await prisma.vendor.findUnique({ where: { id: seededVendorId }, select: { userId: true } });
      seededUserId = row?.userId || '';
    }

    const hiddenUser = await prisma.user.create({
      data: { email: `${stamp}-hidden@example.test`, password: 'hash', name: 'Hidden Vendor' },
    });
    const hidden = await prisma.vendor.create({
      data: {
        userId: hiddenUser.id,
        businessName: `${stamp} Hidden Cafe`,
        businessType: 'cafe',
        phone: '+910000000011',
        address: 'Hidden Street',
        city: 'Jabalpur',
        state: 'MP',
        status: 'APPROVED',
        showOnMap: true,
        latitude: 23.1815,
        longitude: 79.9864,
        subscriptionStatus: 'NONE',
      },
    });
    hiddenId = hidden.id;
    hiddenUserId = hiddenUser.id;

    const liveUser = await prisma.user.create({
      data: { email: `${stamp}-live@example.test`, password: 'hash', name: 'Live Vendor' },
    });
    liveUserId = liveUser.id;
    const live = await prisma.vendor.create({
      data: {
        userId: liveUser.id,
        businessName: `${stamp} Live Cafe`,
        businessType: 'cafe',
        phone: '+910000000012',
        address: 'Live Street',
        city: 'Jabalpur',
        state: 'MP',
        status: 'APPROVED',
        showOnMap: true,
        latitude: 23.1825,
        longitude: 79.9874,
        subscriptionStatus: 'ACTIVE',
      },
    });
    liveId = live.id;
    const liveSub = await grantLiveVendorSub(liveUser.id);
    liveSubId = liveSub.id;

    const staleUser = await prisma.user.create({
      data: { email: `${stamp}-stale@example.test`, password: 'hash', name: 'Stale Vendor' },
    });
    staleUserId = staleUser.id;
    const stale = await prisma.vendor.create({
      data: {
        userId: staleUser.id,
        businessName: `${stamp} Stale Cafe`,
        businessType: 'cafe',
        phone: '+910000000013',
        address: 'Stale Street',
        city: 'Jabalpur',
        state: 'MP',
        status: 'APPROVED',
        showOnMap: true,
        latitude: 23.1835,
        longitude: 79.9884,
        subscriptionStatus: 'ACTIVE',
      },
    });
    staleId = stale.id;
  }, 60000);

  afterAll(async () => {
    if (seededVendorId && originalStatus) {
      await prisma.vendor.update({
        where: { id: seededVendorId },
        data: { subscriptionStatus: originalStatus as any },
      }).catch(() => undefined);
    }
    if (seededUserId) {
      await prisma.userSubscription.updateMany({
        where: { userId: seededUserId, audience: 'VENDOR' },
        data: {
          status: 'ACTIVE',
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      }).catch(() => undefined);
    }
    await prisma.userSubscription.deleteMany({
      where: { userId: { in: [liveUserId, staleUserId, hiddenUserId].filter(Boolean) } },
    });
    await prisma.vendor.deleteMany({ where: { id: { in: [hiddenId, liveId, staleId].filter(Boolean) } } });
    await prisma.user.deleteMany({ where: { email: { contains: `${stamp}-` } } });
  });

  it('does not return unsubscribed vendors from public map/nearby APIs', async () => {
    const res = await request(app).get('/api/v1/vendors/map-list');
    expect(res.status).toBe(200);
    const ids = (res.body.data || []).map((v: { id: string }) => v.id);
    expect(ids).not.toContain(hiddenId);
    expect(ids).not.toContain(staleId);
    expect(ids).toContain(liveId);
  });

  it('hides vendors whose denormalized status is ACTIVE without a live UserSubscription', async () => {
    const details = await request(app).get(`/api/v1/vendors/${staleId}/details`);
    expect(details.status).toBe(404);
    const map = await request(app).get('/api/v1/vendors/map-list');
    const ids = (map.body.data || []).map((v: { id: string }) => v.id);
    expect(ids).not.toContain(staleId);
  });

  it('keeps an actively subscribed vendor on the map even if showOnMap is false', async () => {
    await prisma.vendor.update({
      where: { id: liveId },
      data: { showOnMap: false },
    });
    const res = await request(app).get('/api/v1/vendors/map-list');
    expect(res.status).toBe(200);
    const ids = (res.body.data || []).map((v: { id: string }) => v.id);
    expect(ids).toContain(liveId);
    await prisma.vendor.update({
      where: { id: liveId },
      data: { showOnMap: true },
    });
  });

  it('returns subscribed businesses in reel location search regardless of letter case or missing coords', async () => {
    await prisma.vendor.update({
      where: { id: liveId },
      data: { latitude: null, longitude: null },
    });

    const mixed = await request(app).get(
      `/api/v1/vendors/location-search?q=${encodeURIComponent('live cafe')}`,
    );
    expect(mixed.status).toBe(200);
    const mixedIds = (mixed.body.data || []).map((v: { id: string }) => v.id);
    expect(mixedIds).toContain(liveId);
    expect(mixedIds).not.toContain(hiddenId);

    const upper = await request(app).get(
      `/api/v1/vendors/location-search?q=${encodeURIComponent('LIVE CAFE')}`,
    );
    expect(upper.status).toBe(200);
    expect((upper.body.data || []).map((v: { id: string }) => v.id)).toContain(liveId);

    await prisma.vendor.update({
      where: { id: liveId },
      data: { latitude: 23.1825, longitude: 79.9874 },
    });
  });

  it('404s public details for an unsubscribed vendor', async () => {
    const hidden = await request(app).get(`/api/v1/vendors/${hiddenId}/details`);
    expect(hidden.status).toBe(404);
    const live = await request(app).get(`/api/v1/vendors/${liveId}/details`);
    expect(live.status).toBe(200);
  });

  it('lets the vendor preview their own listing while remaining hidden', async () => {
    if (seededVendorId) {
      const me = await request(app).get('/api/v1/vendors/me').set('Authorization', `Bearer ${vendorToken}`);
      const ownerId = me.body.data?.userId || me.body.data?.user?.id;
      if (ownerId) {
        await prisma.userSubscription.updateMany({
          where: { userId: ownerId, audience: 'VENDOR' },
          data: { status: 'EXPIRED', currentPeriodEnd: new Date(Date.now() - 60_000) },
        });
      }
      await prisma.vendor.update({
        where: { id: seededVendorId },
        data: { subscriptionStatus: 'NONE' },
      });
    }
    const preview = await request(app)
      .get('/api/v1/vendors/me/listing-preview')
      .set('Authorization', `Bearer ${vendorToken}`);
    expect(preview.status).toBe(200);
    expect(preview.body.data?.preview).toBe(true);
    expect(preview.body.data?.isLive).toBe(false);

    const other = await request(app)
      .get('/api/v1/vendors/me/listing-preview')
      .set('Authorization', `Bearer ${userToken}`);
    expect(other.status).toBeGreaterThanOrEqual(400);
  });

  it('hides the seeded vendor from public details after subscription expiry', async () => {
    if (!seededVendorId) return;
    const me = await request(app).get('/api/v1/vendors/me').set('Authorization', `Bearer ${vendorToken}`);
    const ownerId = me.body.data?.userId || me.body.data?.user?.id;
    if (ownerId) {
      await prisma.userSubscription.updateMany({
        where: { userId: ownerId, audience: 'VENDOR' },
        data: { status: 'EXPIRED', currentPeriodEnd: new Date(Date.now() - 60_000) },
      });
    }
    await prisma.vendor.update({
      where: { id: seededVendorId },
      data: { subscriptionStatus: 'EXPIRED' },
    });
    const expired = await request(app).get(`/api/v1/vendors/${seededVendorId}/details`);
    expect(expired.status).toBe(404);
  });
});
