import request from 'supertest';
import app from '../app';
import { prisma } from '../config/database';
import { getAuthToken } from './helpers/auth';

type RegisteredAccount = {
  email: string;
  accessToken: string;
  id: string;
};

const createdUserIds: string[] = [];

function uniqueSuffix() {
  return `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
}

async function registerUser(label: string): Promise<RegisteredAccount> {
  const suffix = uniqueSuffix();
  const email = `multi-role-${label}-${suffix}@example.test`;
  const response = await request(app)
    .post('/api/v1/auth/register')
    .send({
      email,
      name: `Multi Role ${label}`,
      password: 'MultiRole@123',
    });

  expect(
    response.status,
    `register ${email} -> ${response.status} ${JSON.stringify(response.body)}`,
  ).toBe(201);

  const account = {
    email,
    accessToken: response.body.data.accessToken,
    id: response.body.data.user.id as string,
  };
  createdUserIds.push(account.id);
  return account;
}

async function login(email: string) {
  const response = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password: 'MultiRole@123' });

  expect(response.status).toBe(200);
  return response.body.data.accessToken as string;
}

const vendorApplication = {
  businessName: 'Multi Role Test Cafe',
  businessType: 'cafe',
  phone: '+91-9999999999',
  address: '1 Test Street',
  city: 'Jabalpur',
  state: 'Madhya Pradesh',
  description: 'A test cafe used to verify multi-role vendor approval.',
};

function expectApprovedRoles(user: any, expected: string[]) {
  const roles: string[] = user.approvedRoles || user.roles || [];
  for (const role of expected) {
    expect(roles).toContain(role);
  }
}

describe('Multi-role accounts', () => {
  afterAll(async () => {
    if (createdUserIds.length === 0) return;

    const vendors = await prisma.vendor.findMany({
      where: { userId: { in: createdUserIds } },
      select: { id: true },
    });
    const vendorIds = vendors.map((v) => v.id);

    if (vendorIds.length) {
      await prisma.redemption.deleteMany({
        where: { OR: [{ vendorId: { in: vendorIds } }, { userId: { in: createdUserIds } }] },
      });
      await prisma.vendorOffer.deleteMany({ where: { vendorId: { in: vendorIds } } });
      await prisma.vendorReel.deleteMany({ where: { vendorId: { in: vendorIds } } });
    }

    await prisma.vendor.updateMany({
      where: { reviewedById: { in: createdUserIds } },
      data: { reviewedById: null },
    });
    await prisma.auditLog.updateMany({
      where: { actorId: { in: createdUserIds } },
      data: { actorId: null },
    });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }, 60_000);

  it('scenario 1: registers with USER role assignment and USER active mode', async () => {
    const account = await registerUser('registration');

    const profile = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${account.accessToken}`);

    expect(profile.status).toBe(200);
    expect(profile.body.data.permission).toBe('USER');
    expect(profile.body.data.activeMode).toBe('USER');
    expectApprovedRoles(profile.body.data, ['USER']);
  });

  it('scenario 2–4: pending vendor cannot use vendor APIs; approve then switch modes', async () => {
    const account = await registerUser('vendor');
    const application = await request(app)
      .post('/api/v1/vendors/register')
      .set('Authorization', `Bearer ${account.accessToken}`)
      .send(vendorApplication);

    expect(application.status).toBe(201);

    const pendingDashboard = await request(app)
      .post('/api/v1/vendors/offers')
      .set('Authorization', `Bearer ${account.accessToken}`)
      .send({
        title: 'Should Fail',
        discountType: 'PERCENTAGE',
        discountValue: 10,
        pointsRequired: 50,
      });
    expect([403, 400]).toContain(pendingDashboard.status);

    const adminToken = await getAuthToken('ADMIN');
    const approval = await request(app)
      .patch(`/api/v1/vendors/${application.body.data.id}/verify`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'APPROVED' });

    expect(approval.status).toBe(200);

    const token = await login(account.email);
    const profile = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(profile.status).toBe(200);
    expectApprovedRoles(profile.body.data, ['USER', 'VENDOR']);
    expect(profile.body.data.activeMode).toBe('USER');

    const walletBefore = await request(app)
      .get('/api/v1/wallet/profile')
      .set('Authorization', `Bearer ${token}`);

    const switchMode = await request(app)
      .patch('/api/v1/auth/active-mode')
      .set('Authorization', `Bearer ${token}`)
      .send({ activeMode: 'VENDOR' });

    expect(switchMode.status).toBe(200);
    expect(switchMode.body.data.user.activeMode).toBe('VENDOR');
    expect(switchMode.body.data.accessToken).toBeTruthy();
    expectApprovedRoles(switchMode.body.data.user, ['USER', 'VENDOR']);

    const walletAfter = await request(app)
      .get('/api/v1/wallet/profile')
      .set('Authorization', `Bearer ${switchMode.body.data.accessToken}`);

    if (walletBefore.status === 200 && walletAfter.status === 200) {
      expect(walletAfter.body.data.id || walletAfter.body.data.userId)
        .toEqual(walletBefore.body.data.id || walletBefore.body.data.userId);
    }

    const switchBack = await request(app)
      .patch('/api/v1/auth/active-mode')
      .set('Authorization', `Bearer ${switchMode.body.data.accessToken}`)
      .send({ activeMode: 'USER' });

    expect(switchBack.status).toBe(200);
    expect(switchBack.body.data.user.activeMode).toBe('USER');
  });

  it('scenario 6: ONE professional role per account — second application requires a confirmed switch', async () => {
    const account = await registerUser('exclusive');
    const vendorApp = await request(app)
      .post('/api/v1/vendors/register')
      .set('Authorization', `Bearer ${account.accessToken}`)
      .send(vendorApplication);
    expect(vendorApp.status).toBe(201);

    // Applying for the OTHER professional role while vendor is held must be blocked
    // with a structured, machine-readable error code (no message matching).
    const creatorUsername = `exclusive_${uniqueSuffix()}`;
    const creatorApplication = {
      username: creatorUsername,
      fullName: 'Exclusive Specialty',
      bio: 'A travel creator application used to verify professional role exclusivity.',
      travelCategories: ['food'],
      applicationReason: 'I want to switch my account from vendor to creator.',
      instagramUrl: 'https://instagram.com/exclusive_specialty',
    };

    const blocked = await request(app)
      .post('/api/v1/social/creators/apply')
      .set('Authorization', `Bearer ${account.accessToken}`)
      .send(creatorApplication);
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('SWITCH_CONFIRMATION_REQUIRED');

    // Re-applying for the SAME role while it is pending is also blocked.
    const duplicateVendor = await request(app)
      .post('/api/v1/vendors/register')
      .set('Authorization', `Bearer ${account.accessToken}`)
      .send(vendorApplication);
    expect(duplicateVendor.status).toBe(409);
    expect(duplicateVendor.body.code).toBe('APPLICATION_PENDING');

    // Confirming the switch retires the vendor role and files the creator application.
    const switched = await request(app)
      .post('/api/v1/social/creators/apply')
      .set('Authorization', `Bearer ${account.accessToken}`)
      .send({ ...creatorApplication, confirmSwitch: true });
    expect(switched.status).toBe(201);

    const adminToken = await getAuthToken('ADMIN');
    const creatorApproval = await request(app)
      .patch(`/api/v1/social/admin/creators/${switched.body.data.id}/verify`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'APPROVED' });
    expect(creatorApproval.status).toBe(200);

    const token = await login(account.email);
    const profile = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(profile.status).toBe(200);
    expectApprovedRoles(profile.body.data, ['USER', 'CONTENT_CREATOR']);
    expect(profile.body.data.roles || []).not.toContain('VENDOR');

    // The retired vendor role can no longer be activated.
    const vendorMode = await request(app)
      .patch('/api/v1/auth/active-mode')
      .set('Authorization', `Bearer ${token}`)
      .send({ activeMode: 'VENDOR' });
    expect(vendorMode.status).toBe(400);

    // Creator and User modes both work on the same account.
    for (const mode of ['CONTENT_CREATOR', 'USER'] as const) {
      const modeSwitch = await request(app)
        .patch('/api/v1/auth/active-mode')
        .set('Authorization', `Bearer ${token}`)
        .send({ activeMode: mode });
      expect(modeSwitch.status).toBe(200);
      expect(modeSwitch.body.data.user.activeMode).toBe(mode);
    }
  });

  it('scenario 6b: approved vendor switching to creator retires the vendor role', async () => {
    const account = await registerUser('switch');
    const vendorApp = await request(app)
      .post('/api/v1/vendors/register')
      .set('Authorization', `Bearer ${account.accessToken}`)
      .send(vendorApplication);
    expect(vendorApp.status).toBe(201);

    const adminToken = await getAuthToken('ADMIN');
    const approval = await request(app)
      .patch(`/api/v1/vendors/${vendorApp.body.data.id}/verify`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'APPROVED' });
    expect(approval.status).toBe(200);

    const token = await login(account.email);
    const creatorApplication = {
      username: `switcher_${uniqueSuffix()}`,
      fullName: 'Approved Vendor Switching',
      bio: 'An approved vendor switching their professional profile to creator.',
      travelCategories: ['culture'],
      applicationReason: 'Testing the approved-vendor to creator switch path.',
      instagramUrl: 'https://instagram.com/approved_vendor_switch',
    };

    const blocked = await request(app)
      .post('/api/v1/social/creators/apply')
      .set('Authorization', `Bearer ${token}`)
      .send(creatorApplication);
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('SWITCH_CONFIRMATION_REQUIRED');
    expect(blocked.body.details?.currentRole).toBe('VENDOR');

    const switched = await request(app)
      .post('/api/v1/social/creators/apply')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...creatorApplication, confirmSwitch: true });
    expect(switched.status).toBe(201);

    const refreshed = await login(account.email);
    const profile = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${refreshed}`);
    expect(profile.body.data.roles || []).not.toContain('VENDOR');
    expect(profile.body.data.activeMode).toBe('USER');
  });

  it('scenario: suspend vendor forces mode off and blocks vendor capability', async () => {
    const account = await registerUser('suspend');
    const vendorApp = await request(app)
      .post('/api/v1/vendors/register')
      .set('Authorization', `Bearer ${account.accessToken}`)
      .send(vendorApplication);
    expect(vendorApp.status).toBe(201);

    const adminToken = await getAuthToken('ADMIN');
    await request(app)
      .patch(`/api/v1/vendors/${vendorApp.body.data.id}/verify`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'APPROVED' });

    let token = await login(account.email);
    await request(app)
      .patch('/api/v1/auth/active-mode')
      .set('Authorization', `Bearer ${token}`)
      .send({ activeMode: 'VENDOR' });

    const suspend = await request(app)
      .patch(`/api/v1/vendors/${vendorApp.body.data.id}/verify`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'SUSPENDED' });
    expect(suspend.status).toBe(200);

    token = await login(account.email);
    const profile = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(profile.body.data.activeMode).toBe('USER');
    expect(profile.body.data.roles || []).not.toContain('VENDOR');

    const switchVendor = await request(app)
      .patch('/api/v1/auth/active-mode')
      .set('Authorization', `Bearer ${token}`)
      .send({ activeMode: 'VENDOR' });
    expect(switchVendor.status).toBe(400);
  });

  it('rejects unavailable active modes for USER-only accounts', async () => {
    const account = await registerUser('authorization');

    const activeMode = await request(app)
      .patch('/api/v1/auth/active-mode')
      .set('Authorization', `Bearer ${account.accessToken}`)
      .send({ activeMode: 'VENDOR' });

    expect(activeMode.status).toBe(400);
    expect(activeMode.body.success).toBe(false);

    const vendorRoute = await request(app)
      .get('/api/v1/vendors/me/dashboard')
      .set('Authorization', `Bearer ${account.accessToken}`);

    expect(vendorRoute.status).toBe(403);
    expect(vendorRoute.body.success).toBe(false);
  });
});
