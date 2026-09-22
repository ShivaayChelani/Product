import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { Role } from '@prisma/client';
import { prisma } from '../config/database';
import type { LegalVersions } from './helpers/legal';
import { getPublishedLegalVersions, legalAcceptancePayload } from './helpers/legal';

const { verifyGoogleIdToken } = vi.hoisted(() => ({
  verifyGoogleIdToken: vi.fn(),
}));

vi.mock('../modules/auth/googleIdentity', async () => {
  const actual = await vi.importActual<typeof import('../modules/auth/googleIdentity')>(
    '../modules/auth/googleIdentity',
  );
  return { ...actual, verifyGoogleIdToken };
});

import app from '../app';

describe('Legal acceptance enforcement', () => {
  const createdUserIds: string[] = [];
  let versions: LegalVersions;

  beforeAll(async () => {
    versions = await getPublishedLegalVersions();
  });

  afterAll(async () => {
    if (createdUserIds.length) {
      await prisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => {});
      await prisma.authAccount.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => {});
      await prisma.wallet.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => {});
      await prisma.userRole.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => {});
      await prisma.legalAcceptance.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => {});
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }).catch(() => {});
    }
  });

  const uniqueEmail = (label: string) => `legal-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.test`;

  describe('POST /api/v1/auth/register', () => {
    it('rejects when Terms & Conditions are not accepted', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: uniqueEmail('no-terms'),
          name: 'No Terms',
          password: 'LegalTest@123',
          ...legalAcceptancePayload(versions, { termsAccepted: false }),
        });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body.errors)).toMatch(/Terms & Conditions/i);
    });

    it('rejects when the Privacy Policy is not accepted', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: uniqueEmail('no-privacy'),
          name: 'No Privacy',
          password: 'LegalTest@123',
          ...legalAcceptancePayload(versions, { privacyAccepted: false }),
        });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body.errors)).toMatch(/Privacy Policy/i);
    });

    it('rejects when versions are missing', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: uniqueEmail('no-versions'),
          name: 'No Versions',
          password: 'LegalTest@123',
          termsAccepted: true,
          privacyAccepted: true,
        });
      expect(res.status).toBe(400);
    });

    it('rejects stale legal version numbers before creating an account', async () => {
      const email = uniqueEmail('stale');
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email,
          name: 'Stale Versions',
          password: 'LegalTest@123',
          ...legalAcceptancePayload(versions, {
            termsVersion: versions.termsVersion + 1,
            privacyVersion: versions.privacyVersion + 1,
          }),
        });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/out of date/i);
      expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
    });

    it('creates an accepted account with a LegalAcceptance record', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: uniqueEmail('accepted'),
          name: 'Accepted User',
          password: 'LegalTest@123',
          ...legalAcceptancePayload(versions),
        });
      expect(res.status).toBe(201);
      expect(res.body.data.accessToken).toBeDefined();
      createdUserIds.push(res.body.data.user.id);

      const acceptance = await prisma.legalAcceptance.findUnique({
        where: { userId: res.body.data.user.id },
      });
      expect(acceptance).not.toBeNull();
      expect(acceptance!.termsVersion).toBe(versions.termsVersion);
      expect(acceptance!.privacyVersion).toBe(versions.privacyVersion);
    });
  });

  describe('Grandfathering — existing users with no acceptance record still sign in', () => {
    it('logs in a user whose LegalAcceptance record is missing', async () => {
      const email = uniqueEmail('grandfathered');
      const reg = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email,
          name: 'Grandfathered',
          password: 'OldLegal@123',
          ...legalAcceptancePayload(versions),
        });
      expect(reg.status).toBe(201);
      const userId = reg.body.data.user.id;
      createdUserIds.push(userId);

      await prisma.legalAcceptance.delete({ where: { userId } });

      const login = await request(app)
        .post('/api/v1/auth/login')
        .send({ email, password: 'OldLegal@123' });
      expect(login.status).toBe(200);
      expect(login.body.data.accessToken).toBeDefined();
    });
  });

  describe('GET /api/v1/legal/current-versions', () => {
    it('returns the published version numbers used by the auth flows', async () => {
      const res = await request(app).get('/api/v1/legal/current-versions');
      expect(res.status).toBe(200);
      expect(res.body.data.termsVersion).toBe(versions.termsVersion);
      expect(res.body.data.privacyVersion).toBe(versions.privacyVersion);
    });
  });

  describe('POST /api/v1/auth/google (Phase 2 version validation)', () => {
    it('rejects stale versions on Google signup and rolls back the user shell', async () => {
      const identity = {
        sub: `legal-sub-${Date.now()}`,
        email: uniqueEmail('google-stale'),
        emailVerified: true as const,
        name: 'Google Stale',
        picture: 'https://example.test/pic.png',
      };
      verifyGoogleIdToken.mockResolvedValueOnce(identity);

      const res = await request(app)
        .post('/api/v1/auth/google')
        .send({
          idToken: 'stale-google',
          ...legalAcceptancePayload(versions, {
            termsVersion: versions.termsVersion + 5,
            privacyVersion: versions.privacyVersion + 5,
          }),
        });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/out of date/i);
      expect(await prisma.user.findUnique({ where: { email: identity.email } })).toBeNull();
    });

    it('records a LegalAcceptance row for a Phase 2 account', async () => {
      const identity = {
        sub: `legal-sub-ok-${Date.now()}`,
        email: uniqueEmail('google-ok'),
        emailVerified: true as const,
        name: 'Google Ok',
        picture: 'https://example.test/pic.png',
      };
      verifyGoogleIdToken.mockResolvedValueOnce(identity);

      const res = await request(app)
        .post('/api/v1/auth/google')
        .send({ idToken: 'ok-google', ...legalAcceptancePayload(versions) });
      expect(res.status).toBe(200);
      expect(res.body.data.user.permission).toBe(Role.USER);
      createdUserIds.push(res.body.data.user.id);

      const acceptance = await prisma.legalAcceptance.findUnique({
        where: { userId: res.body.data.user.id },
      });
      expect(acceptance?.termsVersion).toBe(versions.termsVersion);
      expect(acceptance?.privacyVersion).toBe(versions.privacyVersion);
    });
  });
});