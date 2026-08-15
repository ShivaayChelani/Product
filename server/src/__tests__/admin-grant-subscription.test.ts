import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { PlanAudience, PlanStatus, Role, RoleAssignmentStatus } from '@prisma/client';
import app from '../app';
import { prisma } from '../config/database';
import { getAuthToken } from './helpers/auth';
import { testRunId } from './helpers/testRunId';
import { plansService } from '../modules/monetization/plans.service';
import { CANONICAL_PLAN_SLUGS, UNLIMITED } from '../modules/monetization/plan-catalog.service';
import { grantDurationDays } from '../modules/monetization/grant-subscription';

const stamp = `agrant-${testRunId}`;
const ids = {
  vendorUser: '',
  vendor: '',
  traveller: '',
  inactivePlan: '',
};

async function authMe(token: string): Promise<string> {
  const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
  return res.body.data?.id;
}

describe('Admin grant vendor subscription', () => {
  let adminToken = '';
  let vendorToken = '';
  let userToken = '';
  let starterId = '';
  let unlimitedId = '';

  beforeAll(async () => {
    [adminToken, vendorToken, userToken] = await Promise.all([
      getAuthToken('ADMIN'),
      getAuthToken('VENDOR'),
      getAuthToken('USER'),
    ]);
    await plansService.ensureDefaultPlans();

    const plans = await prisma.subscriptionPlan.findMany({
      where: {
        slug: {
          in: [
            CANONICAL_PLAN_SLUGS.vendorStarter,
            CANONICAL_PLAN_SLUGS.vendorGrowth,
            CANONICAL_PLAN_SLUGS.vendorUnlimited,
          ],
        },
      },
      include: { limits: true },
    });
    starterId = plans.find((p) => p.slug === CANONICAL_PLAN_SLUGS.vendorStarter)?.id || '';
    unlimitedId = plans.find((p) => p.slug === CANONICAL_PLAN_SLUGS.vendorUnlimited)?.id || '';
    expect(starterId).toBeTruthy();
    expect(unlimitedId).toBeTruthy();

    const unlimitedRow = plans.find((p) => p.slug === CANONICAL_PLAN_SLUGS.vendorUnlimited);
    if (unlimitedRow && !unlimitedRow.limits.some((l) => l.limitKey === 'maxOffers')) {
      const { planCatalogService } = await import('../modules/monetization/plan-catalog.service');
      const spec = (await planCatalogService.getDefaultPlansSpec()).find(
        (p) => p.slug === CANONICAL_PLAN_SLUGS.vendorUnlimited,
      );
      if (spec?.catalog) await planCatalogService.applyCatalogToPlan(unlimitedRow.id, spec.catalog);
    }

    const vendorUser = await prisma.user.create({
      data: {
        email: `${stamp}-vendor@example.test`,
        password: 'hash',
        name: 'Grant Target Vendor',
        permission: Role.VENDOR,
        activeMode: Role.VENDOR,
        userRoles: {
          create: { role: Role.VENDOR, status: RoleAssignmentStatus.APPROVED },
        },
      },
    });
    ids.vendorUser = vendorUser.id;
    const vendor = await prisma.vendor.create({
      data: {
        userId: vendorUser.id,
        businessName: `${stamp} Cafe`,
        businessType: 'cafe',
        phone: '+910000000088',
        address: 'Grant Street',
        city: 'Jabalpur',
        state: 'MP',
        status: 'APPROVED',
        showOnMap: true,
        latitude: 23.1815,
        longitude: 79.9864,
        subscriptionStatus: 'NONE',
      },
    });
    ids.vendor = vendor.id;

    const traveller = await prisma.user.create({
      data: {
        email: `${stamp}-user@example.test`,
        password: 'hash',
        name: 'Traveller',
        permission: Role.USER,
        activeMode: Role.USER,
      },
    });
    ids.traveller = traveller.id;

    const inactive = await prisma.subscriptionPlan.create({
      data: {
        audience: PlanAudience.VENDOR,
        name: 'Inactive Grant Plan',
        slug: `${stamp}-inactive`,
        status: PlanStatus.INACTIVE,
        trialDays: 0,
        gracePeriodDays: 3,
      },
    });
    ids.inactivePlan = inactive.id;
  }, 180000);

  afterAll(async () => {
    await prisma.subscriptionAuditLog.deleteMany({
      where: { after: { path: ['vendorUserId'], equals: ids.vendorUser } },
    }).catch(() => undefined);
    if (ids.vendorUser) {
      await prisma.userSubscription.deleteMany({ where: { userId: ids.vendorUser } });
      await prisma.paymentTransaction.deleteMany({ where: { userId: ids.vendorUser } });
    }
    if (ids.vendor) await prisma.vendor.deleteMany({ where: { id: ids.vendor } });
    if (ids.inactivePlan) await prisma.subscriptionPlan.deleteMany({ where: { id: ids.inactivePlan } });
    await prisma.user.deleteMany({ where: { email: { contains: `${stamp}-` } } });
  });

  it('non-admin cannot grant', async () => {
    const [asUser, asVendor] = await Promise.all([
      request(app)
        .post('/api/v1/monetization/admin/grant')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ userId: ids.vendorUser, planId: starterId, durationMonths: 1 }),
      request(app)
        .post('/api/v1/monetization/admin/grant')
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({ userId: ids.vendorUser, planId: starterId, durationMonths: 1 }),
    ]);
    expect(asUser.status).toBeGreaterThanOrEqual(400);
    expect(asVendor.status).toBeGreaterThanOrEqual(400);
  });

  it('admin cannot grant a vendor plan to a traveller', async () => {
    const res = await request(app)
      .post('/api/v1/monetization/admin/grant')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: ids.traveller, planId: starterId, durationMonths: 1 });
    expect(res.status).toBe(400);
  });

  it('inactive plan cannot be granted', async () => {
    const res = await request(app)
      .post('/api/v1/monetization/admin/grant')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: ids.vendorUser, planId: ids.inactivePlan, durationMonths: 1 });
    expect(res.status).toBe(400);
  });

  it('canonical vendor plans resolve in grant context', async () => {
    const res = await request(app)
      .get('/api/v1/monetization/admin/grant-context')
      .query({ userId: ids.vendorUser })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const slugs = (res.body.data?.plans || []).map((p: { slug: string }) => p.slug);
    expect(slugs).toEqual(expect.arrayContaining([
      CANONICAL_PLAN_SLUGS.vendorStarter,
      CANONICAL_PLAN_SLUGS.vendorGrowth,
      CANONICAL_PLAN_SLUGS.vendorUnlimited,
    ]));
    expect(res.body.data.vendor.userId).toBe(ids.vendorUser);
  });

  it('admin can grant a subscription to a vendor without a payment transaction', async () => {
    const hidden = await request(app).get(`/api/v1/vendors/${ids.vendor}/details`);
    expect(hidden.status).toBe(404);

    const beforeTx = await prisma.paymentTransaction.count({ where: { userId: ids.vendorUser } });
    const res = await request(app)
      .post('/api/v1/monetization/admin/grant')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: ids.vendorUser, planId: starterId, durationMonths: 1, reason: 'QA grant' });
    expect(res.status).toBe(201);
    expect(res.body.data?.subscription?.status).toBe('ACTIVE');
    expect(res.body.data?.transaction).toBeUndefined();

    const afterTx = await prisma.paymentTransaction.count({ where: { userId: ids.vendorUser } });
    expect(afterTx).toBe(beforeTx);

    const start = new Date(res.body.data.subscription.currentPeriodStart);
    const end = new Date(res.body.data.subscription.currentPeriodEnd);
    const expectedMs = grantDurationDays(1) * 24 * 60 * 60 * 1000;
    expect(Math.abs(end.getTime() - start.getTime() - expectedMs)).toBeLessThan(2000);

    const sub = await prisma.userSubscription.findFirst({
      where: { userId: ids.vendorUser, status: 'ACTIVE' },
      include: { plan: { include: { limits: true } } },
    });
    expect(sub?.planId).toBe(starterId);
    expect(sub?.provider).toBe('ADMIN_GRANT');
    expect(sub?.autoRenew).toBe(false);

    const { entitlementsService } = await import('../modules/monetization/entitlements.service');
    const ents = await entitlementsService.getForUser(ids.vendorUser);
    expect(ents.vendorSubscription?.planId).toBe(starterId);
    expect(ents.vendorListing?.visible).toBe(true);

    const vendor = await prisma.vendor.findUnique({ where: { id: ids.vendor } });
    expect(vendor?.subscriptionStatus).toBe('ACTIVE');

    const visible = await request(app).get(`/api/v1/vendors/${ids.vendor}/details`);
    expect(visible.status).toBe(200);
  });

  it('writes SUBSCRIPTION_GRANTED audit with admin, vendor, plan, duration, dates, and reason', async () => {
    const logs = await prisma.subscriptionAuditLog.findMany({
      where: { action: 'SUBSCRIPTION_GRANTED', entityType: 'UserSubscription' },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    const adminId = await authMe(adminToken);
    const match = logs.find((row) => {
      const after = row.after as Record<string, unknown> | null;
      return after?.vendorUserId === ids.vendorUser && after?.reason === 'QA grant';
    });
    expect(match).toBeTruthy();
    expect(match?.actorId).toBe(adminId);
    const after = match!.after as Record<string, unknown>;
    expect(after.planId).toBe(starterId);
    expect(after.durationMonths).toBe(1);
    expect(after.startDate).toBeTruthy();
    expect(after.expiryDate).toBeTruthy();
    expect(after.action).toBe('SUBSCRIPTION_GRANTED');
  });

  it('does not silently overwrite; replacement never shortens remaining time', async () => {
    const blocked = await request(app)
      .post('/api/v1/monetization/admin/grant')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: ids.vendorUser, planId: unlimitedId, durationMonths: 1 });
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('ACTIVE_SUBSCRIPTION_EXISTS');

    const current = await prisma.userSubscription.findFirst({
      where: { userId: ids.vendorUser, status: 'ACTIVE' },
    });
    expect(current).toBeTruthy();
    const previousEnd = current!.currentPeriodEnd;

    const replaced = await request(app)
      .post('/api/v1/monetization/admin/grant')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        userId: ids.vendorUser,
        planId: unlimitedId,
        durationMonths: 1,
        confirmReplace: true,
        reason: 'upgrade without shortening',
      });
    expect(replaced.status).toBe(201);
    const nextEnd = new Date(replaced.body.data.subscription.currentPeriodEnd);
    expect(nextEnd.getTime()).toBeGreaterThanOrEqual(previousEnd.getTime() - 1000);
  });

  it('unlimited plan entitlements are unlimited for offers and reels', async () => {
    const { entitlementsService } = await import('../modules/monetization/entitlements.service');
    const { planEnforcementService } = await import('../modules/monetization/plan-enforcement.service');
    const ents = await entitlementsService.getForUser(ids.vendorUser);
    expect(ents.vendorSubscription?.slug).toBe(CANONICAL_PLAN_SLUGS.vendorUnlimited);
    const offers = ents.vendorSubscription?.maxOffers ?? 0;
    const reels = ents.vendorSubscription?.maxReels ?? 0;
    expect(offers === UNLIMITED || offers >= 999999).toBe(true);
    expect(reels === UNLIMITED || reels >= 999999).toBe(true);

    const limits = await planEnforcementService.getVendorLimits(ids.vendorUser);
    expect(limits.maxOffers).toBe(UNLIMITED);
    expect(limits.maxReels).toBe(UNLIMITED);
  });
});
