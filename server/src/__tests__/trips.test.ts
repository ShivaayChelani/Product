import request from 'supertest';
import app from '../app';
import { getAuthToken } from './helpers/auth';
import { prisma } from '../config/database';
import { testSlug } from './helpers/testRunId';

describe('Trips / AI Itinerary API', () => {
  let userToken: string;
  let otherUserToken: string;
  let userId: string;
  let placeIds: string[] = [];
  const testCity = 'ItinTestVille';

  beforeAll(async () => {
    [userToken, otherUserToken] = await Promise.all([
      getAuthToken('USER'),
      getAuthToken('VENDOR')
    ]);

    const user = await prisma.user.findFirst({ where: { email: 'user@palsafar.com' } });
    if (!user) throw new Error('Seeded test user user@palsafar.com not found');
    userId = user.id;

    // Remove stale fixtures from interrupted prior runs (fixed slugs from older tests).
    await prisma.place.deleteMany({ where: { city: testCity } });
    await prisma.place.deleteMany({
      where: {
        slug: {
          in: [
            'itintest-heritage-fort',
            'itintest-old-temple',
            'itintest-waterfall',
            'itintest-bazaar',
            'itintest-museum',
            'itintest-lakeview',
          ],
        },
      },
    });

    // Seed a small, deterministic cluster of approved places for a unique test city
    // so AI generation / quick-add have real candidates to work with.
    const fixtures = [
      { name: 'ItinTest Heritage Fort', category: 'fort', lat: 22.0, lng: 79.0, rating: 4.6, fee: 50, tags: ['heritage'] },
      { name: 'ItinTest Old Temple', category: 'temple', lat: 22.01, lng: 79.01, rating: 4.2, fee: null, tags: ['heritage', 'temples'] },
      { name: 'ItinTest Waterfall', category: 'waterfall', lat: 22.05, lng: 79.05, rating: 4.8, fee: null, tags: ['nature'] },
      { name: 'ItinTest Bazaar', category: 'market', lat: 22.02, lng: 79.02, rating: 4.0, fee: null, tags: ['shopping', 'food'] },
      { name: 'ItinTest Museum', category: 'museum', lat: 22.03, lng: 79.03, rating: 4.3, fee: 500, tags: ['heritage'] },
      { name: 'ItinTest Lakeview', category: 'lake', lat: 22.04, lng: 79.04, rating: 4.1, fee: null, tags: ['nature'] },
    ];

    const created = await Promise.all(
      fixtures.map((f) =>
        prisma.place.create({
          data: {
            name: f.name,
            slug: testSlug(`itintest-${f.category}`),
            description: `${f.name} is a test fixture place used for itinerary integration tests.`,
            category: f.category,
            tags: f.tags,
            city: testCity,
            state: 'TestState',
            country: 'India',
            latitude: f.lat,
            longitude: f.lng,
            rating: f.rating,
            reviewCount: 10,
            popularityScore: 40,
            status: 'APPROVED',
            source: 'ADMIN',
            ticketPrice: f.fee !== null ? { currency: 'INR', adult: f.fee } : undefined,
          },
        })
      )
    );
    placeIds = created.map((p) => p.id);
  }, 60000);

  afterAll(async () => {
    // Clean up everything created for this test suite, in FK-safe order.
    await prisma.aiGenerationLog.deleteMany({ where: { userId } });
    const trips = await prisma.tripPlan.findMany({ where: { userId, destination: { contains: 'ItinTest' } }, select: { id: true } });
    const tripIds = trips.map((t) => t.id);
    if (tripIds.length) {
      await prisma.tripPlanStop.deleteMany({ where: { tripPlanDay: { tripPlanId: { in: tripIds } } } });
      await prisma.tripPlanDay.deleteMany({ where: { tripPlanId: { in: tripIds } } });
      await prisma.tripPlan.deleteMany({ where: { id: { in: tripIds } } });
    }
    await prisma.tripPlan.deleteMany({ where: { userId, destination: testCity } });
    await prisma.place.deleteMany({ where: { id: { in: placeIds } } });
  });

  describe('CRUD', () => {
    let tripId: string;

    it('creates a manual trip with day rows', async () => {
      const res = await request(app)
        .post('/api/v1/trips')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'ItinTest Manual Trip',
          destination: testCity,
          startDate: '2026-08-01',
          endDate: '2026-08-03',
          interests: ['heritage'],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('DRAFT');
      expect(res.body.data.tripDays.length).toBe(3);
      tripId = res.body.data.id;
    });

    it('fetches the trip by id for the owner', async () => {
      const res = await request(app).get(`/api/v1/trips/${tripId}`).set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(tripId);
    });

    it('rejects access from a user who is not the owner or a collaborator', async () => {
      const res = await request(app).get(`/api/v1/trips/${tripId}`).set('Authorization', `Bearer ${otherUserToken}`);
      expect(res.status).toBe(404);
    });

    it('updates trip fields and reconciles day count when the range grows', async () => {
      const res = await request(app)
        .patch(`/api/v1/trips/${tripId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ startDate: '2026-08-01', endDate: '2026-08-05' });

      expect(res.status).toBe(200);
      expect(res.body.data.tripDays.length).toBe(5);
    });

    it('rejects mutation attempts by a non-owner/non-collaborator', async () => {
      const res = await request(app)
        .patch(`/api/v1/trips/${tripId}`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .send({ title: 'Hijacked' });

      expect([403, 404]).toContain(res.status);
    });

    it('duplicates a trip as a new draft', async () => {
      const res = await request(app).post(`/api/v1/trips/${tripId}/duplicate`).set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('DRAFT');
      expect(res.body.data.id).not.toBe(tripId);

      await prisma.tripPlan.delete({ where: { id: res.body.data.id } });
    });

    it('deletes the trip', async () => {
      const res = await request(app).delete(`/api/v1/trips/${tripId}`).set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(204);

      const check = await request(app).get(`/api/v1/trips/${tripId}`).set('Authorization', `Bearer ${userToken}`);
      expect(check.status).toBe(404);
    });
  });

  describe('Stops: add / duplicate prevention / reorder / delete', () => {
    let tripId: string;
    let dayId: string;
    let stopId: string;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/v1/trips')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ title: 'ItinTest Stops Trip', destination: testCity, startDate: '2026-09-01', endDate: '2026-09-01' });
      tripId = res.body.data.id;
      dayId = res.body.data.tripDays[0].id;
    });

    afterAll(async () => {
      await prisma.tripPlanStop.deleteMany({ where: { tripPlanDay: { tripPlanId: tripId } } });
      await prisma.tripPlanDay.deleteMany({ where: { tripPlanId: tripId } });
      await prisma.tripPlan.delete({ where: { id: tripId } });
    });

    it('adds a stop by place id, resolving to the real place row', async () => {
      const res = await request(app)
        .post(`/api/v1/trips/days/${dayId}/stops`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ placeId: placeIds[0] });

      expect(res.status).toBe(201);
      expect(res.body.data.placeId).toBe(placeIds[0]);
      stopId = res.body.data.id;
    });

    it('rejects adding the same place to the same day twice', async () => {
      const res = await request(app)
        .post(`/api/v1/trips/days/${dayId}/stops`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ placeId: placeIds[0] });

      expect(res.status).toBe(409);
    });

    it('adds a second stop and reorders both', async () => {
      const add = await request(app)
        .post(`/api/v1/trips/days/${dayId}/stops`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ placeId: placeIds[1] });
      expect(add.status).toBe(201);
      const secondStopId = add.body.data.id;

      const reorder = await request(app)
        .patch(`/api/v1/trips/days/${dayId}/stops/reorder`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ stopIds: [secondStopId, stopId] });

      expect(reorder.status).toBe(200);
      const trip = await request(app).get(`/api/v1/trips/${tripId}`).set('Authorization', `Bearer ${userToken}`);
      const stops = trip.body.data.tripDays[0].stops;
      expect(stops[0].id).toBe(secondStopId);
      expect(stops[1].id).toBe(stopId);
    });

    it('deletes a stop and compacts remaining order values', async () => {
      const res = await request(app).delete(`/api/v1/trips/stops/${stopId}`).set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(204);

      const trip = await request(app).get(`/api/v1/trips/${tripId}`).set('Authorization', `Bearer ${userToken}`);
      expect(trip.body.data.tripDays[0].stops.length).toBe(1);
      expect(trip.body.data.tripDays[0].stops[0].order).toBe(0);
    });

    it('rejects stop mutations from a non-collaborator', async () => {
      const res = await request(app)
        .post(`/api/v1/trips/days/${dayId}/stops`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .send({ placeId: placeIds[2] });

      expect([403, 404]).toContain(res.status);
    });
  });

  describe('Generate (schedule) & Optimize', () => {
    let tripId: string;
    let dayId: string;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/v1/trips')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ title: 'ItinTest Generate Trip', destination: testCity, startDate: '2026-09-10', endDate: '2026-09-10' });
      tripId = res.body.data.id;
      dayId = res.body.data.tripDays[0].id;

      for (const placeId of placeIds.slice(0, 4)) {
        await request(app)
          .post(`/api/v1/trips/days/${dayId}/stops`)
          .set('Authorization', `Bearer ${userToken}`)
          .send({ placeId });
      }
    });

    afterAll(async () => {
      await prisma.tripPlanStop.deleteMany({ where: { tripPlanDay: { tripPlanId: tripId } } });
      await prisma.tripPlanDay.deleteMany({ where: { tripPlanId: tripId } });
      await prisma.tripPlan.delete({ where: { id: tripId } });
    });

    it('schedules stops with real start/end times and durations', async () => {
      const res = await request(app)
        .post(`/api/v1/trips/${tripId}/generate`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ pace: 'moderate' });

      expect(res.status).toBe(200);
      const stops = res.body.data.tripDays[0].stops;
      expect(stops.length).toBeGreaterThan(0);
      for (const stop of stops) {
        expect(stop.startTime).toBeTruthy();
        expect(stop.duration).toBeGreaterThan(0);
      }
    });

    it('optimizes the route and populates distanceFromPrev', async () => {
      const res = await request(app)
        .post(`/api/v1/trips/${tripId}/optimize`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ strategy: 'shortest' });

      expect(res.status).toBe(200);
      expect(typeof res.body.data.totalDistance).toBe('number');
    });

    it('rejects generate/optimize from a non-collaborator', async () => {
      const gen = await request(app)
        .post(`/api/v1/trips/${tripId}/generate`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .send({});
      expect([403, 404]).toContain(gen.status);

      const opt = await request(app)
        .post(`/api/v1/trips/${tripId}/optimize`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .send({});
      expect([403, 404]).toContain(opt.status);
    });
  });

  describe('AI generation (POST /trips/ai-generate)', () => {
    let generatedTripId: string;

    afterAll(async () => {
      if (generatedTripId) {
        await prisma.tripPlanStop.deleteMany({ where: { tripPlanDay: { tripPlanId: generatedTripId } } });
        await prisma.tripPlanDay.deleteMany({ where: { tripPlanId: generatedTripId } });
        await prisma.tripPlan.deleteMany({ where: { id: generatedTripId } });
      }
    });

    it('generates and persists a full itinerary for a real destination', async () => {
      const res = await request(app)
        .post('/api/v1/trips/ai-generate')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          destination: testCity,
          days: 2,
          pace: 'BALANCED',
          travelers: 'SOLO',
          budget: 'MEDIUM',
          interests: ['heritage', 'nature'],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.trip.generationSource).toBe('AI_PROMPT');
      expect(res.body.data.trip.tripDays.length).toBe(2);
      const allStops = res.body.data.trip.tripDays.flatMap((d: any) => d.stops);
      expect(allStops.length).toBeGreaterThan(0);

      const day1Stops = res.body.data.trip.tripDays.find((d: any) => d.dayNumber === 1)?.stops?.length ?? 0;
      const day2Stops = res.body.data.trip.tripDays.find((d: any) => d.dayNumber === 2)?.stops?.length ?? 0;
      if (allStops.length >= 2) {
        expect(day1Stops, 'multi-day AI should place stops on Day 1').toBeGreaterThan(0);
        expect(day2Stops, 'multi-day AI should distribute stops onto Day 2').toBeGreaterThan(0);
      }

      const placeIdsInPlan = allStops.map((s: any) => s.placeId);
      expect(new Set(placeIdsInPlan).size).toBe(placeIdsInPlan.length); // no duplicates anywhere in the trip

      generatedTripId = res.body.data.trip.id;
    });

    it('persists AI day assignments across refetch', async () => {
      expect(generatedTripId).toBeTruthy();
      const refetch = await request(app)
        .get(`/api/v1/trips/${generatedTripId}`)
        .set('Authorization', `Bearer ${userToken}`);
      expect(refetch.status).toBe(200);
      expect(refetch.body.data.tripDays.length).toBe(2);
      const before = refetch.body.data.tripDays.map((d: any) => ({
        dayNumber: d.dayNumber,
        stopIds: (d.stops || []).map((s: any) => s.placeId).sort(),
      }));
      const again = await request(app)
        .get(`/api/v1/trips/${generatedTripId}`)
        .set('Authorization', `Bearer ${userToken}`);
      expect(again.body.data.tripDays.map((d: any) => ({
        dayNumber: d.dayNumber,
        stopIds: (d.stops || []).map((s: any) => s.placeId).sort(),
      }))).toEqual(before);
    });

    it('1-day AI trip keeps all stops on Day 1 only', async () => {
      const res = await request(app)
        .post('/api/v1/trips/ai-generate')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          destination: testCity,
          days: 1,
          pace: 'BALANCED',
          travelers: 'SOLO',
          budget: 'MEDIUM',
          interests: ['heritage'],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.trip.tripDays.length).toBe(1);
      const day1Count = res.body.data.trip.tripDays[0]?.stops?.length ?? 0;
      const total = res.body.data.trip.tripDays.flatMap((d: any) => d.stops).length;
      expect(day1Count).toBe(total);
      expect(day1Count).toBeGreaterThan(0);

      await prisma.tripPlanStop.deleteMany({ where: { tripPlanDay: { tripPlanId: res.body.data.trip.id } } });
      await prisma.tripPlanDay.deleteMany({ where: { tripPlanId: res.body.data.trip.id } });
      await prisma.tripPlan.deleteMany({ where: { id: res.body.data.trip.id } });
    });

    it('accepts legacy pace aliases like moderate without validation failure', async () => {
      const res = await request(app)
        .post('/api/v1/trips/ai-generate')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          destination: testCity,
          days: 1,
          pace: 'moderate',
          travelers: 'solo',
          budget: 'standard',
          interests: ['heritage'],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.trip.pace).toBe('BALANCED');
      expect(res.body.data.trip.travelers).toBe('SOLO');
      expect(res.body.data.trip.budget).toBe('MEDIUM');

      await prisma.tripPlanStop.deleteMany({ where: { tripPlanDay: { tripPlanId: res.body.data.trip.id } } });
      await prisma.tripPlanDay.deleteMany({ where: { tripPlanId: res.body.data.trip.id } });
      await prisma.tripPlan.deleteMany({ where: { id: res.body.data.trip.id } });
    });

    it('excludes high-fee places when budget is LOW', async () => {
      const res = await request(app)
        .post('/api/v1/trips/ai-generate')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ destination: testCity, days: 1, pace: 'QUICK', travelers: 'SOLO', budget: 'LOW', interests: [] });

      expect(res.status).toBe(201);
      const allStops = res.body.data.trip.tripDays.flatMap((d: any) => d.stops);
      const museumStop = allStops.find((s: any) => s.placeId === placeIds[4]); // ItinTest Museum, fee=500
      expect(museumStop).toBeUndefined();

      await prisma.tripPlanStop.deleteMany({ where: { tripPlanDay: { tripPlanId: res.body.data.trip.id } } });
      await prisma.tripPlanDay.deleteMany({ where: { tripPlanId: res.body.data.trip.id } });
      await prisma.tripPlan.delete({ where: { id: res.body.data.trip.id } });
    });

    it('handles an unknown destination gracefully — never a 500, never an orphaned trip on failure', async () => {
      const res = await request(app)
        .post('/api/v1/trips/ai-generate')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ destination: 'Nonexistent Place Zyxwvutsrq', days: 1, pace: 'BALANCED', travelers: 'SOLO', budget: 'MEDIUM', interests: [] });

      // Unresolved destinations must fail closed (422) — never silently fill another city's places.
      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      const orphan = await prisma.tripPlan.findFirst({ where: { userId, destination: 'Nonexistent Place Zyxwvutsrq' } });
      expect(orphan).toBeNull();
    });

    it('keeps Nainital itineraries in Uttarakhand — never mixes in Bhopal/MP places', async () => {
      const res = await request(app)
        .post('/api/v1/trips/ai-generate')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          destination: 'Nainital',
          days: 2,
          pace: 'BALANCED',
          travelers: 'SOLO',
          budget: 'MEDIUM',
          interests: ['nature', 'heritage'],
        });

      // Thin seed coverage may still produce a valid trip (nearby Uttarakhand) or 422 if empty.
      expect([201, 422]).toContain(res.status);
      if (res.status !== 201) return;

      const trip = res.body.data.trip;
      const stops = (trip.tripDays || []).flatMap((d: any) => d.stops || []);
      expect(stops.length).toBeGreaterThan(0);

      for (const stop of stops) {
        const city = (stop.place?.city || '').toLowerCase();
        const state = (stop.place?.state || '').toLowerCase();
        expect(city).not.toContain('bhopal');
        expect(city).not.toContain('jabalpur');
        expect(city).not.toContain('indore');
        // Must stay in the hills — Uttarakhand or an empty/unknown tag still near the lake.
        if (state) {
          expect(['uttarakhand', 'uttrakhand']).toContain(state);
        }
        if (stop.place?.latitude != null && stop.place?.longitude != null) {
          const dLat = Math.abs(stop.place.latitude - 29.3919);
          const dLng = Math.abs(stop.place.longitude - 79.4542);
          expect(dLat).toBeLessThan(1.0);
          expect(dLng).toBeLessThan(1.0);
        }
      }

      await prisma.tripPlanStop.deleteMany({ where: { tripPlanDay: { tripPlanId: trip.id } } });
      await prisma.tripPlanDay.deleteMany({ where: { tripPlanId: trip.id } });
      await prisma.tripPlan.delete({ where: { id: trip.id } });
    });

    it('rejects unauthenticated generation requests', async () => {
      const res = await request(app)
        .post('/api/v1/trips/ai-generate')
        .send({ destination: testCity, days: 1, pace: 'BALANCED', travelers: 'SOLO', budget: 'MEDIUM', interests: [] });

      expect(res.status).toBe(401);
    });

    it('rejects invalid input (days out of range)', async () => {
      const res = await request(app)
        .post('/api/v1/trips/ai-generate')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ destination: testCity, days: 100, pace: 'BALANCED', travelers: 'SOLO', budget: 'MEDIUM', interests: [] });

      expect(res.status).toBe(400);
    });
  });

  describe('Quick-add (POST /trips/quick-add)', () => {
    let quickAddTripId: string;

    afterAll(async () => {
      if (quickAddTripId) {
        await prisma.tripPlanStop.deleteMany({ where: { tripPlanDay: { tripPlanId: quickAddTripId } } });
        await prisma.tripPlanDay.deleteMany({ where: { tripPlanId: quickAddTripId } });
        await prisma.tripPlan.deleteMany({ where: { id: quickAddTripId } });
      }
    });

    it('creates a draft trip on first quick-add and pins the stop', async () => {
      const res = await request(app)
        .post('/api/v1/trips/quick-add')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ placeId: placeIds[0] });

      expect(res.status).toBe(201);
      expect(res.body.data.alreadyExists).toBe(false);
      expect(res.body.data.tripId).toBeTruthy();
      expect(res.body.data.stopId).toBeTruthy();
      quickAddTripId = res.body.data.tripId;

      const tripRes = await request(app)
        .get(`/api/v1/trips/${quickAddTripId}`)
        .set('Authorization', `Bearer ${userToken}`);
      expect(tripRes.body.data.status).toBe('DRAFT');
      const stop = tripRes.body.data.tripDays[0].stops.find((s: any) => s.placeId === placeIds[0]);
      expect(stop).toBeDefined();
      expect(stop.isPinned).toBe(true);
    });

    it('is idempotent: re-adding the same place no-ops instead of duplicating', async () => {
      const res = await request(app)
        .post('/api/v1/trips/quick-add')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ placeId: placeIds[0] });

      expect(res.status).toBe(200);
      expect(res.body.data.alreadyExists).toBe(true);
      expect(res.body.data.tripId).toBe(quickAddTripId);

      const tripRes = await request(app)
        .get(`/api/v1/trips/${quickAddTripId}`)
        .set('Authorization', `Bearer ${userToken}`);
      const stops = tripRes.body.data.tripDays.flatMap((d: any) => d.stops);
      const matching = stops.filter((s: any) => s.placeId === placeIds[0]);
      expect(matching.length).toBe(1);
    });

    it('appends further quick-added places to the same active draft', async () => {
      const res = await request(app)
        .post('/api/v1/trips/quick-add')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ placeId: placeIds[1] });

      expect(res.status).toBe(201);
      expect(res.body.data.tripId).toBe(quickAddTripId);

      const tripRes = await request(app)
        .get(`/api/v1/trips/${quickAddTripId}`)
        .set('Authorization', `Bearer ${userToken}`);
      const stops = tripRes.body.data.tripDays.flatMap((d: any) => d.stops);
      expect(stops.length).toBe(2);
    });

    it('rejects an unresolvable place id gracefully', async () => {
      const res = await request(app)
        .post('/api/v1/trips/quick-add')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ placeId: 'does-not-exist-at-all' });

      expect(res.status).toBe(404);
    });
  });

  describe('Start / Complete / Visit / Skip / Progress / History', () => {
    let tripId: string;
    const stopIds: string[] = [];

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/v1/trips')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ title: 'ItinTest Lifecycle Trip', destination: testCity, startDate: '2026-09-20', endDate: '2026-09-20' });
      tripId = res.body.data.id;
      const dayId = res.body.data.tripDays[0].id;

      for (const placeId of placeIds.slice(0, 2)) {
        const add = await request(app)
          .post(`/api/v1/trips/days/${dayId}/stops`)
          .set('Authorization', `Bearer ${userToken}`)
          .send({ placeId });
        stopIds.push(add.body.data.id);
      }
    });

    afterAll(async () => {
      await prisma.tripPlanStop.deleteMany({ where: { tripPlanDay: { tripPlanId: tripId } } });
      await prisma.tripPlanDay.deleteMany({ where: { tripPlanId: tripId } });
      await prisma.tripPlan.delete({ where: { id: tripId } });
    });

    it('rejects starting a trip with an empty itinerary', async () => {
      const empty = await request(app)
        .post('/api/v1/trips')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ title: 'ItinTest Empty Trip', destination: testCity, startDate: '2026-09-21', endDate: '2026-09-21' });

      const res = await request(app).post(`/api/v1/trips/${empty.body.data.id}/start`).set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(400);

      await prisma.tripPlanDay.deleteMany({ where: { tripPlanId: empty.body.data.id } });
      await prisma.tripPlan.delete({ where: { id: empty.body.data.id } });
    });

    it('starts the trip', async () => {
      const res = await request(app).post(`/api/v1/trips/${tripId}/start`).set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('ACTIVE');
    });

    it('reports progress with the correct totals', async () => {
      const res = await request(app).get(`/api/v1/trips/${tripId}/progress`).set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.totalStops).toBe(2);
      expect(res.body.data.visitedCount).toBe(0);
    });

    it('marks the first stop visited and advances progress', async () => {
      const res = await request(app)
        .post(`/api/v1/trips/stops/${stopIds[0]}/visit`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ latitude: 22.0, longitude: 79.0 });
      expect(res.status).toBe(200);
      expect(res.body.data.stop.visitedAt).toBeTruthy();

      const progress = await request(app).get(`/api/v1/trips/${tripId}/progress`).set('Authorization', `Bearer ${userToken}`);
      expect(progress.body.data.visitedCount).toBe(1);
    });

    it('skips the second stop and completes the trip automatically', async () => {
      const res = await request(app).post(`/api/v1/trips/stops/${stopIds[1]}/skip`).set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(200);

      const trip = await request(app).get(`/api/v1/trips/${tripId}`).set('Authorization', `Bearer ${userToken}`);
      expect(trip.body.data.status).toBe('COMPLETED');
    });

    it('appears in completed trip history', async () => {
      const res = await request(app)
        .get('/api/v1/trips/history/completed')
        .query({ limit: 100 })
        .set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.some((t: any) => t.id === tripId)).toBe(true);
    });
  });

  describe('City isolation, delete + re-add, IDOR', () => {
    const otherCity = 'ItinOtherVille';
    let cityBPlaceId: string;
    const createdTripIds: string[] = [];
    const createdPlaceIds: string[] = [];

    beforeAll(async () => {
      const place = await prisma.place.create({
        data: {
          name: 'ItinOther Fort',
          slug: testSlug('itinother-fort'),
          description: 'City B fixture for itinerary city-isolation tests.',
          category: 'fort',
          tags: ['heritage'],
          city: otherCity,
          state: 'OtherState',
          country: 'India',
          latitude: 26.9,
          longitude: 75.8,
          rating: 4.4,
          reviewCount: 8,
          popularityScore: 30,
          status: 'APPROVED',
          source: 'ADMIN',
        },
      });
      cityBPlaceId = place.id;
    });

    afterAll(async () => {
      if (createdTripIds.length) {
        await prisma.aiGenerationLog.updateMany({
          where: { tripPlanId: { in: createdTripIds } },
          data: { tripPlanId: null },
        });
        await prisma.tripPlanStop.deleteMany({ where: { tripPlanDay: { tripPlanId: { in: createdTripIds } } } });
        await prisma.tripPlanDay.deleteMany({ where: { tripPlanId: { in: createdTripIds } } });
        await prisma.tripPlan.deleteMany({ where: { id: { in: createdTripIds } } });
      }
      if (createdPlaceIds.length) {
        await prisma.place.deleteMany({ where: { id: { in: createdPlaceIds } } });
      }
      await prisma.place.deleteMany({ where: { id: cityBPlaceId } });
    });

    it('keeps same-city quick-adds on one itinerary and does not merge a second city', async () => {
      const first = await request(app)
        .post('/api/v1/trips/quick-add')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ placeId: placeIds[0] });
      expect(first.status).toBe(201);
      const cityATripId = first.body.data.tripId;
      createdTripIds.push(cityATripId);

      const secondSameCity = await request(app)
        .post('/api/v1/trips/quick-add')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ placeId: placeIds[2] });
      expect(secondSameCity.status).toBe(201);
      expect(secondSameCity.body.data.tripId).toBe(cityATripId);

      const cityB = await request(app)
        .post('/api/v1/trips/quick-add')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ placeId: cityBPlaceId });
      expect(cityB.status).toBe(201);
      expect(cityB.body.data.tripId).not.toBe(cityATripId);
      createdTripIds.push(cityB.body.data.tripId);

      const cityBAgain = await request(app)
        .post('/api/v1/trips/quick-add')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ placeId: cityBPlaceId });
      expect(cityBAgain.status).toBe(200);
      expect(cityBAgain.body.data.alreadyExists).toBe(true);
      expect(cityBAgain.body.data.tripId).toBe(cityB.body.data.tripId);

      const cityATrip = await request(app)
        .get(`/api/v1/trips/${cityATripId}`)
        .set('Authorization', `Bearer ${userToken}`);
      const cityAStops = cityATrip.body.data.tripDays.flatMap((d: any) => d.stops);
      expect(cityAStops.some((s: any) => s.placeId === cityBPlaceId)).toBe(false);
      expect(cityAStops.some((s: any) => s.placeId === placeIds[0])).toBe(true);
      expect(cityAStops.some((s: any) => s.placeId === placeIds[2])).toBe(true);
    });

    it('rejects an explicit tripId when the place city does not match (409 CITY_MISMATCH)', async () => {
      const created = await request(app)
        .post('/api/v1/trips')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'ItinTest City A Locked',
          destination: testCity,
          startDate: '2026-10-01',
          endDate: '2026-10-01',
        });
      const tripId = created.body.data.id;
      createdTripIds.push(tripId);

      await request(app)
        .post('/api/v1/trips/quick-add')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ placeId: placeIds[3], tripId });

      const mismatch = await request(app)
        .post('/api/v1/trips/quick-add')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ placeId: cityBPlaceId, tripId });

      expect(mismatch.status).toBe(409);
      expect(mismatch.body.code).toBe('CITY_MISMATCH');
    });

    it('deletes a trip that has AI generation logs by nulling the FK first', async () => {
      const created = await request(app)
        .post('/api/v1/trips')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'ItinTest Delete With AI Log',
          destination: testCity,
          startDate: '2026-10-02',
          endDate: '2026-10-02',
        });
      const tripId = created.body.data.id;

      const log = await prisma.aiGenerationLog.create({
        data: {
          userId,
          tripPlanId: tripId,
          prompt: { destination: testCity },
          provider: 'test',
          success: true,
        },
      });

      const res = await request(app)
        .delete(`/api/v1/trips/${tripId}`)
        .set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(204);

      const gone = await request(app)
        .get(`/api/v1/trips/${tripId}`)
        .set('Authorization', `Bearer ${userToken}`);
      expect(gone.status).toBe(404);

      const retained = await prisma.aiGenerationLog.findUnique({ where: { id: log.id } });
      expect(retained?.tripPlanId).toBeNull();
    });

    it('allows re-adding the same place after the previous trip is deleted', async () => {
      const first = await request(app)
        .post('/api/v1/trips/quick-add')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ placeId: placeIds[4] });
      expect([200, 201]).toContain(first.status);
      const oldTripId = first.body.data.tripId;
      createdTripIds.push(oldTripId);

      const del = await request(app)
        .delete(`/api/v1/trips/${oldTripId}`)
        .set('Authorization', `Bearer ${userToken}`);
      expect(del.status).toBe(204);

      const again = await request(app)
        .post('/api/v1/trips/quick-add')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ placeId: placeIds[4] });
      expect(again.status).toBe(201);
      expect(again.body.data.alreadyExists).toBe(false);
      expect(again.body.data.tripId).not.toBe(oldTripId);
      createdTripIds.push(again.body.data.tripId);
    });

    it('rejects delete and quick-add against another user\'s trip (IDOR)', async () => {
      const created = await request(app)
        .post('/api/v1/trips')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'ItinTest Owner Only',
          destination: testCity,
          startDate: '2026-10-03',
          endDate: '2026-10-03',
        });
      const tripId = created.body.data.id;
      createdTripIds.push(tripId);

      const otherDelete = await request(app)
        .delete(`/api/v1/trips/${tripId}`)
        .set('Authorization', `Bearer ${otherUserToken}`);
      expect(otherDelete.status).toBe(404);

      const otherAdd = await request(app)
        .post('/api/v1/trips/quick-add')
        .set('Authorization', `Bearer ${otherUserToken}`)
        .send({ placeId: placeIds[5], tripId });
      expect(otherAdd.status).toBe(404);

      const otherGet = await request(app)
        .get(`/api/v1/trips/${tripId}`)
        .set('Authorization', `Bearer ${otherUserToken}`);
      expect(otherGet.status).toBe(404);

      const ownerGet = await request(app)
        .get(`/api/v1/trips/${tripId}`)
        .set('Authorization', `Bearer ${userToken}`);
      expect(ownerGet.status).toBe(200);
    });

    it('rejects addStop when the place city does not match the trip destination', async () => {
      const created = await request(app)
        .post('/api/v1/trips')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'ItinTest City A AddStop',
          destination: testCity,
          startDate: '2026-10-05',
          endDate: '2026-10-05',
        });
      const tripId = created.body.data.id;
      const dayId = created.body.data.tripDays[0].id;
      createdTripIds.push(tripId);

      await request(app)
        .post('/api/v1/trips/quick-add')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ placeId: placeIds[0], tripId });

      const mismatch = await request(app)
        .post(`/api/v1/trips/days/${dayId}/stops`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ placeId: cityBPlaceId });

      expect(mismatch.status).toBe(409);
      expect(mismatch.body.code).toBe('CITY_MISMATCH');

      const trip = await request(app)
        .get(`/api/v1/trips/${tripId}`)
        .set('Authorization', `Bearer ${userToken}`);
      const stops = trip.body.data.tripDays.flatMap((d: any) => d.stops);
      expect(stops.some((s: any) => s.placeId === cityBPlaceId)).toBe(false);
    });

    it('does not attach an unknown-city place to a city-specific itinerary', async () => {
      const unknown = await prisma.place.create({
        data: {
          name: 'ItinUnknown Ruin',
          slug: testSlug('itinunknown-ruin'),
          description: 'Place with empty city for isolation tests.',
          category: 'ruins',
          tags: ['heritage'],
          city: '',
          state: '',
          country: 'India',
          latitude: 23.1,
          longitude: 79.9,
          rating: 4.0,
          reviewCount: 1,
          popularityScore: 10,
          status: 'APPROVED',
          source: 'ADMIN',
        },
      });

      const created = await request(app)
        .post('/api/v1/trips')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'ItinTest Locked City',
          destination: testCity,
          startDate: '2026-10-06',
          endDate: '2026-10-06',
        });
      const tripId = created.body.data.id;
      createdTripIds.push(tripId);

      await request(app)
        .post('/api/v1/trips/quick-add')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ placeId: placeIds[1], tripId });

      const mismatch = await request(app)
        .post('/api/v1/trips/quick-add')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ placeId: unknown.id, tripId });

      expect(mismatch.status).toBe(409);
      expect(mismatch.body.code).toBe('CITY_MISMATCH');

      createdPlaceIds.push(unknown.id);
    });

    it('creates independent city drafts and keeps place relations on the correct trip', async () => {
      const jabalpurPlace = await prisma.place.create({
        data: {
          name: 'ItinJabalpur Falls',
          slug: testSlug('itin-jbp-falls'),
          description: 'Jabalpur fixture.',
          category: 'waterfall',
          tags: ['nature'],
          city: 'Jabalpur',
          state: 'Madhya Pradesh',
          country: 'India',
          latitude: 23.13,
          longitude: 79.93,
          rating: 4.5,
          reviewCount: 4,
          popularityScore: 20,
          status: 'APPROVED',
          source: 'ADMIN',
        },
      });
      const ujjainPlace = await prisma.place.create({
        data: {
          name: 'ItinUjjain Temple',
          slug: testSlug('itin-ujjain-temple'),
          description: 'Ujjain fixture.',
          category: 'temple',
          tags: ['heritage'],
          city: 'Ujjain',
          state: 'Madhya Pradesh',
          country: 'India',
          latitude: 23.18,
          longitude: 75.78,
          rating: 4.7,
          reviewCount: 9,
          popularityScore: 40,
          status: 'APPROVED',
          source: 'ADMIN',
        },
      });

      const first = await request(app)
        .post('/api/v1/trips/quick-add')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ placeId: jabalpurPlace.id });
      expect(first.status).toBe(201);
      const jabalpurTripId = first.body.data.tripId;
      createdTripIds.push(jabalpurTripId);

      const second = await request(app)
        .post('/api/v1/trips/quick-add')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ placeId: ujjainPlace.id, tripId: jabalpurTripId });
      expect(second.status).toBe(409);
      expect(second.body.code).toBe('CITY_MISMATCH');

      const ujjain = await request(app)
        .post('/api/v1/trips/quick-add')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ placeId: ujjainPlace.id });
      expect(ujjain.status).toBe(201);
      expect(ujjain.body.data.tripId).not.toBe(jabalpurTripId);
      createdTripIds.push(ujjain.body.data.tripId);

      const jabalpurTrip = await request(app)
        .get(`/api/v1/trips/${jabalpurTripId}`)
        .set('Authorization', `Bearer ${userToken}`);
      const ujjainTrip = await request(app)
        .get(`/api/v1/trips/${ujjain.body.data.tripId}`)
        .set('Authorization', `Bearer ${userToken}`);

      const jabalpurStops = jabalpurTrip.body.data.tripDays.flatMap((d: any) => d.stops);
      const ujjainStops = ujjainTrip.body.data.tripDays.flatMap((d: any) => d.stops);
      expect(jabalpurStops.map((s: any) => s.placeId)).toEqual([jabalpurPlace.id]);
      expect(ujjainStops.map((s: any) => s.placeId)).toEqual([ujjainPlace.id]);
      expect(jabalpurTrip.body.data.destination.toLowerCase()).toContain('jabalpur');
      expect(ujjainTrip.body.data.destination.toLowerCase()).toContain('ujjain');

      createdPlaceIds.push(jabalpurPlace.id, ujjainPlace.id);
    });

    it('rejects mutations on a deleted trip', async () => {
      const created = await request(app)
        .post('/api/v1/trips')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'ItinTest Already Deleted',
          destination: testCity,
          startDate: '2026-10-04',
          endDate: '2026-10-04',
        });
      const tripId = created.body.data.id;

      await request(app).delete(`/api/v1/trips/${tripId}`).set('Authorization', `Bearer ${userToken}`);

      const addGone = await request(app)
        .post('/api/v1/trips/quick-add')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ placeId: placeIds[1], tripId });
      expect(addGone.status).toBe(404);

      const secondDelete = await request(app)
        .delete(`/api/v1/trips/${tripId}`)
        .set('Authorization', `Bearer ${userToken}`);
      expect(secondDelete.status).toBe(404);
    });
  });
});
