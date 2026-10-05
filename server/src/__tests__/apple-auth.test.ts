import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { Role } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { ApiError, ErrorCodes } from '../shared/utils/ApiError';

const { verifyAppleIdentityToken } = vi.hoisted(() => ({
  verifyAppleIdentityToken: vi.fn(),
}));

// Only the token verifier is stubbed. `joinAppleFullName` stays real because the
// out-of-band name merge is part of the behaviour under test.
vi.mock('../modules/auth/appleIdentity', async () => {
  const actual = await vi.importActual<typeof import('../modules/auth/appleIdentity')>(
    '../modules/auth/appleIdentity',
  );
  return {
    ...actual,
    verifyAppleIdentityToken,
  };
});

import app from '../app';
import { getPublishedLegalVersions, legalAcceptancePayload } from './helpers/legal';

const NONCE = 'a-client-chosen-nonce-value';

function appleIdentity(overrides: Record<string, unknown> = {}) {
  return {
    sub: `apple-sub-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    email: `auser-${Date.now()}-${Math.random().toString(16).slice(2)}@palsafar.test`,
    emailVerified: true,
    fullName: null,
    isPrivateRelay: false,
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
  await prisma.legalAcceptance.deleteMany({ where: { userId: { in: unique } } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { id: { in: unique } } }).catch(() => undefined);
}

describe('POST /api/v1/auth/apple', () => {
  const createdUserIds: string[] = [];
  let versions: { termsVersion: number; privacyVersion: number };

  beforeAll(async () => {
    verifyAppleIdentityToken.mockReset();
    versions = await getPublishedLegalVersions();
  });

  afterAll(async () => {
    await cleanupUserIds(createdUserIds);
  });

  it('requires legal acceptance for a brand-new Apple account and creates the full session on Phase 2', async () => {
    const identity = appleIdentity();
    verifyAppleIdentityToken.mockResolvedValueOnce(identity);

    // Phase 1: only the identity token -> signal that legal acceptance is required, no tokens
    const phase1 = await request(app)
      .post('/api/v1/auth/apple')
      .send({ identityToken: 'valid-new', nonce: NONCE });
    expect(phase1.status).toBe(200);
    expect(phase1.body.success).toBe(true);
    expect(phase1.body.data.requiresLegalAcceptance).toBe(true);
    expect(phase1.body.data.accessToken).toBeUndefined();

    // The user shell must have been rolled back -> no zombie records
    const zombie = await prisma.user.findUnique({ where: { email: identity.email } });
    expect(zombie).toBeNull();

    // Phase 2: identity token + legal acceptance -> full session
    verifyAppleIdentityToken.mockResolvedValueOnce(identity);
    const res = await request(app)
      .post('/api/v1/auth/apple')
      .send({ identityToken: 'valid-new', nonce: NONCE, ...legalAcceptancePayload(versions) });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    expect(res.body.data.user.email).toBe(identity.email);
    expect(res.body.data.user.permission).toBe(Role.USER);
    expect(res.body.data.user.activeMode).toBe(Role.USER);
    createdUserIds.push(res.body.data.user.id);

    // The Apple account is anchored on `sub`, not on the email
    const account = await prisma.authAccount.findUnique({
      where: {
        provider_providerAccountId: { provider: 'apple', providerAccountId: identity.sub },
      },
    });
    expect(account?.userId).toBe(res.body.data.user.id);

    const acceptance = await prisma.legalAcceptance.findUnique({
      where: { userId: res.body.data.user.id },
    });
    expect(acceptance?.termsVersion).toBe(versions.termsVersion);
    expect(acceptance?.privacyVersion).toBe(versions.privacyVersion);

    const decoded = jwt.verify(res.body.data.accessToken, env.jwt.secret) as {
      permission: string;
      userId: string;
    };
    expect(decoded.permission).toBe('USER');
    expect(decoded.userId).toBe(res.body.data.user.id);
  });

  it('logs in an existing Apple-linked user (grandfathered: no legal gate)', async () => {
    const identity = appleIdentity();
    verifyAppleIdentityToken.mockResolvedValueOnce(identity);
    const first = await request(app)
      .post('/api/v1/auth/apple')
      .send({ identityToken: 'first', nonce: NONCE, ...legalAcceptancePayload(versions) });
    expect(first.status).toBe(200);
    createdUserIds.push(first.body.data.user.id);

    // Second call without any legal payload -> existing account logs straight in
    verifyAppleIdentityToken.mockResolvedValueOnce(identity);
    const second = await request(app)
      .post('/api/v1/auth/apple')
      .send({ identityToken: 'second', nonce: NONCE });
    expect(second.status).toBe(200);
    expect(second.body.data.user.id).toBe(first.body.data.user.id);
    expect(await prisma.user.count({ where: { email: identity.email } })).toBe(1);
  });

  it('merges the out-of-band Apple name into the profile and never lets a later call overwrite it', async () => {
    const identity = appleIdentity();
    verifyAppleIdentityToken.mockResolvedValueOnce(identity);
    const created = await request(app)
      .post('/api/v1/auth/apple')
      .send({
        identityToken: 'named',
        nonce: NONCE,
        firstName: 'Ada',
        lastName: 'Lovelace',
        ...legalAcceptancePayload(versions),
      });
    expect(created.status).toBe(200);
    createdUserIds.push(created.body.data.user.id);
    expect(created.body.data.user.name).toBe('Ada Lovelace');

    // Apple only ever returns the name once per app. A later sign-in that carries
    // no name must not blank the stored profile.
    verifyAppleIdentityToken.mockResolvedValueOnce(identity);
    const again = await request(app)
      .post('/api/v1/auth/apple')
      .send({ identityToken: 'named-again', nonce: NONCE });
    expect(again.status).toBe(200);
    expect(again.body.data.user.name).toBe('Ada Lovelace');
  });

  it('links Apple to an existing PalSafar account with the same verified email', async () => {
    const identity = appleIdentity();
    const registered = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: identity.email,
        name: 'Password Account',
        password: 'LinkTest@123',
        ...legalAcceptancePayload(versions),
      });
    expect(registered.status).toBe(201);
    const existingId = registered.body.data.user.id;
    createdUserIds.push(existingId);

    verifyAppleIdentityToken.mockResolvedValueOnce(identity);
    const linked = await request(app)
      .post('/api/v1/auth/apple')
      .send({ identityToken: 'link', nonce: NONCE });
    expect(linked.status).toBe(200);
    expect(linked.body.data.user.id).toBe(existingId);
    // The pre-existing name must win over anything Apple sent out of band.
    expect(linked.body.data.user.name).toBe('Password Account');
  });

  it('returns a controlled 409 when the PalSafar email account already has a different Apple identity', async () => {
    const email = `conflict-${Date.now()}@palsafar.test`;
    const registered = await request(app)
      .post('/api/v1/auth/register')
      .send({
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
        provider: 'apple',
        providerAccountId: `other-sub-${userId}`,
        email,
        emailVerified: true,
      },
    });

    const identity = appleIdentity({ email, sub: `new-sub-${userId}` });
    verifyAppleIdentityToken.mockResolvedValueOnce(identity);
    const res = await request(app)
      .post('/api/v1/auth/apple')
      .send({ identityToken: 'conflict', nonce: NONCE });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe(ErrorCodes.APPLE_IDENTITY_CONFLICT);
  });

  it('does not create duplicate users under concurrent first-time Apple registration', async () => {
    const identity = appleIdentity();
    verifyAppleIdentityToken.mockResolvedValue(identity);

    // Phase 1 (no legal): every concurrent call must roll back its user shell
    const [p1a, p1b] = await Promise.all([
      request(app).post('/api/v1/auth/apple').send({ identityToken: 'concurrent-a', nonce: NONCE }),
      request(app).post('/api/v1/auth/apple').send({ identityToken: 'concurrent-b', nonce: NONCE }),
    ]);
    expect(p1a.status).toBe(200);
    expect(p1b.status).toBe(200);
    expect(p1a.body.data.requiresLegalAcceptance).toBe(true);
    expect(p1b.body.data.requiresLegalAcceptance).toBe(true);
    expect(await prisma.user.count({ where: { email: identity.email } })).toBe(0);

    // Phase 2 with legal acceptance under concurrency -> exactly one real account
    const [a, b] = await Promise.all([
      request(app)
        .post('/api/v1/auth/apple')
        .send({ identityToken: 'concurrent-a', nonce: NONCE, ...legalAcceptancePayload(versions) }),
      request(app)
        .post('/api/v1/auth/apple')
        .send({ identityToken: 'concurrent-b', nonce: NONCE, ...legalAcceptancePayload(versions) }),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body.data.user.id).toBe(b.body.data.user.id);
    createdUserIds.push(a.body.data.user.id);
    expect(await prisma.user.count({ where: { email: identity.email } })).toBe(1);
    verifyAppleIdentityToken.mockReset();
  });

  it('rejects an invalid Apple token', async () => {
    verifyAppleIdentityToken.mockRejectedValueOnce(new ApiError(401, 'Invalid Apple token.'));
    const res = await request(app)
      .post('/api/v1/auth/apple')
      .send({ identityToken: 'invalid', nonce: NONCE });
    expect(res.status).toBe(401);
  });

  it('rejects an expired Apple token', async () => {
    verifyAppleIdentityToken.mockRejectedValueOnce(new ApiError(401, 'Apple token has expired.'));
    const res = await request(app)
      .post('/api/v1/auth/apple')
      .send({ identityToken: 'expired', nonce: NONCE });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/expired/i);
  });

  it('rejects a nonce that does not match the one Apple echoed', async () => {
    verifyAppleIdentityToken.mockRejectedValueOnce(
      new ApiError(401, 'Invalid Apple token nonce.'),
    );
    const res = await request(app)
      .post('/api/v1/auth/apple')
      .send({ identityToken: 'nonce-mismatch', nonce: NONCE });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/nonce/i);
  });

  it('requires a nonce on every request', async () => {
    verifyAppleIdentityToken.mockClear();
    const res = await request(app)
      .post('/api/v1/auth/apple')
      .send({ identityToken: 'no-nonce' });
    expect(res.status).toBe(400);
    // The guard must run before any token verification is attempted.
    expect(verifyAppleIdentityToken).not.toHaveBeenCalled();
  });

  it('refuses to invent an account when Apple shares no email', async () => {
    const identity = appleIdentity({ email: null, emailVerified: false });
    verifyAppleIdentityToken.mockResolvedValueOnce(identity);
    const res = await request(app)
      .post('/api/v1/auth/apple')
      .send({ identityToken: 'no-email', nonce: NONCE, ...legalAcceptancePayload(versions) });
    expect(res.status).toBe(400);
    expect(await prisma.authAccount.count({ where: { providerAccountId: identity.sub } })).toBe(0);
  });

  it('rejects a first-time Apple sign-in whose email Apple did not verify', async () => {
    const identity = appleIdentity({ emailVerified: false });
    verifyAppleIdentityToken.mockResolvedValueOnce(identity);
    const res = await request(app)
      .post('/api/v1/auth/apple')
      .send({ identityToken: 'unverified', nonce: NONCE, ...legalAcceptancePayload(versions) });
    expect(res.status).toBe(401);
    expect(await prisma.authAccount.count({ where: { providerAccountId: identity.sub } })).toBe(0);
  });

  it('accepts an Apple private relay address at first sign-in', async () => {
    const identity = appleIdentity({
      email: `relay-${Date.now()}@privaterelay.appleid.com`,
      isPrivateRelay: true,
    });
    verifyAppleIdentityToken.mockResolvedValueOnce(identity);
    const res = await request(app)
      .post('/api/v1/auth/apple')
      .send({ identityToken: 'relay', nonce: NONCE, ...legalAcceptancePayload(versions) });
    expect(res.status).toBe(200);
    createdUserIds.push(res.body.data.user.id);
    expect(res.body.data.user.email).toBe(identity.email);
  });

  it('ignores forged userId/role/email in the request body', async () => {
    const res = await request(app)
      .post('/api/v1/auth/apple')
      .send({
        identityToken: 'token',
        nonce: NONCE,
        userId: 'forged-admin',
        role: 'ADMIN',
        permission: 'ADMIN',
        email: 'admin@palsafar.com',
        points: 99999,
        activeMode: 'ADMIN',
      });
    expect(res.status).toBe(400);
  });

  it('issues a fresh JWT after logout + Apple login again', async () => {
    const identity = appleIdentity();
    verifyAppleIdentityToken.mockResolvedValueOnce(identity);
    const first = await request(app)
      .post('/api/v1/auth/apple')
      .send({ identityToken: 'again-1', nonce: NONCE, ...legalAcceptancePayload(versions) });
    expect(first.status).toBe(200);
    createdUserIds.push(first.body.data.user.id);

    await request(app)
      .post('/api/v1/auth/logout')
      .send({ refreshToken: first.body.data.refreshToken });

    verifyAppleIdentityToken.mockResolvedValueOnce(identity);
    const second = await request(app)
      .post('/api/v1/auth/apple')
      .send({ identityToken: 'again-2', nonce: NONCE });
    expect(second.status).toBe(200);
    expect(second.body.data.user.id).toBe(first.body.data.user.id);
    expect(second.body.data.accessToken).toBeDefined();
    expect(second.body.data.accessToken).not.toBe(first.body.data.accessToken);
  });
});
