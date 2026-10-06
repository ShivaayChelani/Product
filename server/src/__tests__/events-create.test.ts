import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app';
import { getAuthToken } from './helpers/auth';
import { prisma } from '../config/database';
import { testRunId } from './helpers/testRunId';

/**
 * Community Event creation + moderation + itinerary integration.
 *
 * Covers the security and data-integrity contracts of the creation ecosystem:
 *   - POST /events is free for any authenticated user and defaults to PENDING
 *   - the server never accepts a client-supplied `status`
 *   - coordinate / date / URL / fee validation at the boundary
 *   - PENDING rows are invisible to everyone except their owner and admins
 *   - `mine=true` is owner-only (401 anonymous) and carries moderation fields
 *   - approve/reject flow; rejectionReason is owner/admin-only
 *   - mutation IDOR: PATCH/DELETE are 403 for a non-owner
 *   - trips/quick-add accepts an event (XOR with placeId) and anchors the stop
 *     on `event_id`
 */
describe('Community Events creation API', () => {
  let userToken: string;
  let adminToken: string;
  let otherUserToken: string;

  const createdEventIds: string[] = [];
  const createdTripIds: string[] = [];

  const baseEvent = {
    title: `Sunset Soiree ${testRunId}`,
    eventType: 'CULTURAL',
    startDate: '2099-06-15',
    latitude: 28.6129,
    longitude: 77.2095,
    city: 'New Delhi',
    state: 'Delhi',
  };

  beforeAll(async () => {
    userToken = await getAuthToken('USER');
    adminToken = await getAuthToken('ADMIN');
    otherUserToken = await getAuthToken('VENDOR');
  });

  afterAll(async () => {
    await Promise.all(
      createdTripIds.map((id) => prisma.tripPlan.delete({ where: { id } }).catch(() => {})),
    );
    await Promise.all(
      createdEventIds.map((id) => prisma.event.delete({ where: { id } }).catch(() => {})),
    );
  });

  async function createEvent(overrides: Record<string, unknown> = {}) {
    const res = await request(app)
      .post('/api/v1/events')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ ...baseEvent, ...overrides });
    if (res.status === 201) {
      createdEventIds.push(res.body.data.id);
    }
    return res;
  }

  describe('POST /api/v1/events', () => {
    it('rejects unauthenticated submission', async () => {
      const res = await request(app).post('/api/v1/events').send(baseEvent);
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('creates an event as PENDING with defaults', async () => {
      const res = await createEvent();
      expect(res.status).toBe(201);
      const data = res.body.data;
      expect(data.status).toBe('PENDING');
      expect(data.title).toBe(baseEvent.title);
      expect(data.createdById).toBeDefined();
      expect(data.isOwner).toBe(true);
      // One-day event: endDate defaults to startDate — never NULL.
      expect(data.endDate).toBe(data.startDate);
      expect(data.approvedAt).toBeNull();
      expect(data.rejectionReason).toBeNull();
      expect(data.entryFee).toBeNull();
      expect(data.city).toBe('New Delhi');
      // The creator gets a friendly note plus duplicate evidence, not an error.
      expect(res.body.message).toContain('awaiting review');
      expect(res.body.data.pendingNotice).toContain('awaiting review');
      expect(Array.isArray(res.body.data.duplicateCandidates)).toBe(true);
    });

    it('strips a client-supplied moderation status', async () => {
      const res = await createEvent({ status: 'APPROVED', approvedAt: new Date().toISOString() });
      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('PENDING');
      expect(res.body.data.approvedAt).toBeNull();
    });

    it('rejects a title shorter than 3 characters', async () => {
      const res = await createEvent({ title: 'X' });
      expect(res.status).toBe(400);
    });

    it('rejects a non-YYYY-MM-DD start date', async () => {
      const res = await createEvent({ startDate: '22/09/2099' });
      expect(res.status).toBe(400);
    });

    it('rejects missing coordinates', async () => {
      const { latitude: _lat, longitude: _lng, ...noCoords } = baseEvent;
      const res = await request(app)
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${userToken}`)
        .send(noCoords);
      expect(res.status).toBe(400);
    });

    it('rejects Null Island (0, 0)', async () => {
      const res = await createEvent({ latitude: 0, longitude: 0 });
      expect(res.status).toBe(400);
    });

    it('rejects a non-http(s) website URL', async () => {
      const res = await createEvent({ websiteUrl: 'javascript:alert(1)' });
      expect(res.status).toBe(400);
    });

    it('rejects a negative entry fee', async () => {
      const res = await createEvent({ entryFee: -5 });
      expect(res.status).toBe(400);
    });

    it('rejects an empty (non-null) city string', async () => {
      const res = await createEvent({ city: '', state: 'Delhi' });
      expect(res.status).toBe(400);
    });

    it('rejects more than the 6-image limit', async () => {
      const res = await createEvent({ images: ['https://x.in/1', 'https://x.in/2', 'https://x.in/3', 'https://x.in/4', 'https://x.in/5', 'https://x.in/6', 'https://x.in/7'] });
      expect(res.status).toBe(400);
    });

    it('stores a blank entry fee as null, not 0', async () => {
      const res = await createEvent({ entryFee: '' });
      expect(res.status).toBe(201);
      expect(res.body.data.entryFee).toBeNull();
    });
  });

  describe('visibility while PENDING', () => {
    it('excludes a PENDING event from the public list', async () => {
      const created = await createEvent({ title: `PENDING Hides ${testRunId}` });
      const res = await request(app).get(`/api/v1/events?q=${encodeURIComponent(`Hides ${testRunId}`)}`);
      expect(res.status).toBe(200);
      const ids = (res.body.data as Array<{ id: string }>).map((e) => e.id);
      expect(ids).not.toContain(created.body.data.id);
    });

    it('rejects mine=true without a token', async () => {
      const res = await request(app).get('/api/v1/events?mine=true');
      expect(res.status).toBe(401);
    });

    it('owner sees their own PENDING event with moderation fields via mine=true', async () => {
      const created = await createEvent({ title: `My Pending ${testRunId}` });
      const res = await request(app)
        .get(`/api/v1/events?mine=true&q=${encodeURIComponent(`My Pending ${testRunId}`)}`)
        .set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(200);
      const mine = (res.body.data as Array<{ id: string; status: string; rejectionReason: unknown }>).find(
        (e) => e.id === created.body.data.id,
      );
      expect(mine).toBeDefined();
      expect(mine!.status).toBe('PENDING');
      expect(mine!.rejectionReason).toBeNull();
    });

    it('detail: owner gets 200, another user gets 404 for PENDING', async () => {
      const created = await createEvent({ title: `Detail Flip ${testRunId}` });
      const id = created.body.data.id;

      const owner = await request(app)
        .get(`/api/v1/events/${id}`)
        .set('Authorization', `Bearer ${userToken}`);
      expect(owner.status).toBe(200);
      expect(owner.body.data.isOwner).toBe(true);

      const outsider = await request(app)
        .get(`/api/v1/events/${id}`)
        .set('Authorization', `Bearer ${otherUserToken}`);
      expect(outsider.status).toBe(404);

      const admin = await request(app)
        .get(`/api/v1/events/${id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(admin.status).toBe(200);
    });
  });

  describe('moderation flow', () => {
    it('admin can approve; the event becomes publicly visible', async () => {
      const created = await createEvent({ title: `Approve Me ${testRunId}` });
      const id = created.body.data.id;

      const approve = await request(app)
        .patch(`/api/v1/admin/events/${id}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ force: true });
      expect(approve.status).toBe(200);
      expect(approve.body.data.status).toBe('APPROVED');
      expect(approve.body.data.approvedAt).toBeTruthy();

      // Now visible to a stranger on the public list.
      const pub = await request(app).get(`/api/v1/events?q=${encodeURIComponent(`Approve Me ${testRunId}`)}`);
      expect(pub.status).toBe(200);
      expect((pub.body.data as Array<{ id: string }>).map((e) => e.id)).toContain(id);
    });

    it('admin can reject with a reason that only the owner sees', async () => {
      const created = await createEvent({ title: `Reject Me ${testRunId}` });
      const id = created.body.data.id;
      const reason = `Duplicate of the annual mela - ${testRunId}`;

      const reject = await request(app)
        .patch(`/api/v1/admin/events/${id}/reject`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason });
      expect(reject.status).toBe(200);
      expect(reject.body.data.status).toBe('REJECTED');
      expect(reject.body.data.rejectionReason).toBe(reason);

      // Owner sees the reason; a stranger only learns it is hidden.
      const owner = await request(app)
        .get(`/api/v1/events/${id}`)
        .set('Authorization', `Bearer ${userToken}`);
      expect(owner.status).toBe(200);
      expect(owner.body.data.rejectionReason).toBe(reason);

      const outsider = await request(app)
        .get(`/api/v1/events/${id}`)
        .set('Authorization', `Bearer ${otherUserToken}`);
      expect(outsider.status).toBe(404);
      // Error envelope carries no data — the moderation fields never leak.
      expect(outsider.body.data).toBeNull();
      expect(outsider.body.success).toBe(false);
    });
  });

  describe('IDOR on own-event mutations', () => {
    it('rejects PATCH from a non-owner with 403', async () => {
      const created = await createEvent({ title: `IDOR Patch ${testRunId}` });
      const res = await request(app)
        .patch(`/api/v1/events/${created.body.data.id}`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .send({ shortDescription: 'hijacked' });
      expect(res.status).toBe(403);
    });

    it('rejects DELETE from a non-owner with 403', async () => {
      const created = await createEvent({ title: `IDOR Delete ${testRunId}` });
      const res = await request(app)
        .delete(`/api/v1/events/${created.body.data.id}`)
        .set('Authorization', `Bearer ${otherUserToken}`);
      expect(res.status).toBe(403);
    });

    it('owner can delete their own PENDING event', async () => {
      const created = await createEvent({ title: `Delete Me ${testRunId}` });
      const id = created.body.data.id;
      const res = await request(app)
        .delete(`/api/v1/events/${id}`)
        .set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(200);
      // Row is gone; don't re-delete it in afterAll.
      createdEventIds.splice(createdEventIds.indexOf(id), 1);
    });
  });

  describe('trips/quick-add with an event anchor', () => {
    let quickTripId: string | undefined;
    let quickStopId: string | undefined;

    afterAll(async () => {
      if (quickTripId) createdTripIds.push(quickTripId);
    });

    it('requires exactly one of placeId or eventId', async () => {
      const both = await request(app)
        .post('/api/v1/trips/quick-add')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ placeId: 'some-place', eventId: 'some-event' });
      expect(both.status).toBe(400);

      const neither = await request(app)
        .post('/api/v1/trips/quick-add')
        .set('Authorization', `Bearer ${userToken}`)
        .send({});
      expect(neither.status).toBe(400);
    });

    it('quick-adds the owner’s PENDING event and anchors the stop on event_id', async () => {
      const created = await createEvent({
        title: `Quick Add ${testRunId}`,
        city: 'New Delhi',
        state: 'Delhi',
        entryFee: 250,
      });
      const eventId = created.body.data.id;

      const res = await request(app)
        .post('/api/v1/trips/quick-add')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ eventId });
      expect(res.status).toBe(201);
      expect(res.body.data.alreadyExists).toBe(false);
      quickTripId = res.body.data.tripId;
      quickStopId = res.body.data.stopId;

      const stop = await prisma.tripPlanStop.findUnique({ where: { id: quickStopId } });
      expect(stop).not.toBeNull();
      expect(stop!.eventId).toBe(eventId);
      expect(stop!.placeId).toBeNull();
      expect(stop!.entryFee).toBe(250);

      const dedupe = await request(app)
        .post('/api/v1/trips/quick-add')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ eventId });
      expect(dedupe.status).toBe(200);
      expect(dedupe.body.data.alreadyExists).toBe(true);
      expect(dedupe.body.data.stopId).toBe(quickStopId);
    });
  });
});