import request from 'supertest';
import app from '../app';
import { getAuthToken } from './helpers/auth';

describe('Settings API', () => {
  let userToken: string;
  let adminToken: string;

  beforeAll(async () => {
    userToken = await getAuthToken('USER');
    adminToken = await getAuthToken('ADMIN');
  });

  describe('POST /api/v1/settings/seed', () => {
    it('should seed default settings as admin', async () => {
      const res = await request(app)
        .post('/api/v1/settings/seed')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/v1/settings', () => {
    it('should list settings as admin', async () => {
      const res = await request(app)
        .get('/api/v1/settings')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('should reject without auth', async () => {
      const res = await request(app).get('/api/v1/settings');
      expect(res.status).toBe(401);
    });

    it('should reject non-admin', async () => {
      const res = await request(app)
        .get('/api/v1/settings')
        .set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/v1/settings/categories', () => {
    it('should return setting categories', async () => {
      const res = await request(app)
        .get('/api/v1/settings/categories')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('GET /api/v1/settings/category/:category', () => {
    it('should return settings by category', async () => {
      const res = await request(app)
        .get('/api/v1/settings/category/general')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should return empty for non-existent category', async () => {
      const res = await request(app)
        .get('/api/v1/settings/category/nonexistent')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });

  describe('PATCH /api/v1/settings/:key', () => {
    it('should update a setting as admin', async () => {
      const res = await request(app)
        .patch('/api/v1/settings/app_name')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ value: 'PalSafar Test' });

      expect(res.status).toBe(200);
      expect(res.body.data.value).toBe('PalSafar Test');
    });

    it('should return 404 for non-existent key', async () => {
      const res = await request(app)
        .patch('/api/v1/settings/nonexistent_key')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ value: 'test' });

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/v1/settings/bulk-update', () => {
    it('should bulk update settings', async () => {
      const res = await request(app)
        .post('/api/v1/settings/bulk-update')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          updates: [
            { key: 'app_name', value: 'PalSafar Bulk' },
            { key: 'support_email', value: 'test@palsafar.com' },
          ],
        });

      expect(res.status).toBe(200);
    });
  });
});
