import request from 'supertest';
import app from '../app';
import { getAuthToken } from './helpers/auth';

describe('Sync API', () => {
  let userToken: string;
  let adminToken: string;

  beforeAll(async () => {
    userToken = await getAuthToken('USER');
    adminToken = await getAuthToken('ADMIN');
  });

  describe('POST /api/v1/sync/batch', () => {
    it('should process a sync batch', async () => {
      const res = await request(app)
        .post('/api/v1/sync/batch')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          operations: [
            {
              action: 'create',
              entityType: 'place',
              payload: { name: 'Synced Place' },
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.results).toBeDefined();
    });

    it('should reject without auth', async () => {
      const res = await request(app)
        .post('/api/v1/sync/batch')
        .send({ operations: [] });

      expect(res.status).toBe(401);
    });

    it('should reject invalid payload', async () => {
      const res = await request(app)
        .post('/api/v1/sync/batch')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ operations: 'not-an-array' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/sync/pending', () => {
    it('should return pending sync items', async () => {
      const res = await request(app)
        .get('/api/v1/sync/pending')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('GET /api/v1/sync/status', () => {
    it('should return sync status', async () => {
      const res = await request(app)
        .get('/api/v1/sync/status')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/v1/sync/admin/all', () => {
    it('should list all sync items as admin', async () => {
      const res = await request(app)
        .get('/api/v1/sync/admin/all')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
    });

    it('should reject non-admin', async () => {
      const res = await request(app)
        .get('/api/v1/sync/admin/all')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/v1/sync/admin/stats', () => {
    it('should return global sync stats as admin', async () => {
      const res = await request(app)
        .get('/api/v1/sync/admin/stats')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
    });
  });
});
