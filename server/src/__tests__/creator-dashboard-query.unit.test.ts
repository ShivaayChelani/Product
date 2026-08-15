import { describe, it, expect } from 'vitest';
import { creatorReelsQuerySchema } from '../modules/creator/creator.validation';

describe('creator reels query validation', () => {
  it('accepts the mobile cache-bust param with page and limit as strings', () => {
    const parsed = creatorReelsQuerySchema.parse({
      _t: String(Date.now()),
      page: '1',
      limit: '50',
    });
    expect(parsed.page).toBe(1);
    expect(parsed.limit).toBe(50);
  });

  it('does not fail when only the cache-bust param is present', () => {
    expect(() => creatorReelsQuerySchema.parse({ _t: '1755260000000' })).not.toThrow();
  });
});
