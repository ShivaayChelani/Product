import request from 'supertest';
import app from '../app';
import { getAuthToken } from './helpers/auth';

describe('Notifications API', () => {
  let userToken: string;

  beforeAll(async () => {
    userToken = await getAuthToken('USER');
  });

  describe('POST /api/v1/notifications/register-token', () => {
    it('should register a device token', async () => {
      const res = await request(app)
        .post('/api/v1/notifications/register-token')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          token: 'test-device-token-12345',
          platform: 'android',
        });

      expect([200, 201]).toContain(res.status);
    });

    it('should reject without auth', async () => {
      const res = await request(app)
        .post('/api/v1/notifications/register-token')
        .send({ token: 'test', platform: 'ios' });

      expect(res.status).toBe(401);
    });

    it('should reject invalid platform', async () => {
      const res = await request(app)
        .post('/api/v1/notifications/register-token')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ token: 'test', platform: 'invalid' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/notifications', () => {
    it('should list notifications', async () => {
      const res = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
    });

    it('should reject without auth', async () => {
      const res = await request(app).get('/api/v1/notifications');
      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /api/v1/notifications/mark-read', () => {
    it('should mark notifications as read', async () => {
      const res = await request(app)
        .patch('/api/v1/notifications/mark-read')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ notificationIds: ['dummy-id'] });

      expect(res.status).toBe(200);
    });

    it('should reject invalid body', async () => {
      const res = await request(app)
        .patch('/api/v1/notifications/mark-read')
        .set('Authorization', `Bearer ${userToken}`)
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/v1/notifications/mark-all-read', () => {
    it('should mark all notifications as read', async () => {
      const res = await request(app)
        .post('/api/v1/notifications/mark-all-read')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
    });
  });
});
