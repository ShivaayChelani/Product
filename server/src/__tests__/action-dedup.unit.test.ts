import { describe, expect, it, beforeEach } from 'vitest';
import { claimActionSlot, resetActionDedupForTests } from '../shared/utils/actionDedup';

describe('claimActionSlot', () => {
  beforeEach(() => {
    resetActionDedupForTests();
  });

  it('allows the first claim and rejects a repeat within the TTL', async () => {
    expect(await claimActionSlot('reel-view:r1:ip:1.1.1.1', 60_000)).toBe(true);
    expect(await claimActionSlot('reel-view:r1:ip:1.1.1.1', 60_000)).toBe(false);
  });

  it('does not share slots across different actors or resources', async () => {
    expect(await claimActionSlot('reel-view:r1:ip:1.1.1.1', 60_000)).toBe(true);
    expect(await claimActionSlot('reel-view:r1:ip:2.2.2.2', 60_000)).toBe(true);
    expect(await claimActionSlot('reel-view:r2:ip:1.1.1.1', 60_000)).toBe(true);
  });
});
