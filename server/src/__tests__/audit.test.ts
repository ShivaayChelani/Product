import request from 'supertest';
import app from '../app';
import { getAuthToken } from './helpers/auth';

describe('Audit Logs API', () => {
  let userToken: string;
  let adminToken: string;

  beforeAll(async () => {
    userToken = await getAuthToken('USER');
    adminToken = await getAuthToken('ADMIN');
  });

  describe('GET /api/v1/audit-logs', () => {
    it('should list audit logs as admin', async () => {
      const res = await request(app)
        .get('/api/v1/audit-logs')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should reject without auth', async () => {
      const res = await request(app).get('/api/v1/audit-logs');
      expect(res.status).toBe(401);
    });

    it('should reject non-admin', async () => {
      const res = await request(app)
        .get('/api/v1/audit-logs')
        .set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/v1/audit-logs/actions', () => {
    it('should return distinct action types', async () => {
      const res = await request(app)
        .get('/api/v1/audit-logs/actions')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('GET /api/v1/audit-logs/entity-types', () => {
    it('should return distinct entity types', async () => {
      const res = await request(app)
        .get('/api/v1/audit-logs/entity-types')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });
});
