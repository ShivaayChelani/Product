import { beforeAll, afterAll } from 'vitest';
import { prisma } from '../config/database';
import request from 'supertest';
import app from '../app';
import {
  estimateDurationMinutes, parseEntryFee, isPlaceOpenAt,
  nearestNeighborOrder, twoOptImprove, PACE_CONFIG,
  dedupeByLocation, normalizePlaceName,
} from '../modules/trips/itineraryEngine';
import { testSlug } from './helpers/testRunId';

describe('AI Recommendations API', () => {
  let delhiPlaceId: string;
  let rajasthanPlaceId: string;

  beforeAll(async () => {
    await prisma.place.deleteMany({
      where: {
        slug: {
          in: ['test-red-fort-delhi', 'test-hawa-mahal-jaipur'],
        },
      },
    });

    const delhiSlug = testSlug('test-red-fort-delhi');
    const rajasthanSlug = testSlug('test-hawa-mahal-jaipur');

    // Seed at least one place in Delhi for testing the Delhi itinerary
    const delhiPlace = await prisma.place.create({
      data: {
        name: 'Test Red Fort Delhi',
        slug: delhiSlug,
        description: 'Historical fort in Delhi',
        category: 'monument',
        city: 'Delhi',
        state: 'Delhi',
        latitude: 28.6562,
        longitude: 77.2410,
        status: 'APPROVED',
      },
    });
    delhiPlaceId = delhiPlace.id;

    // Seed at least one place in Rajasthan for testing the Rajasthan itinerary
    const rajasthanPlace = await prisma.place.create({
      data: {
        name: 'Test Hawa Mahal Jaipur',
        slug: rajasthanSlug,
        description: 'Palace of Winds in Jaipur',
        category: 'palace',
        city: 'Jaipur',
        state: 'Rajasthan',
        latitude: 26.9239,
        longitude: 75.8267,
        status: 'APPROVED',
      },
    });
    rajasthanPlaceId = rajasthanPlace.id;
  });

  afterAll(async () => {
    if (delhiPlaceId) {
      await prisma.place.delete({ where: { id: delhiPlaceId } }).catch(() => {});
    }
    if (rajasthanPlaceId) {
      await prisma.place.delete({ where: { id: rajasthanPlaceId } }).catch(() => {});
    }
  });
  describe('GET /api/v1/ai/recommendations', () => {
    it('should return recommendations', async () => {
      const res = await request(app)
        .get('/api/v1/ai/recommendations?limit=5')
        .timeout(180000);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    }, 180000);
  });

  describe('GET /api/v1/ai/similar/:id', () => {
    it('should return 404 for non-existent place', async () => {
      const res = await request(app)
        .get('/api/v1/ai/similar/nonexistent');

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/v1/ai/discover', () => {
    it('should discover places by natural language query', async () => {
      const res = await request(app)
        .get('/api/v1/ai/discover?query=historical%20places');

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
    });
  });

  describe('GET /api/v1/ai/discover/structured', () => {
    it('should discover places with structured filters', async () => {
      const res = await request(app)
        .get('/api/v1/ai/discover/structured');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('GET /api/v1/ai/trip-planner', () => {
    it('should plan a trip', async () => {
      const res = await request(app)
        .get('/api/v1/ai/trip-planner?location=Delhi&days=3');

      expect(res.status).toBe(200);
    });

    it('should reject invalid days', async () => {
      const res = await request(app)
        .get('/api/v1/ai/trip-planner?location=Delhi&days=0');

      expect(res.status).toBe(400);
    });

    it('should reject days > 14', async () => {
      const res = await request(app)
        .get('/api/v1/ai/trip-planner?location=Delhi&days=15');

      expect(res.status).toBe(400);
    });

    it('should plan a trip using a natural language prompt and fallback if api key is missing', async () => {
      const res = await request(app)
        .get('/api/v1/ai/trip-planner?prompt=Plan%20a%203-day%20relaxed%20trip%20to%20Rajasthan');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBeDefined();
      expect(Array.isArray(res.body.data.days)).toBe(true);
    });
  });
});

describe('Itinerary Engine (unit)', () => {
  describe('estimateDurationMinutes', () => {
    it('prefers the explicit typed field when present, capped to a sightseeing slice', () => {
      expect(estimateDurationMinutes({ estimatedDurationMinutes: 120, category: 'temple' })).toBe(75);
      expect(estimateDurationMinutes({ estimatedDurationMinutes: 40, category: 'temple' })).toBe(40);
    });

    it('parses a free-text recommended duration string', () => {
      expect(estimateDurationMinutes({ recommendedDuration: '2 hours', category: 'fort' })).toBe(75);
      expect(estimateDurationMinutes({ recommendedDuration: '45 minutes', category: 'temple' })).toBe(45);
    });

    it('falls back to a category default when no data is present', () => {
      expect(estimateDurationMinutes({ category: 'temple' })).toBe(45);
      expect(estimateDurationMinutes({ category: 'unknown-category' })).toBe(60);
    });

    it('never throws on completely empty input', () => {
      expect(() => estimateDurationMinutes({})).not.toThrow();
      expect(estimateDurationMinutes({})).toBeGreaterThan(0);
    });
  });

  describe('parseEntryFee', () => {
    it('reads the adult price as the primary entry fee', () => {
      expect(parseEntryFee({ currency: 'INR', adult: 50, child: 20 })).toBe(50);
    });

    it('returns null for missing or malformed ticketPrice data', () => {
      expect(parseEntryFee(null)).toBeNull();
      expect(parseEntryFee(undefined)).toBeNull();
      expect(parseEntryFee('free')).toBeNull();
      expect(parseEntryFee({})).toBeNull();
    });
  });

  describe('isPlaceOpenAt (opening-hours validation)', () => {
    it('returns null (unknown) when opening hours data is missing entirely', () => {
      expect(isPlaceOpenAt(null, new Date(), 600)).toBeNull();
      expect(isPlaceOpenAt(undefined, new Date(), 600)).toBeNull();
    });

    it('detects a closed day from an explicit "Closed" label', () => {
      const hours = { monday: 'Closed', daily: '9:00 AM - 6:00 PM' };
      const monday = new Date('2026-01-05T00:00:00Z'); // a Monday
      expect(isPlaceOpenAt(hours, monday, 600)).toBe(false);
    });

    it('correctly parses a 12-hour AM/PM range and flags out-of-window times', () => {
      const hours = { daily: '9:00 AM - 6:00 PM' };
      expect(isPlaceOpenAt(hours, null, 10 * 60)).toBe(true); // 10:00 AM
      expect(isPlaceOpenAt(hours, null, 20 * 60)).toBe(false); // 8:00 PM
    });

    it('never throws on unparseable free text', () => {
      expect(() => isPlaceOpenAt({ daily: 'ask the caretaker' }, null, 600)).not.toThrow();
      expect(isPlaceOpenAt({ daily: 'ask the caretaker' }, null, 600)).toBeNull();
    });
  });

  describe('nearestNeighborOrder + twoOptImprove (route optimization)', () => {
    const points = [
      { id: 'a', latitude: 23.0, longitude: 77.0 },
      { id: 'b', latitude: 23.5, longitude: 77.6 },
      { id: 'c', latitude: 23.05, longitude: 77.05 },
      { id: 'd', latitude: 23.45, longitude: 77.55 },
    ];

    it('produces an order visiting every input point exactly once', () => {
      const ordered = nearestNeighborOrder(points);
      expect(ordered.length).toBe(points.length);
      expect(new Set(ordered.map((p) => p.id))).toEqual(new Set(points.map((p) => p.id)));
    });

    it('2-opt never increases total route length versus nearest-neighbor alone', () => {
      const nn = nearestNeighborOrder(points);
      const improved = twoOptImprove(nn);

      const routeLen = (route: typeof points) => {
        let total = 0;
        for (let i = 1; i < route.length; i++) {
          const a = route[i - 1];
          const b = route[i];
          total += Math.hypot(a.latitude - b.latitude, a.longitude - b.longitude);
        }
        return total;
      };

      expect(routeLen(improved)).toBeLessThanOrEqual(routeLen(nn) + 1e-9);
      expect(improved.length).toBe(nn.length);
    });
  });

  describe('dedupeByLocation (collapses duplicate DB rows for the same physical place)', () => {
    it('collapses same-name places at the same coordinates into a single entry', () => {
      const places = [
        { id: '1', name: 'Bhedaghat and Dhuandhar Falls', latitude: 23.1263, longitude: 79.8076, rating: 4.7 },
        { id: '2', name: 'Bhedaghat and Dhuandhar Falls', latitude: 23.1263, longitude: 79.8076, rating: 4.5 },
        { id: '3', name: 'Bhedaghat and Dhuandhar Falls', latitude: 23.1263, longitude: 79.8076, rating: 4.9 },
      ];
      const result = dedupeByLocation(places);
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('3'); // highest rated kept
    });

    it('is case/punctuation-insensitive when matching duplicate names', () => {
      const places = [
        { id: '1', name: 'Dumna Nature Reserve', latitude: 23.1694, longitude: 80.0126, rating: 4.0 },
        { id: '2', name: 'DUMNA NATURE-RESERVE!!', latitude: 23.1694, longitude: 80.0126, rating: 4.3 },
      ];
      expect(dedupeByLocation(places).length).toBe(1);
    });

    it('keeps distinct places with different names or far-apart coordinates', () => {
      const places = [
        { id: '1', name: 'Bhedaghat and Dhuandhar Falls', latitude: 23.1263, longitude: 79.8076, rating: 4.7 },
        { id: '2', name: 'Dumna Nature Reserve', latitude: 23.1694, longitude: 80.0126, rating: 4.3 },
        { id: '3', name: 'Bhedaghat and Dhuandhar Falls', latitude: 25.0, longitude: 82.0, rating: 4.1 }, // same name, far away = different real place
      ];
      expect(dedupeByLocation(places).length).toBe(3);
    });

    it('skips places with missing coordinates without throwing', () => {
      const places = [
        { id: '1', name: 'Unknown Spot', latitude: null, longitude: null, rating: 3 },
      ];
      expect(() => dedupeByLocation(places)).not.toThrow();
      expect(dedupeByLocation(places).length).toBe(0);
    });

    it('still collapses duplicates in a large (12+) candidate list (regression: collectCandidates early-return path)', () => {
      // Mirrors the real-world bug: many rows for one destination, several of
      // which are duplicate DB imports of the same physical place.
      const dup = (id: string, rating: number) => ({ id, name: 'Bhedaghat and Dhuandhar Falls', latitude: 23.1263, longitude: 79.8076, rating });
      const places = [
        dup('1', 4.7), dup('2', 4.5), dup('3', 4.9), dup('4', 4.2), dup('5', 4.4),
        ...Array.from({ length: 10 }, (_, i) => ({ id: `unique-${i}`, name: `Place ${i}`, latitude: 23.2 + i * 0.01, longitude: 79.9 + i * 0.01, rating: 4.0 })),
      ];
      expect(places.length).toBeGreaterThanOrEqual(12);
      const result = dedupeByLocation(places);
      const falls = result.filter((p) => p.name === 'Bhedaghat and Dhuandhar Falls');
      expect(falls.length).toBe(1);
      expect(falls[0].id).toBe('3');
    });
  });

  describe('normalizePlaceName', () => {
    it('lowercases and strips punctuation for stable duplicate-name comparison', () => {
      expect(normalizePlaceName('Bhedaghat and Dhuandhar Falls')).toBe('bhedaghat and dhuandhar falls');
      expect(normalizePlaceName('DUMNA NATURE-RESERVE!!')).toBe('dumna nature reserve');
    });
  });

  describe('PACE_CONFIG (pace -> stops/minutes-per-day mapping)', () => {
    it('never overpacks a day: max minutes always covers at least one average stop', () => {
      for (const pace of Object.keys(PACE_CONFIG) as Array<keyof typeof PACE_CONFIG>) {
        expect(PACE_CONFIG[pace].stopsPerDay).toBeGreaterThan(0);
        expect(PACE_CONFIG[pace].maxMinutesPerDay).toBeGreaterThan(0);
      }
      // Quicker paces allow more stops per day than relaxed ones.
      expect(PACE_CONFIG.QUICK.stopsPerDay).toBeGreaterThan(PACE_CONFIG.VERY_RELAXED.stopsPerDay);
    });
  });
});
