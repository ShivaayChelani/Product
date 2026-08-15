import request from 'supertest';
import app from '../app';
import { getAuthToken } from './helpers/auth';

describe('Redemptions API', () => {
  let userToken: string;
  let adminToken: string;

  beforeAll(async () => {
    userToken = await getAuthToken('USER');
    adminToken = await getAuthToken('ADMIN');
  });

  describe('POST /api/v1/redemptions/generate', () => {
    it('should reject without auth', async () => {
      const res = await request(app)
        .post('/api/v1/redemptions/redeem')
        .send({ offerId: 'test-offer-id', vendorCode: 'VND-TEST01' });

      expect(res.status).toBe(401);
    });

    it('should reject non-existent offer', async () => {
      const res = await request(app)
        .post('/api/v1/redemptions/redeem')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ offerId: 'nonexistent-offer-id', vendorCode: 'VND-TEST01' });

      expect(res.status).toBe(404);
    });

    it('should require vendor code', async () => {
      const res = await request(app)
        .post('/api/v1/redemptions/redeem')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ offerId: 'nonexistent-offer-id' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/v1/redemptions/generate (legacy alias)', () => {
    it('should require vendor code', async () => {
      const res = await request(app)
        .post('/api/v1/redemptions/generate')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ offerId: 'nonexistent-offer-id' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/redemptions/mine', () => {
    it('should return user redemptions', async () => {
      const res = await request(app)
        .get('/api/v1/redemptions/mine')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('GET /api/v1/redemptions/vendor', () => {
    it('should require vendor auth', async () => {
      const res = await request(app)
        .get('/api/v1/redemptions/vendor')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/v1/redemptions/admin/all', () => {
    it('should return all redemptions as admin', async () => {
      const res = await request(app)
        .get('/api/v1/redemptions/admin/all')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
    });

    it('should reject non-admin', async () => {
      const res = await request(app)
        .get('/api/v1/redemptions/admin/all')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
    });
  });
});
