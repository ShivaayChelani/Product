import { describe, expect, it, vi } from 'vitest';
import { encodeGeohash, geohashBlockingPrefixes, geohashPrefix } from '../shared/utils/geohash';

vi.mock('../config/database', () => ({
  prisma: {
    placeDuplicateCandidate: {
      upsert: vi.fn().mockResolvedValue({}),
    },
  },
}));

import { comparePlacesInBlock } from '../modules/canonical/services/duplicate-scan.service';

describe('geohash spatial blocking', () => {
  it('encodes stable prefixes for the same coordinates', () => {
    const a = geohashPrefix(23.1324, 79.8043, 6);
    const b = geohashPrefix(23.1324, 79.8043, 6);
    expect(a).toBe(b);
    expect(a.length).toBe(6);
  });

  it('returns neighbor prefixes for blocking', () => {
    const prefixes = geohashBlockingPrefixes(23.1324, 79.8043, 6);
    expect(prefixes.length).toBeGreaterThanOrEqual(1);
    expect(prefixes.every((p) => p.length === 6)).toBe(true);
  });

  it('encodeGeohash increases precision with length', () => {
    expect(encodeGeohash(28.6, 77.2, 8).length).toBe(8);
  });
});

describe('duplicate compare block', () => {
  it('evaluates pairs within a block only', async () => {
    const place = {
      id: 'a',
      name: 'Bhedaghat',
      latitude: 23.1324,
      longitude: 79.8043,
      state: 'Madhya Pradesh',
      district: 'Jabalpur',
      category: 'ghat',
      aliases: [{ alias: 'Marble Rocks' }],
    };
    const stats = await comparePlacesInBlock([
      place,
      { ...place, id: 'b', name: 'Bheda Ghat' },
      { ...place, id: 'c', name: 'Unrelated Museum', latitude: 12.97, longitude: 77.59 },
    ]);
    expect(stats.evaluated).toBe(3);
  });
});
