import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  applyPublicPlacePrismaFilter,
  canPublicViewPlace,
  publicVerifiedRawSqlSuffix,
} from '../modules/places/services/places-public-visibility';

vi.mock('../config/env', () => ({
  env: { placesPublicVerifiedOnly: false },
}));

describe('places-public-visibility', () => {
  beforeEach(async () => {
    const { env } = await import('../config/env');
    (env as { placesPublicVerifiedOnly: boolean }).placesPublicVerifiedOnly = false;
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('allows approved non-merged places when verified-only is off', () => {
    expect(
      canPublicViewPlace({ mergedIntoId: null, dataQuality: 'DRAFT', status: 'APPROVED' }, false),
    ).toBe(true);
  });

  it('blocks merged places for public viewers', () => {
    expect(
      canPublicViewPlace({ mergedIntoId: 'x', dataQuality: 'VERIFIED', status: 'APPROVED' }, false),
    ).toBe(false);
  });

  it('adds dataQuality filter when verified-only enabled', async () => {
    const { env } = await import('../config/env');
    (env as { placesPublicVerifiedOnly: boolean }).placesPublicVerifiedOnly = true;
    const where = applyPublicPlacePrismaFilter({ status: 'APPROVED' }, false);
    expect(where).toMatchObject({ mergedIntoId: null, dataQuality: 'VERIFIED' });
    expect(publicVerifiedRawSqlSuffix()).toContain('VERIFIED');
  });

  it('skips dataQuality for admin prisma filter', async () => {
    const { env } = await import('../config/env');
    (env as { placesPublicVerifiedOnly: boolean }).placesPublicVerifiedOnly = true;
    const where = applyPublicPlacePrismaFilter({}, true);
    expect(where.dataQuality).toBeUndefined();
  });

  it('allows admin-approved hidden gems when verified-only is on', async () => {
    const { env } = await import('../config/env');
    (env as { placesPublicVerifiedOnly: boolean }).placesPublicVerifiedOnly = true;
    expect(
      canPublicViewPlace(
        {
          mergedIntoId: null,
          dataQuality: 'PENDING_REVIEW',
          status: 'APPROVED',
          source: 'HIDDEN_GEM',
          verificationLevel: 2,
        },
        false,
      ),
    ).toBe(true);
  });

  it('includes approved hidden gems in verified raw SQL suffix', async () => {
    const { env } = await import('../config/env');
    (env as { placesPublicVerifiedOnly: boolean }).placesPublicVerifiedOnly = true;
    expect(publicVerifiedRawSqlSuffix({ includeApprovedHiddenGems: true })).toContain('HIDDEN_GEM');
  });
});
