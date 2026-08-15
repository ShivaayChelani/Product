import request from 'supertest';
import app from '../app';
import { getAuthToken } from './helpers/auth';
import { prisma } from '../config/database';
import { ChallengeStatus } from '@prisma/client';

describe('Challenges API', () => {
  let userToken: string;
  let adminToken: string;
  let userId: string;

  beforeAll(async () => {
    userToken = await getAuthToken('USER');
    adminToken = await getAuthToken('ADMIN');

    // Decode or find user ID from db
    const user = await prisma.user.findFirst({ where: { email: 'user@palsafar.com' } });
    userId = user!.id;
  });

  describe('GET /api/v1/challenges', () => {
    it('should return a list of approved challenges', async () => {
      const res = await request(app)
        .get('/api/v1/challenges')
        .query({ limit: 5 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should support searching and filtering by category', async () => {
      const res = await request(app)
        .get('/api/v1/challenges')
        .query({ category: 'Food' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const allFood = res.body.data.every((c: any) => c.category.toLowerCase() === 'food');
      expect(allFood).toBe(true);
    });
  });

  describe('POST /api/v1/challenges (user)', () => {
    it('should allow users to submit a new challenge', async () => {
      const res = await request(app)
        .post('/api/v1/challenges')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'Taste JBP Panipuri',
          description: 'Try panipuri from 5 different street stalls around Jabalpur Civic Center.',
          difficulty: 'MEDIUM',
          category: 'Food',
          proofRequired: 'PHOTO',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('PENDING');
      expect(res.body.data.creatorId).toBe(userId);
    });

    it('should reject invalid input fields', async () => {
      const res = await request(app)
        .post('/api/v1/challenges')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'Short', // Title too short
          description: 'Short', // Description too short
          difficulty: 'INVALID',
          category: '',
          proofRequired: 'NONE',
        });

      expect(res.status).toBe(400);
    });
  });

  describe('Admin actions & Completion flow', () => {
    let challengeId: string;

    beforeEach(async () => {
      // Create a pending challenge for tests
      const challenge = await prisma.challenge.create({
        data: {
          title: 'Dumna Cycling Trail',
          description: 'Cycle the entire 5km trail in Dumna Nature Park.',
          difficulty: 'HARD',
          category: 'Fitness',
          proofRequired: 'GPS',
          creatorId: userId,
          status: ChallengeStatus.PENDING,
        },
      });
      challengeId = challenge.id;
    });

    afterEach(async () => {
      await prisma.challengeCompletion.deleteMany({ where: { challengeId } });
      await prisma.challenge.delete({ where: { id: challengeId } });
    });

    it('should allow admins to approve a challenge and award creator points', async () => {
      const res = await request(app)
        .patch(`/api/v1/challenges/${challengeId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'APPROVED',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('APPROVED');

      // Verify the transaction was created for the creator (+50 points)
      const txn = await prisma.walletTransaction.findFirst({
        where: {
          userId,
          amount: 50,
          reason: 'Challenge "Dumna Cycling Trail" approved',
        },
      });
      expect(txn).toBeTruthy();
    });

    it('should allow users to complete approved challenges and earn points', async () => {
      // First, approve the challenge so it can be completed
      await prisma.challenge.update({
        where: { id: challengeId },
        data: { status: ChallengeStatus.APPROVED },
      });

      const res = await request(app)
        .post(`/api/v1/challenges/${challengeId}/complete`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          proofUrl: 'https://res.cloudinary.com/dhu4at0jh/image/upload/v1234/test.jpg',
          latitude: 23.1815,
          longitude: 79.9864,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify points were credited to completer (HARD difficulty = +75 points)
      const txn = await prisma.walletTransaction.findFirst({
        where: {
          userId,
          amount: 75,
          reason: 'Completed challenge: Dumna Cycling Trail',
        },
      });
      expect(txn).toBeTruthy();
    });

    it('should reject double completions', async () => {
      await prisma.challenge.update({
        where: { id: challengeId },
        data: { status: ChallengeStatus.APPROVED },
      });

      // Complete first time
      await request(app)
        .post(`/api/v1/challenges/${challengeId}/complete`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ latitude: 23.1815, longitude: 79.9864 });

      // Attempt second time
      const res = await request(app)
        .post(`/api/v1/challenges/${challengeId}/complete`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ latitude: 23.1815, longitude: 79.9864 });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('already completed');
    });
  });

  describe('GET /api/v1/challenges/creators/leaderboard', () => {
    it('should return leaderboard of creators', async () => {
      const res = await request(app).get('/api/v1/challenges/creators/leaderboard');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });
});
