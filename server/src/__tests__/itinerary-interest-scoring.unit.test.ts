import { describe, expect, it } from 'vitest';
import {
  applyInterestGate,
  INTEREST_CATEGORY_MAP,
} from '../modules/trips/itineraryEngine';

interface GatePlace { id: string; category: string; tags?: string[]; isPinned?: boolean }

const place = (id: string, category: string, tags: string[] = [], isPinned = false): GatePlace =>
  ({ id, category, tags, isPinned });

describe('INTEREST_CATEGORY_MAP taxonomy coverage', () => {
  it('nature matches the real production category vocabulary', () => {
    const keywords = INTEREST_CATEGORY_MAP.nature;
    for (const cat of ['waterfall', 'lake', 'park', 'dam', 'reservoir', 'riverfront_/_nature', 'garden']) {
      expect(keywords.some((k) => cat.includes(k))).toBe(true);
    }
    // 'nature' must match its own interest now (audit finding).
    expect(keywords).toContain('nature');
  });

  it('history/culture keywords cover forts, museums, temples and ghats', () => {
    expect(INTEREST_CATEGORY_MAP.history).toContain('fort');
    expect(INTEREST_CATEGORY_MAP.history).toContain('museum');
    for (const key of ['local culture', 'culture', 'local_culture']) {
      expect(INTEREST_CATEGORY_MAP[key]).toContain('temple');
      expect(INTEREST_CATEGORY_MAP[key]).toContain('ghat');
    }
  });
});

describe('applyInterestGate (material preference influence)', () => {
  const naturePool = [
    place('w1', 'waterfall'), place('l1', 'lake'), place('p1', 'park'),
    place('d1', 'dam'), place('r1', 'riverfront_/_nature'), place('w2', 'waterfall'),
    place('n1', 'nature'), place('g1', 'garden'), place('v1', 'viewpoint'),
    place('w3', 'waterfall'), place('l2', 'lake'), place('p2', 'park'),
    place('t1', 'temple'), place('f1', 'fort'),
  ];

  it('pushes unmatched places behind matched ones when signal is strong', () => {
    const { pool, gated } = applyInterestGate(naturePool as never[], ['nature'], 6);
    expect(gated).toBe(true);
    const firstUnmatched = pool.findIndex((p) => ['temple', 'fort'].includes((p as unknown as GatePlace).category));
    const lastMatched = pool.map((p) => (p as unknown as GatePlace).category)
      .lastIndexOf((c) => !['temple', 'fort'].includes(c));
    if (firstUnmatched !== -1) {
      expect(lastMatched).toBeLessThan(firstUnmatched);
    }
  });

  it('keeps everyone when matches are too scarce to cover the plan', () => {
    const scarce = [place('w1', 'waterfall'), place('t1', 'temple'), place('f1', 'fort')];
    const { pool, gated } = applyInterestGate(scarce as never[], ['nature'], 12);
    expect(gated).toBe(false);
    expect(pool).toHaveLength(3);
  });

  it('never gates away pinned places', () => {
    const withPin = [...naturePool, place('pin1', 'temple', [], true)];
    const { pool } = applyInterestGate(withPin as never[], ['nature'], 6);
    expect(pool.some((p) => (p as unknown as GatePlace).id === 'pin1')).toBe(true);
  });

  it('ignores pseudo-interests without keywords (hidden gems)', () => {
    const { gated } = applyInterestGate(naturePool as never[], ['hidden gems'], 6);
    expect(gated).toBe(false);
  });
});
