import request from 'supertest';
import app from '../app';
import { getAuthToken } from './helpers/auth';

/** Wallet profile covers Pal Points / lifetime stats (legacy gamification route was never shipped). */
describe('Wallet Profile API', () => {
  let token: string;

  beforeAll(async () => {
    token = await getAuthToken('USER');
  });

  describe('GET /api/v1/wallet/profile', () => {
    it('should return wallet profile with points balance', async () => {
      const res = await request(app)
        .get('/api/v1/wallet/profile')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.palPoints).toBeDefined();
      expect(res.body.data.lifetimeEarned).toBeDefined();
      expect(Array.isArray(res.body.data.recentTransactions)).toBe(true);
    });

    it('should reject without auth', async () => {
      const res = await request(app).get('/api/v1/wallet/profile');
      expect(res.status).toBe(401);
    });
  });
});
