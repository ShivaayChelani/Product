import { describe, expect, it } from 'vitest';
import { resolveEntryCost } from '../modules/trips/itineraryEngine';

describe('resolveEntryCost (fee basis semantics)', () => {
  it('legacy rows without basis infer PER_PERSON and multiply by travellers', () => {
    expect(resolveEntryCost({ adult: 100 }, 2)).toEqual({ amount: 200, basis: 'PER_PERSON', unknownFee: false });
    expect(resolveEntryCost({ foreigner: 50 }, 3)).toEqual({ amount: 150, basis: 'PER_PERSON', unknownFee: false });
    expect(resolveEntryCost({ child: 20 }, 1)).toEqual({ amount: 20, basis: 'PER_PERSON', unknownFee: false });
  });

  it('FREE costs nothing regardless of amounts', () => {
    expect(resolveEntryCost({ adult: 0, basis: 'FREE' }, 4)).toEqual({ amount: 0, basis: 'FREE', unknownFee: false });
  });

  it('PER_VEHICLE / PER_GROUP / FLAT_RATE charge once — never multiplied', () => {
    expect(resolveEntryCost({ adult: 300, basis: 'PER_VEHICLE' }, 4).amount).toBe(300);
    expect(resolveEntryCost({ adult: 500, basis: 'PER_GROUP' }, 6).basis).toBe('PER_GROUP');
    expect(resolveEntryCost({ adult: 800, basis: 'FLAT_RATE' }, 2).amount).toBe(800);
  });

  it('UNKNOWN is never silently free — flagged for budget exclusion', () => {
    const r = resolveEntryCost({ adult: 250, basis: 'UNKNOWN' }, 2);
    expect(r.amount).toBe(0);
    expect(r.unknownFee).toBe(true);
    expect(r.basis).toBe('UNKNOWN');
  });

  it('no amounts and no basis -> UNKNOWN with no fee to flag', () => {
    expect(resolveEntryCost({}, 2)).toEqual({ amount: 0, basis: 'UNKNOWN', unknownFee: false });
    expect(resolveEntryCost(null, 2)).toEqual({ amount: 0, basis: 'UNKNOWN', unknownFee: false });
  });

  it('explicit PER_PERSON overrides multiplication doubts', () => {
    expect(resolveEntryCost({ adult: 90, basis: 'PER_PERSON' }, 2).amount).toBe(180);
  });

  it('zero-fee legacy row stays free without unknown flag', () => {
    expect(resolveEntryCost({ adult: 0 }, 2)).toEqual({ amount: 0, basis: 'PER_PERSON', unknownFee: false });
  });
});
