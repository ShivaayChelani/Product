import request from 'supertest';
import app from '../app';
import { getAuthToken } from './helpers/auth';
import { prisma } from '../config/database';
import { testRunId } from './helpers/testRunId';

describe('Hidden Gems API', () => {
  let userToken: string;
  let adminToken: string;
  let gemId: string;
  const gemName = `Secret Waterfall ${testRunId}`;

  beforeAll(async () => {
    userToken = await getAuthToken('USER');
    adminToken = await getAuthToken('ADMIN');
  });

  afterAll(async () => {
    if (gemId) {
      await prisma.place.delete({ where: { id: gemId } }).catch(() => {});
    }
  });

  describe('POST /api/v1/hidden-gems', () => {
    it('should create a hidden gem', async () => {
      const res = await request(app)
        .post('/api/v1/hidden-gems')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          placeName: gemName,
          description: 'A hidden waterfall in the forest hidden away from the main path',
          latitude: 28.5129,
          longitude: 77.1295,
          category: 'waterfall',
          city: 'Delhi',
          state: 'Delhi',
          worthVisitingReason: 'Because it is a beautiful hidden spot',
          locationMethod: 'gps',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.placeName).toBe(gemName);
      expect(res.body.data.status).toBe('pending');
      gemId = res.body.data.id;
    });

    it('should reject Null Island coordinates', async () => {
      const res = await request(app)
        .post('/api/v1/hidden-gems')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          placeName: 'Null Island Gem',
          description: 'Should never persist a 0,0 placeholder location for a gem',
          latitude: 0,
          longitude: 0,
          category: 'waterfall',
          city: 'Delhi',
          state: 'Delhi',
          worthVisitingReason: 'Because it is a beautiful hidden spot',
          locationMethod: 'gps',
        });
      expect(res.status).toBe(400);
    });

    it('should reject without required fields', async () => {
      const res = await request(app)
        .post('/api/v1/hidden-gems')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ placeName: '' });
      expect(res.status).toBe(400);
    });

    it('should reject without auth', async () => {
      const res = await request(app)
        .post('/api/v1/hidden-gems')
        .send({ placeName: 'Test', latitude: 28.5, longitude: 77.1 });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/hidden-gems', () => {
    it('should list hidden gems', async () => {
      const res = await request(app)
        .get('/api/v1/hidden-gems?page=1&limit=10')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should reject without auth', async () => {
      const res = await request(app).get('/api/v1/hidden-gems');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/hidden-gems/:id', () => {
    it('should get hidden gem by id', async () => {
      if (!gemId) return;
      const res = await request(app)
        .get(`/api/v1/hidden-gems/${gemId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(gemId);
    });

    it('should return 404 for non-existent gem', async () => {
      const res = await request(app)
        .get('/api/v1/hidden-gems/nonexistent-id')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/v1/admin/hidden-gems/:id/approve', () => {
    it('should approve hidden gem as admin', async () => {
      if (!gemId) return;
      const res = await request(app)
        .patch(`/api/v1/admin/hidden-gems/${gemId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ force: true });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('approved');
    });

    it('approved hidden gem is discoverable via universal search', async () => {
      if (!gemId) return;
      const stored = await prisma.place.findUnique({ where: { id: gemId } });
      expect(stored?.status).toBe('APPROVED');
      expect(stored?.source).toBe('HIDDEN_GEM');

      const res = await request(app)
        .get(`/api/v1/search/universal?q=${encodeURIComponent('Secret')}&limit=20`);

      expect(res.status).toBe(200);
      const hiddenIds = (res.body.data.hiddenGems || []).map((p: { id: string }) => p.id);
      expect(hiddenIds).toContain(gemId);
    });

    it('approved hidden gem appears in public hidden-gems feed', async () => {
      if (!gemId) return;
      const res = await request(app).get('/api/v1/places/hidden-gems');
      expect(res.status).toBe(200);
      const ids = (res.body.data || []).map((p: { id: string }) => p.id);
      expect(ids).toContain(gemId);
    });

    it('should reject non-admin approval', async () => {
      if (!gemId) return;
      const res = await request(app)
        .patch(`/api/v1/admin/hidden-gems/${gemId}/approve`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('PATCH /api/v1/admin/hidden-gems/:id/unpublish', () => {
    it('should unpublish an approved hidden gem without hard-delete', async () => {
      if (!gemId) return;
      const res = await request(app)
        .patch(`/api/v1/admin/hidden-gems/${gemId}/unpublish`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'QA unpublish' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('unpublished');

      const stored = await prisma.place.findUnique({ where: { id: gemId } });
      expect(stored).toBeTruthy();
      expect(stored?.status).toBe('REJECTED');
    });

    it('should reject non-admin unpublish', async () => {
      if (!gemId) return;
      const res = await request(app)
        .patch(`/api/v1/admin/hidden-gems/${gemId}/unpublish`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ reason: 'spoof' });
      expect(res.status).toBe(403);
    });
  });
});
