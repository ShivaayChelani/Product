import request from 'supertest';
import app from '../app';
import { getAuthToken } from './helpers/auth';

describe('Social API', () => {
  let userToken: string;

  beforeAll(async () => {
    userToken = await getAuthToken('USER');
  });

  describe('Collections', () => {
    it('should create a collection', async () => {
      const res = await request(app)
        .post('/api/v1/social/collections')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ name: 'My Collection', description: 'Test', isPublic: true });

      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('My Collection');
    });

    it('should reject collection without name', async () => {
      const res = await request(app)
        .post('/api/v1/social/collections')
        .set('Authorization', `Bearer ${userToken}`)
        .send({});

      expect(res.status).toBe(400);
    });
  });
});
