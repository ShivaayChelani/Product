import request from 'supertest';
import app from '../app';
import { getAuthToken } from './helpers/auth';
import { pointRulesService } from '../modules/point-rules/pointRules.service';

describe('Point Rules API', () => {
  let userToken: string;
  let adminToken: string;

  beforeAll(async () => {
    userToken = await getAuthToken('USER');
    adminToken = await getAuthToken('ADMIN');
    await pointRulesService.seedDefaults();
  });

  describe('GET /api/v1/point-rules', () => {
    it('should list point rules', async () => {
      const res = await request(app).get('/api/v1/point-rules');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('should list point rules without auth', async () => {
      const res = await request(app).get('/api/v1/point-rules');
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/v1/point-rules/:key', () => {
    it('should get a rule by key', async () => {
      const res = await request(app).get('/api/v1/point-rules/daily_login');
      expect(res.status).toBe(200);
      expect(res.body.data.key).toBe('daily_login');
    });

    it('should expose place_image_approved at +5 (UI-aligned)', async () => {
      await pointRulesService.ensureMissingDefaults();
      const res = await request(app).get('/api/v1/point-rules/place_image_approved');
      expect(res.status).toBe(200);
      expect(res.body.data.key).toBe('place_image_approved');
      expect(res.body.data.points).toBe(5);
    });

    it('should return 404 for non-existent key', async () => {
      const res = await request(app).get('/api/v1/point-rules/nonexistent');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/v1/point-rules', () => {
    it('should create a rule as admin', async () => {
      const res = await request(app)
        .post('/api/v1/point-rules')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          key: 'test_rule',
          label: 'Test Rule',
          points: 10,
          xpAmount: 20,
          category: 'general',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.key).toBe('test_rule');
    });

    it('should reject non-admin', async () => {
      const res = await request(app)
        .post('/api/v1/point-rules')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ key: 'foo', label: 'bar', points: 5 });

      expect(res.status).toBe(403);
    });
  });

  describe('PATCH /api/v1/point-rules/:id', () => {
    it('should update a rule as admin', async () => {
      const list = await request(app).get('/api/v1/point-rules');
      const rule = list.body.data.find((r: any) => r.key === 'test_rule');
      if (!rule) return;

      const res = await request(app)
        .patch(`/api/v1/point-rules/${rule.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ label: 'Updated Test Rule' });

      expect(res.status).toBe(200);
      expect(res.body.data.label).toBe('Updated Test Rule');
    });
  });

  describe('DELETE /api/v1/point-rules/:id', () => {
    it('should delete a rule as admin', async () => {
      const list = await request(app).get('/api/v1/point-rules');
      const rule = list.body.data.find((r: any) => r.key === 'test_rule');
      if (!rule) return;

      const res = await request(app)
        .delete(`/api/v1/point-rules/${rule.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(204);
    });
  });
});
