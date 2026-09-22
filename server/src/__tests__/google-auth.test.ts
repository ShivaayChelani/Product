import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { Role } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { ApiError, ErrorCodes } from '../shared/utils/ApiError';

const { verifyGoogleIdToken } = vi.hoisted(() => ({
  verifyGoogleIdToken: vi.fn(),
}));

vi.mock('../modules/auth/googleIdentity', async () => {
  const actual = await vi.importActual<typeof import('../modules/auth/googleIdentity')>(
    '../modules/auth/googleIdentity',
  );
  return {
    ...actual,
    verifyGoogleIdToken,
  };
});

import app from '../app';
import { getPublishedLegalVersions, legalAcceptancePayload } from './helpers/legal';

function googleIdentity(overrides: Record<string, unknown> = {}) {
  return {
    sub: `sub-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    email: `guser-${Date.now()}-${Math.random().toString(16).slice(2)}@palsafar.test`,
    emailVerified: true as const,
    name: 'Google Test User',
    picture: 'https://example.test/pic.png',
    ...overrides,
  };
}

async function cleanupUserIds(ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return;
  await prisma.refreshToken.deleteMany({ where: { userId: { in: unique } } }).catch(() => undefined);
  await prisma.authAccount.deleteMany({ where: { userId: { in: unique } } }).catch(() => undefined);
  await prisma.wallet.deleteMany({ where: { userId: { in: unique } } }).catch(() => undefined);
  await prisma.userRole.deleteMany({ where: { userId: { in: unique } } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { id: { in: unique } } }).catch(() => undefined);
}

describe('POST /api/v1/auth/google', () => {
  const createdUserIds: string[] = [];
  let versions: { termsVersion: number; privacyVersion: number };

  beforeAll(async () => {
    verifyGoogleIdToken.mockReset();
    versions = await getPublishedLegalVersions();
  });

  afterAll(async () => {
    await cleanupUserIds(createdUserIds);
  });

  it('requires legal acceptance for a brand-new Google account and creates the full session on Phase 2', async () => {
    const identity = googleIdentity();
    verifyGoogleIdToken.mockResolvedValueOnce(identity);

    // Phase 1: only idToken → signal that legal acceptance is required, no tokens
    const phase1 = await request(app).post('/api/v1/auth/google').send({ idToken: 'valid-new' });
    expect(phase1.status).toBe(200);
    expect(phase1.body.success).toBe(true);
    expect(phase1.body.data.requiresLegalAcceptance).toBe(true);
    expect(phase1.body.data.accessToken).toBeUndefined();

    // The user shell must have been rolled back — no zombie records
    const zombie = await prisma.user.findUnique({ where: { email: identity.email } });
    expect(zombie).toBeNull();

    // Phase 2: idToken + legal acceptance → full session
    verifyGoogleIdToken.mockResolvedValueOnce(identity);
    const res = await request(app)
      .post('/api/v1/auth/google')
      .send({ idToken: 'valid-new', ...legalAcceptancePayload(versions) });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    expect(res.body.data.user.email).toBe(identity.email);
    expect(res.body.data.user.permission).toBe(Role.USER);
    expect(res.body.data.user.activeMode).toBe(Role.USER);
    createdUserIds.push(res.body.data.user.id);

    const account = await prisma.authAccount.findUnique({
      where: { provider_providerAccountId: { provider: 'google', providerAccountId: identity.sub } },
    });
    expect(account?.userId).toBe(res.body.data.user.id);

    const acceptance = await prisma.legalAcceptance.findUnique({
      where: { userId: res.body.data.user.id },
    });
    expect(acceptance?.termsVersion).toBe(versions.termsVersion);
    expect(acceptance?.privacyVersion).toBe(versions.privacyVersion);

    const decoded = jwt.verify(res.body.data.accessToken, env.jwt.secret) as { permission: string; userId: string };
    expect(decoded.permission).toBe('USER');
    expect(decoded.userId).toBe(res.body.data.user.id);
  });

  it('logs in an existing Google-linked user (grandfathered: no legal gate)', async () => {
    const identity = googleIdentity();
    verifyGoogleIdToken.mockResolvedValueOnce(identity);
    const first = await request(app)
      .post('/api/v1/auth/google')
      .send({ idToken: 'first', ...legalAcceptancePayload(versions) });
    expect(first.status).toBe(200);
    createdUserIds.push(first.body.data.user.id);

    // Second call without any legal payload → existing account logs straight in
    verifyGoogleIdToken.mockResolvedValueOnce(identity);
    const second = await request(app).post('/api/v1/auth/google').send({ idToken: 'second' });
    expect(second.status).toBe(200);
    expect(second.body.data.user.id).toBe(first.body.data.user.id);
    const count = await prisma.user.count({ where: { email: identity.email } });
    expect(count).toBe(1);
  });

  it('links Google to an existing PalSafar account with the same verified email', async () => {
    const identity = googleIdentity();
    const registered = await request(app).post('/api/v1/auth/register').send({
      email: identity.email,
      name: 'Password Account',
      password: 'LinkTest@123',
      ...legalAcceptancePayload(versions),
    });
    expect(registered.status).toBe(201);
    const existingId = registered.body.data.user.id;
    createdUserIds.push(existingId);

    verifyGoogleIdToken.mockResolvedValueOnce(identity);
    const linked = await request(app).post('/api/v1/auth/google').send({ idToken: 'link' });
    expect(linked.status).toBe(200);
    expect(linked.body.data.user.id).toBe(existingId);
    expect(linked.body.data.user.name).toBe('Password Account');
  });

  it('returns a controlled 409 when the PalSafar email account already has a different Google identity', async () => {
    const email = `conflict-${Date.now()}@palsafar.test`;
    const registered = await request(app).post('/api/v1/auth/register').send({
      email,
      name: 'Conflict User',
      password: 'Conflict@123',
      ...legalAcceptancePayload(versions),
    });
    expect(registered.status).toBe(201);
    const userId = registered.body.data.user.id;
    createdUserIds.push(userId);
    await prisma.authAccount.create({
      data: {
        userId,
        provider: 'google',
        providerAccountId: `other-sub-${userId}`,
        email,
        emailVerified: true,
      },
    });

    const identity = googleIdentity({ email, sub: `new-sub-${userId}` });
    verifyGoogleIdToken.mockResolvedValueOnce(identity);
    const res = await request(app).post('/api/v1/auth/google').send({ idToken: 'conflict' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe(ErrorCodes.GOOGLE_IDENTITY_CONFLICT);
  });

  it('does not create duplicate users under concurrent first-time Google registration', async () => {
    const identity = googleIdentity();
    verifyGoogleIdToken.mockResolvedValue(identity);

    // Phase 1 (no legal): every concurrent call must roll back its user shell
    const [p1a, p1b] = await Promise.all([
      request(app).post('/api/v1/auth/google').send({ idToken: 'concurrent-a' }),
      request(app).post('/api/v1/auth/google').send({ idToken: 'concurrent-b' }),
    ]);
    expect(p1a.status).toBe(200);
    expect(p1b.status).toBe(200);
    expect(p1a.body.data.requiresLegalAcceptance).toBe(true);
    expect(p1b.body.data.requiresLegalAcceptance).toBe(true);
    expect(await prisma.user.count({ where: { email: identity.email } })).toBe(0);

    // Phase 2 with legal acceptance under concurrency → exactly one real account
    verifyGoogleIdToken.mockResolvedValue(identity);
    const [a, b] = await Promise.all([
      request(app)
        .post('/api/v1/auth/google')
        .send({ idToken: 'concurrent-a', ...legalAcceptancePayload(versions) }),
      request(app)
        .post('/api/v1/auth/google')
        .send({ idToken: 'concurrent-b', ...legalAcceptancePayload(versions) }),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body.data.user.id).toBe(b.body.data.user.id);
    createdUserIds.push(a.body.data.user.id);
    const count = await prisma.user.count({ where: { email: identity.email } });
    expect(count).toBe(1);
    verifyGoogleIdToken.mockReset();
  });

  it('rejects an invalid Google token', async () => {
    verifyGoogleIdToken.mockRejectedValueOnce(new ApiError(401, 'Invalid Google token.'));
    const res = await request(app).post('/api/v1/auth/google').send({ idToken: 'invalid' });
    expect(res.status).toBe(401);
  });

  it('rejects an expired Google token', async () => {
    verifyGoogleIdToken.mockRejectedValueOnce(new ApiError(401, 'Google token has expired.'));
    const res = await request(app).post('/api/v1/auth/google').send({ idToken: 'expired' });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/expired/i);
  });

  it('rejects a token with the wrong audience', async () => {
    verifyGoogleIdToken.mockRejectedValueOnce(new ApiError(401, 'Invalid Google token audience.'));
    const res = await request(app).post('/api/v1/auth/google').send({ idToken: 'wrong-aud' });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/audience/i);
  });

  it('rejects an unverified Google email', async () => {
    verifyGoogleIdToken.mockRejectedValueOnce(new ApiError(401, 'Google email is not verified.'));
    const res = await request(app).post('/api/v1/auth/google').send({ idToken: 'unverified' });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/not verified/i);
  });

  it('ignores forged userId/role/email in the request body', async () => {
    const res = await request(app).post('/api/v1/auth/google').send({
      idToken: 'token',
      userId: 'forged-admin',
      role: 'ADMIN',
      permission: 'ADMIN',
      email: 'admin@palsafar.com',
      points: 99999,
      activeMode: 'ADMIN',
    });
    expect(res.status).toBe(400);
  });

  it('issues the same JWT shape after logout + Google login again', async () => {
    const identity = googleIdentity();
    verifyGoogleIdToken.mockResolvedValueOnce(identity);
    const first = await request(app)
      .post('/api/v1/auth/google')
      .send({ idToken: 'again-1', ...legalAcceptancePayload(versions) });
    expect(first.status).toBe(200);
    createdUserIds.push(first.body.data.user.id);

    await request(app)
      .post('/api/v1/auth/logout')
      .send({ refreshToken: first.body.data.refreshToken });

    verifyGoogleIdToken.mockResolvedValueOnce(identity);
    const second = await request(app).post('/api/v1/auth/google').send({ idToken: 'again-2' });
    expect(second.status).toBe(200);
    expect(second.body.data.user.id).toBe(first.body.data.user.id);
    expect(second.body.data.accessToken).toBeDefined();
    expect(second.body.data.accessToken).not.toBe(first.body.data.accessToken);
  });
});
