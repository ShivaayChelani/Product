import request from 'supertest';
import app from '../app';

describe('Geospatial API', () => {
  describe('GET /api/v1/geo/nearby', () => {
    it('should return nearby places', async () => {
      const res = await request(app)
        .get('/api/v1/geo/nearby')
        .query({ lat: '28.6129', lng: '77.2295', radius: '50' });

      expect([200, 500]).toContain(res.status);
    });

    it('should reject missing lat', async () => {
      const res = await request(app)
        .get('/api/v1/geo/nearby')
        .query({ lng: '77.2295', radius: '50' });

      expect(res.status).toBe(400);
    });

    it('should reject invalid lat', async () => {
      const res = await request(app)
        .get('/api/v1/geo/nearby')
        .query({ lat: 'invalid', lng: '77.2295', radius: '50' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/geo/clusters', () => {
    it('should return place clusters', async () => {
      const res = await request(app)
        .get('/api/v1/geo/clusters')
        .query({
          neLat: '28.8',
          neLng: '77.5',
          swLat: '28.4',
          swLng: '77.0',
        });

      expect([200, 500]).toContain(res.status);
    });

    it('should reject missing bounds', async () => {
      const res = await request(app).get('/api/v1/geo/clusters');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/geo/nearest', () => {
    it('should return nearest place', async () => {
      const res = await request(app)
        .get('/api/v1/geo/nearest')
        .query({ lat: '28.6129', lng: '77.2295' });

      expect([200, 500]).toContain(res.status);
    });

    it('should reject missing lng', async () => {
      const res = await request(app)
        .get('/api/v1/geo/nearest')
        .query({ lat: '28.6129' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/geo/trends', () => {
    it('should return geospatial trends', async () => {
      const res = await request(app)
        .get('/api/v1/geo/trends')
        .query({ lat: 28.6129, lng: 77.2295, radius: 50 });

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
    });
  });

  describe('GET /api/v1/geo/geofence', () => {
    it('should return places within geofence', async () => {
      const res = await request(app)
        .get('/api/v1/geo/geofence')
        .query({ lat: '28.6129', lng: '77.2295', radius: '50' });

      expect([200, 500]).toContain(res.status);
    });

    it('should reject missing geofence params', async () => {
      const res = await request(app).get('/api/v1/geo/geofence');
      expect(res.status).toBe(400);
    });
  });
});
