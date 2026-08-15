import request from 'supertest';
import app from '../app';
import { getAuthToken } from './helpers/auth';

describe('Reports API', () => {
  let userToken: string;
  let adminToken: string;

  beforeAll(async () => {
    userToken = await getAuthToken('USER');
    adminToken = await getAuthToken('ADMIN');
  });

  describe('GET /api/v1/reports/generate', () => {
    it('should generate a user report as admin', async () => {
      const res = await request(app)
        .get('/api/v1/reports/generate?type=users')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
    });

    it('should generate a places report as admin', async () => {
      const res = await request(app)
        .get('/api/v1/reports/generate?type=places&format=json')
        .set('Authorization', `Bearer ${adminToken}`)
        .timeout(120000);

      expect(res.status).toBe(200);
    }, 120000);

    it('should reject non-admin', async () => {
      const res = await request(app)
        .get('/api/v1/reports/generate')
        .set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(403);
    });
  });
});
