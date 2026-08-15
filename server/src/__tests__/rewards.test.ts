import request from 'supertest';
import app from '../app';

describe('Rewards API', () => {
  describe('GET /api/v1/rewards', () => {
    it('should list rewards', async () => {
      const res = await request(app).get('/api/v1/rewards');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('GET /api/v1/rewards/offers', () => {
    it('should list reward offers', async () => {
      const res = await request(app).get('/api/v1/rewards/offers');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('GET /api/v1/rewards/nearby', () => {
    it('should return nearby rewards', async () => {
      const res = await request(app)
        .get('/api/v1/rewards/nearby')
        .query({ lat: 28.6129, lng: 77.2295, radius: 50 });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should handle missing coordinates gracefully', async () => {
      const res = await request(app).get('/api/v1/rewards/nearby');
      expect(res.status).toBeLessThan(500);
    });
  });

  describe('GET /api/v1/rewards/:id', () => {
    it('should return 404 for non-existent reward', async () => {
      const res = await request(app).get('/api/v1/rewards/nonexistent-id');
      expect(res.status).toBe(404);
    });
  });
});
