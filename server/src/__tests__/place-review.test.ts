import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app';
import { prisma } from '../config/database';
import { testSlug, testRunId } from './helpers/testRunId';
import { getAuthToken } from './helpers/auth';

describe('Place reviews blocked; vendor reviews accepted', () => {
  let token: string;
  let reviewerId: string;
  let placeId: string;
  let vendorId: string;
  let vendorOwnerId: string;

  beforeAll(async () => {
    token = await getAuthToken('USER');
    const user = await prisma.user.findFirst({ where: { email: 'user@palsafar.com' } });
    if (!user) throw new Error('Seeded user@palsafar.com not found');
    reviewerId = user.id;

    const place = await prisma.place.create({
      data: {
        name: 'Review Rating Fixture',
        slug: testSlug('review-rating-fixture'),
        description: 'Fixture place for review rating tests.',
        category: 'fort',
        city: 'ReviewTestCity',
        state: 'TestState',
        country: 'India',
        latitude: 22.1,
        longitude: 79.1,
        status: 'APPROVED',
        source: 'ADMIN',
      },
    });
    placeId = place.id;

    const owner = await prisma.user.create({
      data: {
        email: `vendor-review-owner-${testRunId}@example.test`,
        password: 'hash',
        name: 'Vendor Review Owner',
      },
    });
    vendorOwnerId = owner.id;

    const vendor = await prisma.vendor.create({
      data: {
        userId: owner.id,
        businessName: 'Review Fixture Cafe',
        businessType: 'cafe',
        phone: '+910000000099',
        address: '1 Review Street',
        city: 'ReviewCity',
        state: 'TestState',
        status: 'APPROVED',
        subscriptionStatus: 'ACTIVE',
      },
    });
    vendorId = vendor.id;
  });

  afterAll(async () => {
    if (vendorId) {
      await prisma.vendorReview.deleteMany({ where: { vendorId } });
      await prisma.vendor.delete({ where: { id: vendorId } }).catch(() => {});
    }
    if (vendorOwnerId) {
      await prisma.user.delete({ where: { id: vendorOwnerId } }).catch(() => {});
    }
    if (placeId) {
      await prisma.review.deleteMany({ where: { placeId } });
      await prisma.place.delete({ where: { id: placeId } }).catch(() => {});
    }
  });

  function submitPlace(rating: unknown, content = 'A real visit note') {
    return request(app)
      .post(`/api/v1/places/${placeId}/review`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rating, content });
  }

  function submitVendor(rating: unknown, content = 'A real visit note') {
    return request(app)
      .post(`/api/v1/vendors/${vendorId}/review`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rating, content });
  }

  it('rejects authenticated place review creation', async () => {
    const res = await submitPlace(5);
    expect(res.status).toBe(403);
    const row = await prisma.review.findUnique({
      where: { placeId_userId: { placeId, userId: reviewerId } },
    });
    expect(row).toBeNull();
  });

  it('rejects unauthorized place review creation', async () => {
    const res = await request(app)
      .post(`/api/v1/places/${placeId}/review`)
      .send({ rating: 5, content: 'no auth' });
    expect(res.status).toBe(401);
  });

  it('rejects invalid place ratings before the product block', async () => {
    expect((await submitPlace(0)).status).toBe(400);
    expect((await submitPlace(6)).status).toBe(400);
  });

  it('stores vendor rating 1 as 1', async () => {
    const res = await submitVendor(1);
    expect(res.status).toBe(200);
    expect(res.body.data?.rating ?? res.body.rating).toBe(1);
    const row = await prisma.vendorReview.findUnique({
      where: { vendorId_userId: { vendorId, userId: reviewerId } },
    });
    expect(row?.rating).toBe(1);
  });

  it('stores vendor rating 3 as 3', async () => {
    const res = await submitVendor(3);
    expect(res.status).toBe(200);
    const row = await prisma.vendorReview.findUnique({
      where: { vendorId_userId: { vendorId, userId: reviewerId } },
    });
    expect(row?.rating).toBe(3);
  });

  it('stores vendor rating 5 as 5', async () => {
    const res = await submitVendor(5);
    expect(res.status).toBe(200);
    const row = await prisma.vendorReview.findUnique({
      where: { vendorId_userId: { vendorId, userId: reviewerId } },
    });
    expect(row?.rating).toBe(5);
  });

  it('rejects vendor rating 0 and 6', async () => {
    expect((await submitVendor(0)).status).toBe(400);
    expect((await submitVendor(6)).status).toBe(400);
    const row = await prisma.vendorReview.findUnique({
      where: { vendorId_userId: { vendorId, userId: reviewerId } },
    });
    expect(row?.rating).toBe(5);
  });

  it('rejects unauthorized vendor review creation', async () => {
    const res = await request(app)
      .post(`/api/v1/vendors/${vendorId}/review`)
      .send({ rating: 4, content: 'no auth' });
    expect(res.status).toBe(401);
  });

  it('does not accept a Place ID as a Vendor review target', async () => {
    const res = await request(app)
      .post(`/api/v1/vendors/${placeId}/review`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rating: 5, content: 'spoofed place as vendor' });
    expect(res.status).toBe(404);
    const vendorRow = await prisma.vendorReview.findFirst({
      where: { vendorId: placeId },
    });
    expect(vendorRow).toBeNull();
    const placeRow = await prisma.review.findUnique({
      where: { placeId_userId: { placeId, userId: reviewerId } },
    });
    expect(placeRow).toBeNull();
  });

  it('awards PalPoints on first vendor review only', async () => {
    const owner = await prisma.user.create({
      data: {
        email: `vendor-review-points-${testRunId}@example.test`,
        password: 'hash',
        name: 'Points Vendor Owner',
      },
    });
    const vendor = await prisma.vendor.create({
      data: {
        userId: owner.id,
        businessName: 'Points Review Cafe',
        businessType: 'cafe',
        phone: '+910000000098',
        address: '2 Points Street',
        city: 'ReviewCity',
        state: 'TestState',
        status: 'APPROVED',
      },
    });

    const walletBefore = await prisma.wallet.findUnique({ where: { userId: reviewerId } });
    const pointsBefore = walletBefore?.palPoints ?? 0;

    const first = await request(app)
      .post(`/api/v1/vendors/${vendor.id}/review`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rating: 5, content: 'Great place' });
    expect(first.status).toBe(200);
    expect(first.body?.data?.pointsAwarded).toBeGreaterThanOrEqual(10);

    const review = await prisma.vendorReview.findUnique({
      where: { vendorId_userId: { vendorId: vendor.id, userId: reviewerId } },
    });
    expect(review).toBeTruthy();

    const walletAfter = await prisma.wallet.findUnique({ where: { userId: reviewerId } });
    expect((walletAfter?.palPoints ?? 0)).toBeGreaterThanOrEqual(pointsBefore + 10);

    const tx = await prisma.walletTransaction.findFirst({
      where: {
        userId: reviewerId,
        reason: 'review_write',
        referenceId: review!.id,
        referenceType: 'VENDOR_REVIEW',
      },
    });
    expect(tx).toBeTruthy();

    const second = await request(app)
      .post(`/api/v1/vendors/${vendor.id}/review`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rating: 4, content: 'Updated review' });
    expect(second.status).toBe(200);
    expect(second.body?.data?.pointsAwarded ?? 0).toBe(0);
    expect(second.body?.data?.updated).toBe(true);

    const txCount = await prisma.walletTransaction.count({
      where: {
        userId: reviewerId,
        reason: 'review_write',
        referenceId: review!.id,
      },
    });
    expect(txCount).toBe(1);

    await prisma.walletTransaction.deleteMany({ where: { referenceId: review!.id } });
    await prisma.vendorReview.deleteMany({ where: { vendorId: vendor.id } });
    await prisma.vendor.delete({ where: { id: vendor.id } });
    await prisma.user.delete({ where: { id: owner.id } });
  });
});
