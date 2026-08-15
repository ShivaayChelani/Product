import request from 'supertest';
import app from '../app';
import { getAuthToken } from './helpers/auth';

describe('Points & Wallet API', () => {
  let userToken: string;

  beforeAll(async () => {
    userToken = await getAuthToken('USER');
  });

  describe('GET /api/v1/points/balance', () => {
    it('should return point balance', async () => {
      const res = await request(app)
        .get('/api/v1/points/balance')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
    });

    it('should reject without auth', async () => {
      const res = await request(app).get('/api/v1/points/balance');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/points/history', () => {
    it('should return point transaction history', async () => {
      const res = await request(app)
        .get('/api/v1/points/history')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
    });

    it('should reject without auth', async () => {
      const res = await request(app).get('/api/v1/points/history');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/wallet/profile', () => {
    it('should return wallet profile', async () => {
      const res = await request(app)
        .get('/api/v1/wallet/profile')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
    });

    it('should reject without auth', async () => {
      const res = await request(app).get('/api/v1/wallet/profile');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/wallet/transactions', () => {
    it('should return wallet transactions', async () => {
      const res = await request(app)
        .get('/api/v1/wallet/transactions')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
    });

    it('should reject without auth', async () => {
      const res = await request(app).get('/api/v1/wallet/transactions');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/v1/points/earn', () => {
    it('rejects unauthenticated clients', async () => {
      const res = await request(app)
        .post('/api/v1/points/earn')
        .send({
          userId: '00000000-0000-4000-8000-000000000000',
          amount: 9999,
          reason: 'client_tamper',
        });
      expect(res.status).toBe(401);
    });

    it('does not credit via the retired ledger even for finance admins', async () => {
      const adminToken = await getAuthToken('ADMIN');
      const res = await request(app)
        .post('/api/v1/points/earn')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: '00000000-0000-4000-8000-000000000000',
          amount: 9999,
          reason: 'client_tamper',
        });
      expect([400, 410]).toContain(res.status);
      expect(res.status).not.toBe(200);
    });
  });
});
