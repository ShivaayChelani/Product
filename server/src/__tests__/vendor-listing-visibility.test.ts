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
  let vendorToken = '';
  let userToken = '';
  let originalStatus: string | null = null;
  let seededVendorId = '';

  beforeAll(async () => {
    [vendorToken, userToken] = await Promise.all([
      getAuthToken('VENDOR'),
      getAuthToken('USER'),
    ]);

    const me = await request(app).get('/api/v1/vendors/me').set('Authorization', `Bearer ${vendorToken}`);
    seededVendorId = me.body.data?.id;
    originalStatus = me.body.data?.subscriptionStatus ?? null;

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

    const liveUser = await prisma.user.create({
      data: { email: `${stamp}-live@example.test`, password: 'hash', name: 'Live Vendor' },
    });
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
  }, 60000);

  afterAll(async () => {
    if (seededVendorId && originalStatus) {
      await prisma.vendor.update({
        where: { id: seededVendorId },
        data: { subscriptionStatus: originalStatus as any },
      }).catch(() => undefined);
    }
    await prisma.vendor.deleteMany({ where: { id: { in: [hiddenId, liveId].filter(Boolean) } } });
    await prisma.user.deleteMany({ where: { email: { contains: `${stamp}-` } } });
  });

  it('does not return unsubscribed vendors from public map/nearby APIs', async () => {
    const res = await request(app).get('/api/v1/vendors/map-list');
    expect(res.status).toBe(200);
    const ids = (res.body.data || []).map((v: { id: string }) => v.id);
    expect(ids).not.toContain(hiddenId);
    expect(ids).toContain(liveId);
  });

  it('404s public details for an unsubscribed vendor', async () => {
    const hidden = await request(app).get(`/api/v1/vendors/${hiddenId}/details`);
    expect(hidden.status).toBe(404);
    const live = await request(app).get(`/api/v1/vendors/${liveId}/details`);
    expect(live.status).toBe(200);
  });

  it('lets the vendor preview their own listing while remaining hidden', async () => {
    if (seededVendorId) {
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

  it('hides the seeded vendor from public details after expiry and shows them after ACTIVE', async () => {
    if (!seededVendorId) return;
    await prisma.vendor.update({
      where: { id: seededVendorId },
      data: { subscriptionStatus: 'EXPIRED' },
    });
    const expired = await request(app).get(`/api/v1/vendors/${seededVendorId}/details`);
    expect(expired.status).toBe(404);

    await prisma.vendor.update({
      where: { id: seededVendorId },
      data: { subscriptionStatus: 'ACTIVE' },
    });
    const active = await request(app).get(`/api/v1/vendors/${seededVendorId}/details`);
    expect(active.status).toBe(200);
  });
});
