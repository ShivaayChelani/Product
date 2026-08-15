import request from 'supertest';
import app from '../app';
import { getAuthToken } from './helpers/auth';

describe('Users API', () => {
  let userToken: string;
  let adminToken: string;

  beforeAll(async () => {
    userToken = await getAuthToken('USER');
    adminToken = await getAuthToken('ADMIN');
  });

  describe('GET /api/v1/users', () => {
    it('should list users as admin', async () => {
      const res = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should reject non-admin', async () => {
      const res = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/v1/users/:id', () => {
    it('should get user by id as admin', async () => {
      const list = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`);

      if (list.body.data?.length > 0) {
        const userId = list.body.data[0].id;
        const res = await request(app)
          .get(`/api/v1/users/${userId}`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data.id).toBe(userId);
      }
    });

    it('should reject non-admin', async () => {
      const res = await request(app)
        .get('/api/v1/users/some-id')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
    });
  });
});
