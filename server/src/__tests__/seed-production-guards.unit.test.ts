import { describe, expect, it } from 'vitest';
import {
  assertDestructivePruneAllowed,
  assertNullIslandCleanupAllowed,
  assertSyntheticSeedAllowed,
} from '../config/seedSafety';

describe('destructive seed guards', () => {
  it('allows prune on non-production without a second confirm', () => {
    expect(() => assertDestructivePruneAllowed({ NODE_ENV: 'development' })).not.toThrow();
    expect(() => assertDestructivePruneAllowed({ NODE_ENV: 'test' })).not.toThrow();
  });

  it('blocks production prune unless CONFIRM_PRODUCTION_PRUNE=1', () => {
    expect(() => assertDestructivePruneAllowed({ NODE_ENV: 'production' })).toThrow(
      /CONFIRM_PRODUCTION_PRUNE/,
    );
    expect(() =>
      assertDestructivePruneAllowed({
        NODE_ENV: 'production',
        PRUNE_EXTRA_USERS: 'true',
      }),
    ).toThrow(/CONFIRM_PRODUCTION_PRUNE/);
    expect(() =>
      assertDestructivePruneAllowed({
        NODE_ENV: 'production',
        CONFIRM_PRODUCTION_PRUNE: '1',
      }),
    ).not.toThrow();
  });

  it('blocks credential sync when a non-production process targets Neon production', () => {
    expect(() =>
      assertSyntheticSeedAllowed({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://u:p@ep-sweet-morning-az9jhg9t-pooler.c-3.ap-southeast-1.aws.neon.tech/db',
      }),
    ).toThrow(/production host/);
    expect(() =>
      assertSyntheticSeedAllowed({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5433/palsafar_test',
      }),
    ).not.toThrow();
  });

  it('blocks production null-island cleanup unless CONFIRM_PRODUCTION_CLEANUP=1', () => {
    expect(() => assertNullIslandCleanupAllowed({ NODE_ENV: 'production' })).toThrow(
      /CONFIRM_PRODUCTION_CLEANUP/,
    );
    expect(() =>
      assertNullIslandCleanupAllowed({
        NODE_ENV: 'production',
        CONFIRM_PRODUCTION_CLEANUP: '1',
      }),
    ).not.toThrow();
  });
});
