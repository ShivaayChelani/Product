import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../app';
import { prisma } from '../config/database';
import { pointRulesService } from '../modules/point-rules/pointRules.service';
import { testSlug, testRunId } from './helpers/testRunId';

describe('Wallet Extension API - Games and Regional Leaderboards', () => {
  let userToken: string;
  let userId: string;
  let testPlaceId: string;
  let placeCreated = false;
  let gameRewardPoints = 20;

  beforeAll(async () => {
    await pointRulesService.seedDefaults();
    const gameRule = await pointRulesService.getPointsForAction('game_complete');
    gameRewardPoints = gameRule?.points ?? 20;

    const registerRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `wallet-ext-${testRunId}@example.test`,
        name: 'Wallet Extension Test User',
        password: 'WalletExt@123',
      });

    if (registerRes.status !== 201 || !registerRes.body.data?.accessToken) {
      throw new Error(`Register failed: ${registerRes.status} ${JSON.stringify(registerRes.body)}`);
    }
    userToken = registerRes.body.data.accessToken;
    userId = registerRes.body.data.user.id;

    const jabalpurSlug = testSlug('test-marble-rocks-jabalpur');
    await prisma.place.deleteMany({ where: { slug: 'test-marble-rocks-jabalpur' } });

    // Fetch or create a test place in Jabalpur
    let place = await prisma.place.findFirst({
      where: { slug: jabalpurSlug },
    });

    if (!place) {
      place = await prisma.place.create({
        data: {
          name: 'Test Marble Rocks Jabalpur',
          slug: jabalpurSlug,
          description: 'Beautiful marble cliffs',
          category: 'nature',
          city: 'Jabalpur',
          state: 'Madhya Pradesh',
          latitude: 23.1284,
          longitude: 79.8161,
        },
      });
      placeCreated = true;
    }
    testPlaceId = place.id;
  });

  afterAll(async () => {
    await prisma.checkIn.deleteMany({
      where: { userId, placeId: testPlaceId },
    }).catch(() => {});

    await prisma.walletTransaction.deleteMany({ where: { userId } }).catch(() => {});
    await prisma.wallet.deleteMany({ where: { userId } }).catch(() => {});

    if (placeCreated && testPlaceId) {
      await prisma.place.delete({
        where: { id: testPlaceId },
      }).catch(() => {});
    }

    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  });

  describe('POST /api/v1/wallet/game-completion', () => {
    it('should award points on game completion and return new balance', async () => {
      const initialWallet = await prisma.wallet.findUnique({ where: { userId } });
      const initialPoints = initialWallet?.palPoints ?? 0;

      const res = await request(app)
        .post('/api/v1/wallet/game-completion')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ gameName: 'Memory Match' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.palPoints).toBe(initialPoints + gameRewardPoints);

      // Verify transaction row was added to DB
      const transaction = await prisma.walletTransaction.findFirst({
        where: { userId, reason: 'game_complete' },
        orderBy: { createdAt: 'desc' },
      });
      expect(transaction).not.toBeNull();
      expect(transaction?.amount).toBe(gameRewardPoints);
    });

    it('should fail if user is not authenticated', async () => {
      const res = await request(app)
        .post('/api/v1/wallet/game-completion')
        .send({ gameName: 'Memory Match' });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/wallet/leaderboard/regional', () => {
    it('should fetch regional rankings grouped by user check-ins', async () => {
      // Create a test check-in for the user in Jabalpur to guarantee ranking data
      await prisma.checkIn.create({
        data: {
          userId,
          placeId: testPlaceId,
        },
      }).catch(() => {}); // Catch if unique check-in already exists

      const res = await request(app)
        .get('/api/v1/wallet/leaderboard/regional?city=Jabalpur')
        .send();

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      
      // The current user should be ranked in the results
      const myRank = res.body.data.find((item: any) => item.userId === userId);
      expect(myRank).toBeDefined();
      expect(myRank.checkInCount).toBeGreaterThanOrEqual(1);
    });
  });
});
