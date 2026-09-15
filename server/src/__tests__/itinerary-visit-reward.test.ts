import request from 'supertest';
import app from '../app';
import { getAuthToken } from './helpers/auth';
import { prisma } from '../config/database';
import { testSlug } from './helpers/testRunId';

/**
 * AUDIT: ITINERARY PLACE VISIT -> PALPOINTS REWARD
 *
 * Verifies that visiting an itinerary place awards the configured PalPoints
 * exactly once, is server-authoritative (GPS-validated), and cannot be
 * double-awarded by duplicates / concurrent requests / other users.
 */
describe('Itinerary visit -> PalPoints reward audit', () => {
  let userToken: string;
  let otherUserToken: string;
  let userId: string;
  let otherUserId: string;
  const city = 'RewardItinVille';
  const createdPlaceIds: string[] = [];

  let checkpointPointsAtRun: number;
  let completionPointsAtRun: number;

  const fixtures = [
    { name: 'RewardItin Fort', category: 'fort', lat: 22.0, lng: 79.0 },
    { name: 'RewardItin Temple', category: 'temple', lat: 22.0001, lng: 79.0001 },
    { name: 'RewardItin Lake', category: 'lake', lat: 22.05, lng: 79.05 },
  ];

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.ITINERARY_GPS_REWARDS_ENABLED;

    [userToken, otherUserToken] = await Promise.all([
      getAuthToken('USER'),
      getAuthToken('VENDOR'),
    ]);

    const me = await prisma.user.findFirst({ where: { email: 'user@palsafar.com' } });
    const other = await prisma.user.findFirst({ where: { email: 'streetstory@palsafar.com' } });
    if (!me || !other) throw new Error('Seeded test users missing');
    userId = me.id;
    otherUserId = other.id;

    // Remove stale fixtures from interrupted runs.
    await prisma.place.deleteMany({ where: { city } });

    for (const f of fixtures) {
      const place = await prisma.place.create({
        data: {
          name: f.name,
          slug: testSlug(`rewarditin-${f.category}`),
          description: `${f.name} reward audit fixture`,
          category: f.category,
          tags: ['heritage'],
          city,
          state: 'TestState',
          country: 'India',
          latitude: f.lat,
          longitude: f.lng,
          rating: 4.5,
          reviewCount: 5,
          popularityScore: 40,
          status: 'APPROVED',
          source: 'ADMIN',
        },
      });
      createdPlaceIds.push(place.id);
    }

    const checkpointRule = await prisma.pointRule.findUnique({ where: { key: 'itinerary_checkpoint' } });
    const completionRule = await prisma.pointRule.findUnique({ where: { key: 'itinerary_completion' } });
    checkpointPointsAtRun = checkpointRule?.points ?? 10;
    completionPointsAtRun = completionRule?.points ?? 100;
  }, 60000);

  afterAll(async () => {
    const trips = await prisma.tripPlan.findMany({
      where: { userId, destination: city },
      select: { id: true },
    });
    const tripIds = trips.map((t) => t.id);

    if (tripIds.length) {
      await prisma.walletTransaction.deleteMany({
        where: { userId, referenceId: { in: tripIds } },
      });
      const stops = await prisma.tripPlanStop.findMany({
        where: { tripPlanDay: { tripPlanId: { in: tripIds } } },
        select: { id: true },
      });
      await prisma.walletTransaction.deleteMany({
        where: { userId, referenceId: { in: stops.map((s) => s.id) } },
      });
      await prisma.tripPlanStop.deleteMany({ where: { tripPlanDay: { tripPlanId: { in: tripIds } } } });
      await prisma.tripPlanDay.deleteMany({ where: { tripPlanId: { in: tripIds } } });
      await prisma.tripPlan.deleteMany({ where: { id: { in: tripIds } } });
    }

    await prisma.place.deleteMany({ where: { id: { in: createdPlaceIds } } });
  });

  async function createStartedTrip(placeIndexes: number[]): Promise<{ tripId: string; stopIds: string[] }> {
    const res = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        title: 'Reward Audit Trip',
        destination: city,
        startDate: '2026-10-01',
        endDate: '2026-10-01',
      });
    expect(res.status).toBe(201);
    const tripId = res.body.data.id;
    const dayId = res.body.data.tripDays[0].id;

    const stopIds: string[] = [];
    for (const idx of placeIndexes) {
      const add = await request(app)
        .post(`/api/v1/trips/days/${dayId}/stops`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ placeId: createdPlaceIds[idx] });
      expect(add.status).toBe(201);
      stopIds.push(add.body.data.id);
    }

    const start = await request(app)
      .post(`/api/v1/trips/${tripId}/start`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(start.status).toBe(200);
    expect(start.body.data.status).toBe('ACTIVE');

    return { tripId, stopIds };
  }

  async function walletEarnsForReference(referenceId: string, referenceType: string) {
    return prisma.walletTransaction.findMany({
      where: { userId, referenceId, referenceType, type: 'EARN' },
    });
  }

  describe('A: valid visit awards the configured checkpoint reward', () => {
    it('awards itinerary_checkpoint once on an in-range GPS visit', async () => {
      const { tripId, stopIds } = await createStartedTrip([0, 1]);

      const res = await request(app)
        .post(`/api/v1/trips/stops/${stopIds[0]}/visit`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ latitude: 22.0, longitude: 79.0, accuracy: 10, timestamp: Date.now() });

      expect(res.status).toBe(200);
      expect(res.body.data.alreadyVerified).toBe(false);
      expect(res.body.data.checkpointReward).toEqual({
        points: checkpointPointsAtRun,
        awarded: true,
      });

      const earns = await walletEarnsForReference(stopIds[0], 'ITINERARY_CHECKPOINT');
      expect(earns).toHaveLength(1);
      expect(earns[0].amount).toBe(checkpointPointsAtRun);

      await cleanupTrip(tripId);
    });
  });

  describe('B: duplicates never double-award', () => {
    it('an identical repeat visit returns alreadyVerified and mints nothing new', async () => {
      const { tripId, stopIds } = await createStartedTrip([0, 1]);

      const visit = () =>
        request(app)
          .post(`/api/v1/trips/stops/${stopIds[0]}/visit`)
          .set('Authorization', `Bearer ${userToken}`)
          .send({ latitude: 22.0, longitude: 79.0, accuracy: 10, timestamp: Date.now() });

      const first = await visit();
      expect(first.body.data.checkpointReward.awarded).toBe(true);

      const repeat = await visit();
      expect(repeat.status).toBe(200);
      expect(repeat.body.data.alreadyVerified).toBe(true);
      expect(repeat.body.data.checkpointReward).toBeNull();

      const earns = await walletEarnsForReference(stopIds[0], 'ITINERARY_CHECKPOINT');
      expect(earns).toHaveLength(1);

      await cleanupTrip(tripId);
    });

    it('a second trip that reuses the same place still only pays per unique stop', async () => {
      const { tripId, stopIds } = await createStartedTrip([0, 1]);
      const res = await request(app)
        .post(`/api/v1/trips/stops/${stopIds[0]}/visit`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ latitude: 22.0, longitude: 79.0, accuracy: 10, timestamp: Date.now() });
      expect(res.body.data.checkpointReward.awarded).toBe(true);

      // A fresh stop id for the same physical place gets its own reference id.
      const otherTrip = await createStartedTrip([0, 1]);
      const r2 = await request(app)
        .post(`/api/v1/trips/stops/${otherTrip.stopIds[0]}/visit`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ latitude: 22.0, longitude: 79.0, accuracy: 10, timestamp: Date.now() });
      expect(r2.body.data.checkpointReward.awarded).toBe(true);

      expect(await walletEarnsForReference(stopIds[0], 'ITINERARY_CHECKPOINT')).toHaveLength(1);
      expect(await walletEarnsForReference(otherTrip.stopIds[0], 'ITINERARY_CHECKPOINT')).toHaveLength(1);

      await cleanupTrip(tripId);
      await cleanupTrip(otherTrip.tripId);
    });
  });

  describe('C: concurrent identical requests award exactly once', () => {
    it('only one checkpoint transaction exists after a burst of duplicates', async () => {
      const { tripId, stopIds } = await createStartedTrip([0, 1]);

      const body = { latitude: 22.0, longitude: 79.0, accuracy: 10, timestamp: Date.now() };
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          request(app)
            .post(`/api/v1/trips/stops/${stopIds[0]}/visit`)
            .set('Authorization', `Bearer ${userToken}`)
            .send(body),
        ),
      );

      const statuses = results.map((r) => r.status);
      expect(statuses.every((s) => s === 200)).toBe(true);

      const earns = await walletEarnsForReference(stopIds[0], 'ITINERARY_CHECKPOINT');
      expect(earns).toHaveLength(1);

      await cleanupTrip(tripId);
    });
  });

  describe('D: completing the last stop awards the completion bonus once', () => {
    it('awards itinerary_completion when every required stop is visited', async () => {
      const { tripId, stopIds } = await createStartedTrip([0, 1]);

      const visit1 = await request(app)
        .post(`/api/v1/trips/stops/${stopIds[0]}/visit`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ latitude: 22.0, longitude: 79.0, accuracy: 10, timestamp: Date.now() });
      expect(visit1.body.data.completionBonus).toBeNull();

      // Travel-speed gate compares consecutive checkpoint timestamps; give the
      // second visit enough elapsed time to be physically plausible.
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const visit2 = await request(app)
        .post(`/api/v1/trips/stops/${stopIds[1]}/visit`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ latitude: 22.0001, longitude: 79.0001, accuracy: 10, timestamp: Date.now() });

      expect(visit2.status).toBe(200);
      expect(visit2.body.data.completionBonus).toEqual({
        points: completionPointsAtRun,
        awarded: true,
      });

      const trip = await request(app)
        .get(`/api/v1/trips/${tripId}`)
        .set('Authorization', `Bearer ${userToken}`);
      expect(trip.body.data.status).toBe('COMPLETED');

      const bonus = await walletEarnsForReference(tripId, 'ITINERARY_COMPLETION');
      expect(bonus).toHaveLength(1);
      expect(bonus[0].amount).toBe(completionPointsAtRun);

      await cleanupTrip(tripId);
    });

    it('concurrent completion-burst only yields one bonus', async () => {
      const { tripId, stopIds } = await createStartedTrip([0, 1]);

      await request(app)
        .post(`/api/v1/trips/stops/${stopIds[0]}/visit`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ latitude: 22.0, longitude: 79.0, accuracy: 10, timestamp: Date.now() });

      await new Promise((resolve) => setTimeout(resolve, 1100));

      const body = { latitude: 22.0001, longitude: 79.0001, accuracy: 10, timestamp: Date.now() };
      await Promise.all(
        Array.from({ length: 3 }, () =>
          request(app)
            .post(`/api/v1/trips/stops/${stopIds[1]}/visit`)
            .set('Authorization', `Bearer ${userToken}`)
            .send(body),
        ),
      );

      const bonuses = await walletEarnsForReference(tripId, 'ITINERARY_COMPLETION');
      expect(bonuses).toHaveLength(1);

      await cleanupTrip(tripId);
    });
  });

  describe('E: server-authoritative GPS validation blocks abuse', () => {
    it('rejects a visit outside the checkpoint radius', async () => {
      const { tripId, stopIds } = await createStartedTrip([0, 1]);

      const res = await request(app)
        .post(`/api/v1/trips/stops/${stopIds[0]}/visit`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ latitude: 22.1, longitude: 79.1, accuracy: 10, timestamp: Date.now() });

      expect(res.status).toBe(400);
      expect(await walletEarnsForReference(stopIds[0], 'ITINERARY_CHECKPOINT')).toHaveLength(0);

      await cleanupTrip(tripId);
    });

    it('rejects low-accuracy GPS', async () => {
      const { tripId, stopIds } = await createStartedTrip([0, 1]);

      const res = await request(app)
        .post(`/api/v1/trips/stops/${stopIds[0]}/visit`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ latitude: 22.0, longitude: 79.0, accuracy: 1000, timestamp: Date.now() });

      expect(res.status).toBe(400);
      expect(await walletEarnsForReference(stopIds[0], 'ITINERARY_CHECKPOINT')).toHaveLength(0);

      await cleanupTrip(tripId);
    });

    it('rejects a stale GPS timestamp', async () => {
      const { tripId, stopIds } = await createStartedTrip([0, 1]);

      const res = await request(app)
        .post(`/api/v1/trips/stops/${stopIds[0]}/visit`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ latitude: 22.0, longitude: 79.0, accuracy: 10, timestamp: Date.now() - 30 * 60 * 1000 });

      expect(res.status).toBe(400);
      expect(await walletEarnsForReference(stopIds[0], 'ITINERARY_CHECKPOINT')).toHaveLength(0);

      await cleanupTrip(tripId);
    });
  });

  describe('F: authz and ownership', () => {
    it('rejects unauthenticated visits', async () => {
      const { tripId, stopIds } = await createStartedTrip([0, 1]);

      const res = await request(app)
        .post(`/api/v1/trips/stops/${stopIds[0]}/visit`)
        .send({ latitude: 22.0, longitude: 79.0, accuracy: 10 });
      expect(res.status).toBe(401);

      await cleanupTrip(tripId);
    });

    it('rejects another user visiting someone else’s stop', async () => {
      const { tripId, stopIds } = await createStartedTrip([0, 1]);

      const res = await request(app)
        .post(`/api/v1/trips/stops/${stopIds[0]}/visit`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .send({ latitude: 22.0, longitude: 79.0, accuracy: 10, timestamp: Date.now() });

      expect(res.status).toBe(403);
      expect(await walletEarnsForReference(stopIds[0], 'ITINERARY_CHECKPOINT')).toHaveLength(0);

      await cleanupTrip(tripId);
    });

    it('rejects a stop that belongs to no trip of the caller (random id)', async () => {
      const res = await request(app)
        .post('/api/v1/trips/stops/does-not-exist/visit')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ latitude: 22.0, longitude: 79.0, accuracy: 10, timestamp: Date.now() });
      expect(res.status).toBe(404);
    });

    it('rejects visiting a skipped stop', async () => {
      const { tripId, stopIds } = await createStartedTrip([0, 1]);

      await request(app)
        .post(`/api/v1/trips/stops/${stopIds[0]}/skip`)
        .set('Authorization', `Bearer ${userToken}`);

      const res = await request(app)
        .post(`/api/v1/trips/stops/${stopIds[0]}/visit`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ latitude: 22.0, longitude: 79.0, accuracy: 10, timestamp: Date.now() });

      expect(res.status).toBe(400);
      expect(await walletEarnsForReference(stopIds[0], 'ITINERARY_CHECKPOINT')).toHaveLength(0);

      await cleanupTrip(tripId);
    });
  });

  async function cleanupTrip(tripId: string) {
    await prisma.walletTransaction.deleteMany({
      where: { userId, referenceId: tripId },
    });
    const stops = await prisma.tripPlanStop.findMany({
      where: { tripPlanDay: { tripPlanId: tripId } },
      select: { id: true },
    });
    await prisma.walletTransaction.deleteMany({
      where: { userId, referenceId: { in: stops.map((s) => s.id) } },
    });
    await prisma.tripPlanStop.deleteMany({ where: { tripPlanDay: { tripPlanId: tripId } } });
    await prisma.tripPlanDay.deleteMany({ where: { tripPlanId: tripId } });
    await prisma.tripPlan.delete({ where: { id: tripId } });
  }
});