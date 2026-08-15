import request from 'supertest';
import app from '../app';
import { getAuthToken } from './helpers/auth';

describe('Analytics API', () => {
  let userToken: string;
  let adminToken: string;

  beforeAll(async () => {
    userToken = await getAuthToken('USER');
    adminToken = await getAuthToken('ADMIN');
  });

  describe('GET /api/v1/analytics/dashboard', () => {
    it('should return dashboard as admin', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/dashboard')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
    });

    it('should reject non-admin', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/dashboard')
        .set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/v1/analytics/places', () => {
    it('should return places analytics as admin', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/places')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/v1/analytics/users', () => {
    it('should return user analytics as admin', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/users')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
    });
  });
});

describe('City Analytics API', () => {
  let adminToken: string;

  beforeAll(async () => {
    adminToken = await getAuthToken('ADMIN');
  });

  describe('GET /api/v1/analytics/cities/dashboard', () => {
    it('should return city analytics dashboard as admin', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/cities/dashboard')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
    });

    it('should reject non-admin', async () => {
      const userToken = await getAuthToken('USER');
      const res = await request(app)
        .get('/api/v1/analytics/cities/dashboard')
        .set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(403);
    });
  });
});

describe('Growth Analytics API', () => {
  let adminToken: string;

  beforeAll(async () => {
    adminToken = await getAuthToken('ADMIN');
  });

  describe('GET /api/v1/analytics/growth/dashboard', () => {
    it('should return growth dashboard as admin', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/growth/dashboard')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
    });

    it('should reject non-admin', async () => {
      const userToken = await getAuthToken('USER');
      const res = await request(app)
        .get('/api/v1/analytics/growth/dashboard')
        .set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(403);
    });
  });
});

describe('Revenue Analytics API', () => {
  let adminToken: string;

  beforeAll(async () => {
    adminToken = await getAuthToken('ADMIN');
  });

  describe('GET /api/v1/analytics/revenue/dashboard', () => {
    it('should return revenue dashboard as admin', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/revenue/dashboard')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
    });

    it('should reject non-admin', async () => {
      const userToken = await getAuthToken('USER');
      const res = await request(app)
        .get('/api/v1/analytics/revenue/dashboard')
        .set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(403);
    });
  });
});
