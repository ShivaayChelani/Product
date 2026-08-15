import request from 'supertest';
import app from '../app';
import { getAuthToken } from './helpers/auth';
import { prisma } from '../config/database';

async function cleanupVendorCreatorCollabs(vendorId: string, creatorId: string) {
  const collabs = await prisma.collaboration.findMany({
    where: { vendorId, creatorId },
    select: { id: true, reelId: true },
  });
  for (const collab of collabs) {
    if (collab.reelId) {
      await prisma.reel.updateMany({
        where: { id: collab.reelId },
        data: { collaborationId: null, isCollaboration: false },
      }).catch(() => {});
      await prisma.reel.deleteMany({ where: { id: collab.reelId } }).catch(() => {});
    }
    await prisma.collaborationRevision.deleteMany({ where: { collaborationId: collab.id } });
    await prisma.collaborationStatusHistory.deleteMany({ where: { collaborationId: collab.id } });
    await prisma.collaborationDeliverable.deleteMany({ where: { collaborationId: collab.id } });
    await prisma.collaborationAnalytics.deleteMany({ where: { collaborationId: collab.id } });
  }
  await prisma.collaboration.deleteMany({ where: { vendorId, creatorId } });
}

function buildRequestPayload(creatorProfileId: string, title = 'Test Summer Campaign') {
  return {
    creatorProfileId,
    campaignTitle: title,
    campaignCategory: 'Food & Dining',
    budgetPaise: 150000,
    deliverables: [{ type: 'REEL', quantity: 1 }, { type: 'STORY', quantity: 3 }],
    campaignBrief: 'Create an engaging reel showcasing our new summer menu items and ambiance.',
    contactPerson: 'Manager',
    contactPhone: '9876543210',
    contactEmail: 'vendor@test.com',
  };
}

describe.sequential('Collaborations API', () => {
  let vendorToken: string;
  let creatorToken: string;
  let adminToken: string;
  let creatorProfileId: string;
  let vendorId: string;
  let collaborationId: string;

  beforeAll(async () => {
    vendorToken = await getAuthToken('VENDOR');
    creatorToken = await getAuthToken('CONTENT_CREATOR');
    adminToken = await getAuthToken('ADMIN');

    const creatorUser = await prisma.user.findUnique({ where: { email: 'rahul.chelani@palsafar.com' } });
    const creator = await prisma.creatorProfile.findUnique({ where: { userId: creatorUser!.id } });
    creatorProfileId = creator!.id;

    const vendor = await prisma.vendor.findFirst({ where: { user: { email: 'streetstory@palsafar.com' } } });
    vendorId = vendor!.id;
    await prisma.vendor.update({
      where: { id: vendorId },
      data: { subscriptionStatus: 'ACTIVE' },
    });
    await cleanupVendorCreatorCollabs(vendorId, creatorProfileId);
  }, 120_000);

  afterAll(async () => {
    if (vendorId && creatorProfileId) {
      await cleanupVendorCreatorCollabs(vendorId, creatorProfileId);
    }
  });

  it('vendor can check collaborate eligibility', async () => {
    const res = await request(app)
      .get(`/api/v1/collaborations/vendor/can-collaborate/${creatorProfileId}`)
      .set('Authorization', `Bearer ${vendorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.allowed).toBe(true);
  });

  it('rejects over-budget collaboration request', async () => {
    const res = await request(app)
      .post('/api/v1/collaborations')
      .set('Authorization', `Bearer ${vendorToken}`)
      .send({
        ...buildRequestPayload(creatorProfileId, 'Over Budget'),
        budgetPaise: 10_000_001,
      });

    expect(res.status).toBe(400);
  });

  it('vendor can send collaboration request', async () => {
    const res = await request(app)
      .post('/api/v1/collaborations')
      .set('Authorization', `Bearer ${vendorToken}`)
      .send(buildRequestPayload(creatorProfileId));

    expect(res.status).toBe(201);
    expect(res.body.data.campaignTitle).toBe('Test Summer Campaign');
    expect(res.body.data.contactsUnlocked).toBe(false);
    expect(res.body.data.contactPhone).toBe('9876543210');
    collaborationId = res.body.data.id;
  });

  it('rejects duplicate collaboration request', async () => {
    const res = await request(app)
      .post('/api/v1/collaborations')
      .set('Authorization', `Bearer ${vendorToken}`)
      .send(buildRequestPayload(creatorProfileId, 'Duplicate'));

    expect(res.status).toBe(409);
  });

  it('creator can list incoming collaborations', async () => {
    const res = await request(app)
      .get('/api/v1/collaborations/creator?bucket=incoming')
      .set('Authorization', `Bearer ${creatorToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.some((c: { id: string }) => c.id === collaborationId)).toBe(true);
  });

  it('masks contact details before acceptance', async () => {
    const res = await request(app)
      .get(`/api/v1/collaborations/${collaborationId}`)
      .set('Authorization', `Bearer ${creatorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.contactsUnlocked).toBe(false);
    expect(res.body.data.contactPhone).toBeNull();
    expect(res.body.data.contactEmail).toBeNull();
    expect(res.body.data.contactPerson).toBeNull();
    expect(res.body.data.contactWhatsApp).toBeNull();
  });

  it('creator can accept and unlock contacts', async () => {
    const res = await request(app)
      .post(`/api/v1/collaborations/${collaborationId}/accept`)
      .set('Authorization', `Bearer ${creatorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ACCEPTED');
    expect(res.body.data.contactsUnlocked).toBe(true);
    expect(res.body.data.contactPhone).toBeTruthy();
    expect(res.body.data.contactEmail).toBeTruthy();
  }, 60_000);

  it('creator can submit collaboration reel', async () => {
    const res = await request(app)
      .post(`/api/v1/collaborations/${collaborationId}/submit-reel`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({
        videoUrl: 'https://res.cloudinary.com/demo/video/upload/sample.mp4',
        title: 'Summer collab reel',
        description: 'Test collaboration reel upload',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('REEL_UPLOADED');
    expect(res.body.data.reel?.videoUrl).toContain('cloudinary');
  });

  it('vendor can request revision', async () => {
    const res = await request(app)
      .post(`/api/v1/collaborations/${collaborationId}/request-revision`)
      .set('Authorization', `Bearer ${vendorToken}`)
      .send({ feedback: 'Please add clearer branding and a call-to-action at the end of the reel.' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('REVISION_REQUESTED');
  });

  it('vendor can approve reel after re-upload; creator then publishes', async () => {
    const resubmit = await request(app)
      .post(`/api/v1/collaborations/${collaborationId}/submit-reel`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({
        videoUrl: 'https://res.cloudinary.com/demo/video/upload/revised.mp4',
        title: 'Revised summer collab reel',
      });
    expect(resubmit.status).toBe(200);

    const res = await request(app)
      .post(`/api/v1/collaborations/${collaborationId}/approve-reel`)
      .set('Authorization', `Bearer ${vendorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('APPROVED');
    expect(res.body.data.reel?.status).toBe('PENDING');

    const published = await request(app)
      .post(`/api/v1/collaborations/${collaborationId}/publish-reel`)
      .set('Authorization', `Bearer ${creatorToken}`);

    expect(published.status).toBe(200);
    expect(published.body.data.status).toBe('COMPLETED');
    expect(published.body.data.reel?.status).toBe('APPROVED');
    expect(published.body.data.reel?.vendorListingStatus).toBe('APPROVED');
  });

  it('admin can list collaborations and view analytics', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/collaborations')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body.data)).toBe(true);

    const analyticsRes = await request(app)
      .get('/api/v1/admin/collaborations/analytics/summary')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(analyticsRes.status).toBe(200);
    expect(typeof analyticsRes.body.data.total).toBe('number');
  });

  it('rejects unauthenticated create', async () => {
    const res = await request(app)
      .post('/api/v1/collaborations')
      .send({ campaignTitle: 'x' });
    expect(res.status).toBe(401);
  });
});
