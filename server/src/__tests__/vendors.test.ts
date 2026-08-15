import request from 'supertest';
import app from '../app';
import { getAuthToken } from './helpers/auth';

describe('Vendors API', () => {
  let userToken: string;
  let adminToken: string;
  let _vendorToken: string;

  beforeAll(async () => {
    userToken = await getAuthToken('USER');
    adminToken = await getAuthToken('ADMIN');
    _vendorToken = await getAuthToken('VENDOR');
  });

  describe('GET /api/v1/vendors/nearby', () => {
    it('should return nearby vendors', async () => {
      const res = await request(app)
        .get('/api/v1/vendors/nearby')
        .query({ lat: 28.6129, lng: 77.2295, radius: 50 });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should handle missing coordinates gracefully', async () => {
      const res = await request(app).get('/api/v1/vendors/nearby');
      expect(res.status).toBeLessThan(500);
    });
  });

  describe('GET /api/v1/vendors/hotels', () => {
    it('should return hotels', async () => {
      const res = await request(app).get('/api/v1/vendors/hotels');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('GET /api/v1/vendors/restaurants', () => {
    it('should return restaurants', async () => {
      const res = await request(app).get('/api/v1/vendors/restaurants');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('GET /api/v1/vendors/offers', () => {
    it('should return public offers', async () => {
      const res = await request(app).get('/api/v1/vendors/offers');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('GET /api/v1/vendors/me', () => {
    it('should return vendor profile when user has one', async () => {
      const res = await request(app)
        .get('/api/v1/vendors/me')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
    });

    it('should reject without auth', async () => {
      const res = await request(app).get('/api/v1/vendors/me');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/v1/vendors/register', () => {
    it('should return the existing application for duplicate registration', async () => {
      // First, successfully register a vendor
      await request(app)
        .post('/api/v1/vendors/register')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          businessName: 'Initial Vendor Shop',
          businessType: 'local_shop',
          phone: '+91-8888888888',
          address: 'Test Address',
          city: 'Delhi',
          state: 'Delhi',
          description: 'An initial vendor shop',
          latitude: 28.6129,
          longitude: 77.2295,
        });

      // Re-applying while a PENDING application exists is blocked (exclusivity / pending gate).
      const res = await request(app)
        .post('/api/v1/vendors/register')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          businessName: 'Test Vendor Shop',
          businessType: 'local_shop',
          phone: '+91-9999999999',
          address: 'Test Address',
          city: 'Delhi',
          state: 'Delhi',
          description: 'A test vendor shop',
          latitude: 28.6129,
          longitude: 77.2295,
        });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('APPLICATION_PENDING');
    });

    it('should reject missing required fields', async () => {
      const res = await request(app)
        .post('/api/v1/vendors/register')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ businessName: 'Incomplete' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/vendors (admin)', () => {
    it('should list all vendors as admin', async () => {
      const res = await request(app)
        .get('/api/v1/vendors')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should reject non-admin', async () => {
      const res = await request(app)
        .get('/api/v1/vendors')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
    });
  });
});
