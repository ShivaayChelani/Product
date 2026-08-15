import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app';
import { prisma } from '../config/database';
import { testSlug, testRunId } from './helpers/testRunId';
import { getAuthToken } from './helpers/auth';
import { pointRulesService } from '../modules/point-rules/pointRules.service';

describe('Place photo PalPoints and review notifications', () => {
  let userToken: string;
  let adminToken: string;
  let userId: string;
  let placeId: string;
  let imageId: string | null = null;
  let createdUserId: string | null = null;

  beforeAll(async () => {
    await pointRulesService.ensureMissingDefaults().catch(() => pointRulesService.seedDefaults());
    adminToken = await getAuthToken('ADMIN');

    const registerRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `photo-points-${testRunId}@example.test`,
        name: 'Photo Points User',
        password: 'PhotoPts@123',
      });

    if (registerRes.status === 201 && registerRes.body.data?.accessToken) {
      userToken = registerRes.body.data.accessToken;
      userId = registerRes.body.data.user.id;
      createdUserId = userId;
    } else {
      userToken = await getAuthToken('USER');
      const seeded = await prisma.user.findFirst({ where: { email: 'user@palsafar.com' } });
      if (!seeded) throw new Error('Seeded user@palsafar.com not found');
      userId = seeded.id;
    }

    const place = await prisma.place.create({
      data: {
        name: 'Photo Point Fixture',
        slug: testSlug('photo-point-fixture'),
        description: 'Fixture place with no images so a traveller can contribute one.',
        category: 'fort',
        city: 'PhotoTestCity',
        state: 'TestState',
        country: 'India',
        latitude: 23.1,
        longitude: 78.1,
        status: 'APPROVED',
        source: 'ADMIN',
        images: [],
      },
    });
    placeId = place.id;
  });

  afterAll(async () => {
    if (imageId) {
      await prisma.walletTransaction.deleteMany({ where: { referenceId: imageId } }).catch(() => {});
      await prisma.inAppNotification.deleteMany({
        where: { userId, type: 'place_image_review' },
      }).catch(() => {});
      await prisma.userPlaceImage.deleteMany({ where: { id: imageId } }).catch(() => {});
    }
    if (placeId) {
      await prisma.userPlaceImage.deleteMany({ where: { placeId } }).catch(() => {});
      await prisma.place.delete({ where: { id: placeId } }).catch(() => {});
    }
    if (createdUserId) {
      await prisma.walletTransaction.deleteMany({ where: { userId: createdUserId } }).catch(() => {});
      await prisma.wallet.deleteMany({ where: { userId: createdUserId } }).catch(() => {});
      await prisma.inAppNotification.deleteMany({ where: { userId: createdUserId } }).catch(() => {});
      await prisma.user.delete({ where: { id: createdUserId } }).catch(() => {});
    }
  });

  it('awards PalPoints and sends a review notification on photo upload', async () => {
    const walletBefore = await prisma.wallet.findUnique({ where: { userId } });
    const pointsBefore = walletBefore?.palPoints ?? 0;

    const res = await request(app)
      .post(`/api/v1/places/${placeId}/contribute-image`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ url: `https://cdn.example.test/place-photo-${testRunId}.jpg` });

    expect(res.status).toBe(201);
    expect(res.body?.data?.points).toBeGreaterThanOrEqual(5);
    expect(res.body?.data?.pointsAwarded).toBe(true);
    imageId = res.body?.data?.id;
    expect(imageId).toBeTruthy();

    const walletAfter = await prisma.wallet.findUnique({ where: { userId } });
    expect((walletAfter?.palPoints ?? 0)).toBeGreaterThanOrEqual(pointsBefore + 5);

    const tx = await prisma.walletTransaction.findFirst({
      where: {
        userId,
        reason: 'place_image_approved',
        referenceId: imageId!,
        referenceType: 'USER_PLACE_IMAGE',
      },
    });
    expect(tx).toBeTruthy();

    const notif = await prisma.inAppNotification.findFirst({
      where: {
        userId,
        type: 'place_image_review',
        createdAt: { gte: new Date(Date.now() - 30_000) },
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(notif).toBeTruthy();
    expect(`${notif?.title} ${notif?.body || ''}`).toMatch(/review|PalPoints/i);
  });

  it('does not award PalPoints again when admin approves the same photo', async () => {
    expect(imageId).toBeTruthy();
    const txCountBefore = await prisma.walletTransaction.count({
      where: { userId, referenceId: imageId! },
    });

    const res = await request(app)
      .patch(`/api/v1/admin/place-images/${imageId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body?.data?.points ?? 0).toBe(0);

    const txCountAfter = await prisma.walletTransaction.count({
      where: { userId, referenceId: imageId! },
    });
    expect(txCountAfter).toBe(txCountBefore);

    const approvedNotif = await prisma.inAppNotification.findFirst({
      where: {
        userId,
        type: 'place_image_review',
        title: { contains: 'approved', mode: 'insensitive' },
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(approvedNotif).toBeTruthy();
  });
});
