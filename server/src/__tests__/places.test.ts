import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import app from '../app';
import { getAuthToken } from './helpers/auth';
import { prisma } from '../config/database';
import { testRunId, testSlug } from './helpers/testRunId';
import { env } from '../config/env';

describe('Places API', () => {
  let userToken: string;
  let adminToken: string;
  let placeId: string;

  beforeAll(async () => {
    userToken = await getAuthToken('USER');
    adminToken = await getAuthToken('ADMIN');
  });

  afterAll(async () => {
    if (placeId) {
      await prisma.place.delete({ where: { id: placeId } }).catch(() => {});
    }
  });

  describe('POST /api/v1/places', () => {
    it('should create a place when authenticated', async () => {
      const res = await request(app)
        .post('/api/v1/places')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          name: `Test Place ${testRunId}`,
          description: 'A test place description',
          latitude: 28.6129,
          longitude: 77.2295,
          category: 'MONUMENT',
          city: 'Delhi',
          state: 'Delhi',
          country: 'India',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe(`Test Place ${testRunId}`);
      expect(res.body.data.status).toBe('PENDING');
      placeId = res.body.data.id;
    });

    it('should reject without auth', async () => {
      const res = await request(app)
        .post('/api/v1/places')
        .send({ name: 'Test', description: 'Desc', latitude: 28.6, longitude: 77.2, category: 'MONUMENT' });

      expect(res.status).toBe(401);
    });

    it('should reject invalid data', async () => {
      const res = await request(app)
        .post('/api/v1/places')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ name: '' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/places', () => {
    it('should list places', async () => {
      const res = await request(app).get('/api/v1/places');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('PATCH /api/v1/admin/places/:id/approve', () => {
    it('should approve place as admin', async () => {
      if (!placeId) return;
      const res = await request(app)
        .patch(`/api/v1/admin/places/${placeId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('APPROVED');
    });
  });

  describe('GET /api/v1/places/search', () => {
    it('should search places', async () => {
      const res = await request(app).get('/api/v1/places/search?q=test');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should return 400 for invalid geo params', async () => {
      const res = await request(app).get('/api/v1/places/search?lat=invalid&lng=0');
      expect(res.status).toBe(400);
    });

    it('should handle empty or whitespace search queries without crashing', async () => {
      const res1 = await request(app).get('/api/v1/places/search?q=');
      expect(res1.status).toBe(200);
      expect(Array.isArray(res1.body.data)).toBe(true);

      const res2 = await request(app).get('/api/v1/places/search?q=%20%20');
      expect(res2.status).toBe(200);
      expect(Array.isArray(res2.body.data)).toBe(true);
    });
  });

  describe('GET /api/v1/places/trending', () => {
    it('should return trending places', async () => {
      const res = await request(app).get('/api/v1/places/trending');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('GET /api/v1/places/map', () => {
    it('should return map feed for viewport bounds', async () => {
      const res = await request(app).get(
        '/api/v1/places/map?north=29&south=22&east=82&west=76&zoom=8',
      );
      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(['clusters', 'places']).toContain(res.body.data.mode);
      expect(res.body.data.bounds).toBeDefined();
    });

    it('should return map categories', async () => {
      const res = await request(app).get('/api/v1/places/map/categories');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should reject invalid map bounds', async () => {
      const res = await request(app).get('/api/v1/places/map?north=invalid&south=22&east=82&west=76');
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/v1/places/:id', () => {
    it('should delete a place when authenticated as admin', async () => {
      const createRes = await request(app)
        .post('/api/v1/places')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `Test Place to Delete ${testRunId}`,
          description: 'A test place description',
          latitude: 26.7101 + (Date.now() % 1000) / 100000,
          longitude: 80.7101 + (Date.now() % 700) / 100000,
          category: 'MONUMENT',
          city: 'Lucknow',
          state: 'Uttar Pradesh',
          country: 'India',
        });
      expect(createRes.status).toBe(201);
      const testPlaceId = createRes.body.data.id;

      const deleteRes = await request(app)
        .delete(`/api/v1/places/${testPlaceId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(deleteRes.status).toBe(204);
    });

    it('does not let a submitter delete an approved place', async () => {
      const createRes = await request(app)
        .post('/api/v1/places')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          name: `Submitter Delete Guard ${testRunId}`,
          description: 'A test place description',
          latitude: 26.7301 + ((Date.now() + 17) % 1000) / 100000,
          longitude: 80.7301 + ((Date.now() + 23) % 700) / 100000,
          category: 'MONUMENT',
          city: 'Lucknow',
          state: 'Uttar Pradesh',
          country: 'India',
        });
      expect(createRes.status).toBe(201);
      const submittedId = createRes.body.data.id;

      const approveRes = await request(app)
        .patch(`/api/v1/admin/places/${submittedId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(approveRes.status).toBe(200);

      const deleteRes = await request(app)
        .delete(`/api/v1/places/${submittedId}`)
        .set('Authorization', `Bearer ${userToken}`);
      expect(deleteRes.status).toBe(403);

      const stillThere = await prisma.place.findUnique({ where: { id: submittedId } });
      expect(stillThere?.status).toBe('APPROVED');

      await request(app)
        .delete(`/api/v1/admin/places/${submittedId}`)
        .set('Authorization', `Bearer ${adminToken}`);
    });
  });

  describe('DELETE /api/v1/admin/places/:id', () => {
    it('should delete a place as admin via admin route', async () => {
      const createRes = await request(app)
        .post('/api/v1/places')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `Test Place to Delete Admin ${testRunId}`,
          description: 'A test place description',
          latitude: 31.5101 + ((Date.now() + 41) % 1000) / 100000,
          longitude: 74.7101 + ((Date.now() + 59) % 700) / 100000,
          category: 'MONUMENT',
          city: 'Amritsar',
          state: 'Punjab',
          country: 'India',
        });
      expect(createRes.status).toBe(201);
      const testPlaceId = createRes.body.data.id;

      const deleteRes = await request(app)
        .delete(`/api/v1/admin/places/${testPlaceId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(deleteRes.status).toBe(204);
    });
  });

  describe('PATCH /api/v1/admin/places/:id image sync', () => {
    let adminPlaceId: string;
    const imgA = 'https://res.cloudinary.com/demo/image/upload/palsasafar/places/sync-a.jpg';
    const imgB = 'https://res.cloudinary.com/demo/image/upload/palsasafar/places/sync-b.jpg';
    const imgC = 'https://res.cloudinary.com/demo/image/upload/palsasafar/places/sync-c.jpg';

    afterAll(async () => {
      if (adminPlaceId) {
        await prisma.placeImage.deleteMany({ where: { placeId: adminPlaceId } }).catch(() => {});
        await prisma.place.delete({ where: { id: adminPlaceId } }).catch(() => {});
      }
    });

    it('creates place_images rows on admin create with images', async () => {
      const res = await request(app)
        .post('/api/v1/places')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `Image Sync Place ${testRunId}`,
          description: 'Image sync integration test place',
          latitude: 28.6129,
          longitude: 77.2295,
          category: 'MONUMENT',
          city: 'Delhi',
          state: 'Delhi',
          country: 'India',
          images: [imgA, imgB],
          editorialPriority: 4,
        });
      expect(res.status).toBe(201);
      adminPlaceId = res.body.data.id;
      expect(res.body.data.editorialPriority).toBe(4);
      expect(res.body.data.thumbnail).toBe(imgA);

      const rows = await prisma.placeImage.findMany({
        where: { placeId: adminPlaceId },
        orderBy: { order: 'asc' },
      });
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.url)).toEqual([imgA, imgB]);
      expect(rows[0].isPrimary).toBe(true);
    });

    it('replaces images and updates thumbnail on admin update', async () => {
      if (!adminPlaceId) return;
      const res = await request(app)
        .patch(`/api/v1/admin/places/${adminPlaceId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ images: [imgC, imgA] });
      expect(res.status).toBe(200);
      expect(res.body.data.images).toEqual([imgC, imgA]);
      expect(res.body.data.thumbnail).toBe(imgC);

      const rows = await prisma.placeImage.findMany({
        where: { placeId: adminPlaceId },
        orderBy: { order: 'asc' },
      });
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.url)).toEqual([imgC, imgA]);
      expect(rows.find((r) => r.url === imgB)).toBeUndefined();
    });

    it('clears images and place_images on delete-all', async () => {
      if (!adminPlaceId) return;
      const res = await request(app)
        .patch(`/api/v1/admin/places/${adminPlaceId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ images: [] });
      expect(res.status).toBe(200);
      expect(res.body.data.images).toEqual([]);
      expect(res.body.data.thumbnail).toBeNull();

      const rows = await prisma.placeImage.findMany({ where: { placeId: adminPlaceId } });
      expect(rows).toHaveLength(0);
    });
  });

  describe('GET /api/v1/admin/places search and priority', () => {
    const ids: string[] = [];
    const marker = `AdmPlc_${testRunId}`;
    const cityA = `AdmPur_${testRunId}`;
    const stateA = `AdmPradesh_${testRunId}`;

    beforeAll(async () => {
      const fixtures = [
        {
          name: `${marker} Marble Cascade`,
          slug: testSlug('admplc-cascade'),
          category: 'waterfall',
          city: cityA,
          state: stateA,
          lat: 8.1123,
          lng: 77.2234,
          editorialPriority: 1,
        },
        {
          name: `${marker} Other Spot`,
          slug: testSlug('admplc-other'),
          category: 'fort',
          city: `AdmBhop_${testRunId}`,
          state: stateA,
          lat: 8.3345,
          lng: 77.4456,
          editorialPriority: 5,
        },
      ];
      for (const f of fixtures) {
        const created = await prisma.place.create({
          data: {
            name: f.name,
            slug: f.slug,
            description: `${f.name} admin places search fixture`,
            category: f.category,
            city: f.city,
            state: f.state,
            country: 'India',
            latitude: f.lat,
            longitude: f.lng,
            editorialPriority: f.editorialPriority,
            status: 'APPROVED',
            source: 'ADMIN',
          },
        });
        ids.push(created.id);
      }
    }, 60000);

    afterAll(async () => {
      if (ids.length) await prisma.place.deleteMany({ where: { id: { in: ids } } });
    });

    it('finds a place by partial name, case-insensitively', async () => {
      const res = await request(app)
        .get('/api/v1/admin/places')
        .query({ search: 'marble casc', touristOnly: 'false', limit: 50 })
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.some((p: { name: string }) => p.name.includes('Marble Cascade'))).toBe(true);
    });

    it('finds places by city and by state', async () => {
      const cityRes = await request(app)
        .get('/api/v1/admin/places')
        .query({ search: cityA, touristOnly: 'false', limit: 50 })
        .set('Authorization', `Bearer ${adminToken}`);
      expect(cityRes.status).toBe(200);
      expect(cityRes.body.data.some((p: { name: string }) => p.name.includes('Marble Cascade'))).toBe(true);

      const stateRes = await request(app)
        .get('/api/v1/admin/places')
        .query({ search: stateA, touristOnly: 'false', limit: 50 })
        .set('Authorization', `Bearer ${adminToken}`);
      expect(stateRes.status).toBe(200);
      const names = stateRes.body.data.map((p: { name: string }) => p.name);
      expect(names.some((n: string) => n.includes('Marble Cascade'))).toBe(true);
      expect(names.some((n: string) => n.includes('Other Spot'))).toBe(true);
    });

    it('combines search with category filter', async () => {
      const res = await request(app)
        .get('/api/v1/admin/places')
        .query({ search: cityA, category: 'waterfall', touristOnly: 'false', limit: 50 })
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      const mine = res.body.data.filter((p: { name: string }) => p.name.includes(marker));
      expect(mine.length).toBeGreaterThan(0);
      expect(mine.every((p: { category: string }) => p.category.toLowerCase() === 'waterfall')).toBe(true);
      expect(mine.some((p: { name: string }) => p.name.includes('Other Spot'))).toBe(false);
    });

    it('sorts by real editorialPriority ascending and descending', async () => {
      const asc = await request(app)
        .get('/api/v1/admin/places')
        .query({ search: marker, touristOnly: 'false', sort: 'priority', sortDir: 'asc', limit: 50 })
        .set('Authorization', `Bearer ${adminToken}`);
      expect(asc.status).toBe(200);
      const ascMine = asc.body.data.filter((p: { name: string }) => p.name.includes(marker));
      expect(ascMine.map((p: { editorialPriority: number }) => p.editorialPriority)).toEqual([1, 5]);

      const desc = await request(app)
        .get('/api/v1/admin/places')
        .query({ search: marker, touristOnly: 'false', sort: 'priority', sortDir: 'desc', limit: 50 })
        .set('Authorization', `Bearer ${adminToken}`);
      expect(desc.status).toBe(200);
      const descMine = desc.body.data.filter((p: { name: string }) => p.name.includes(marker));
      expect(descMine.map((p: { editorialPriority: number }) => p.editorialPriority)).toEqual([5, 1]);
    });
  });

  describe('JWT admin privilege freshness', () => {
    it('does not auto-publish a place when the access token claims ADMIN but DB roles do not', async () => {
      const user = await prisma.user.findUnique({
        where: { email: 'user@palsafar.com' },
        select: { id: true, email: true, name: true },
      });
      expect(user).toBeTruthy();

      const staleAdminJwt = jwt.sign(
        {
          userId: user!.id,
          email: user!.email,
          permission: Role.ADMIN,
          activeMode: Role.ADMIN,
          roles: [Role.ADMIN],
          role: Role.ADMIN,
          activeRole: Role.ADMIN,
          name: user!.name,
          jti: `stale-admin-${testRunId}`,
        },
        env.jwt.secret,
        { expiresIn: '1h', algorithm: 'HS256' },
      );

      const lat = 18.52 + (Date.now() % 10000) / 1_000_000;
      const res = await request(app)
        .post('/api/v1/places')
        .set('Authorization', `Bearer ${staleAdminJwt}`)
        .send({
          name: `Stale JWT Place ${testRunId}`,
          description: 'Must remain pending after privilege revocation',
          latitude: lat,
          longitude: 73.8567,
          category: 'MONUMENT',
          city: 'Pune',
          state: 'Maharashtra',
          country: 'India',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('PENDING');
      if (res.body.data.id) {
        await prisma.place.delete({ where: { id: res.body.data.id } }).catch(() => {});
      }
    });

    it('still auto-publishes when the caller is a live admin', async () => {
      const lat = 21.15 + (Date.now() % 10000) / 1_000_000;
      const res = await request(app)
        .post('/api/v1/places')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `Live Admin Place ${testRunId}`,
          description: 'Admin create should still publish',
          latitude: lat,
          longitude: 79.0882,
          category: 'MONUMENT',
          city: 'Nagpur',
          state: 'Maharashtra',
          country: 'India',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('APPROVED');
      if (res.body.data.id) {
        await prisma.place.delete({ where: { id: res.body.data.id } }).catch(() => {});
      }
    });
  });

  describe('place stat anti-inflation', () => {
    it('records a view once per actor within the dedup window', async () => {
      const targetId = placeId;
      expect(targetId).toBeTruthy();
      const first = await request(app)
        .post(`/api/v1/places/${targetId}/stats`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ action: 'view' });
      const second = await request(app)
        .post(`/api/v1/places/${targetId}/stats`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ action: 'view' });
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      const count = await prisma.placeStat.count({
        where: { placeId: targetId, action: 'view', userId: { not: null } },
      });
      expect(count).toBe(1);
    });
  });
});
