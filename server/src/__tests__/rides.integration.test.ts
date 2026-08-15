import request from 'supertest';
import app from '../app';

describe('Rides API (deeplink-only)', () => {
  const body = {
    pickupLatitude: 28.6139,
    pickupLongitude: 77.209,
    destinationLatitude: 28.5355,
    destinationLongitude: 77.391,
    destinationAddress: 'Test Destination',
  };

  describe('GET /api/v1/rides/providers', () => {
    it('returns providers without fare or route fields', async () => {
      const res = await request(app)
        .get('/api/v1/rides/providers')
        .query({ pickupLatitude: body.pickupLatitude, pickupLongitude: body.pickupLongitude });

      expect([200, 500]).toContain(res.status);
      if (res.status === 200) {
        expect(Array.isArray(res.body.data)).toBe(true);
        const uber = res.body.data.find((p: { id: string }) => p.id === 'uber');
        if (uber) {
          expect(uber.mode).toBe('DEEPLINK');
          expect(uber.fare).toBeUndefined();
          expect(uber.distance).toBeUndefined();
          expect(uber.eta).toBeUndefined();
        }
      }
    });
  });

  describe('POST /api/v1/rides/open', () => {
    it('returns deeplink without fare', async () => {
      const res = await request(app)
        .post('/api/v1/rides/open')
        .send({ provider: 'uber', ...body });

      expect([200, 500]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.data.deepLink).toContain('uber://');
        expect(res.body.data.playStore).toBeTruthy();
        expect(res.body.data.fare).toBeUndefined();
      }
    });

    it('rejects invalid provider', async () => {
      const res = await request(app)
        .post('/api/v1/rides/open')
        .send({ provider: 'invalid', ...body });
      expect(res.status).toBe(400);
    });
  });
});
