import { describe, expect, it } from 'vitest';
import { getCursorParams, getPaginationParams, parsePositiveInt } from '../shared/utils/pagination';

describe('parsePositiveInt', () => {
  it('returns fallback for non-numeric input instead of NaN', () => {
    expect(parsePositiveInt('foo', 20)).toBe(20);
    expect(parsePositiveInt('', 20)).toBe(20);
    expect(parsePositiveInt(undefined, 20)).toBe(20);
    expect(parsePositiveInt(NaN, 20)).toBe(20);
    expect(parsePositiveInt('12', 20)).toBe(12);
    expect(parsePositiveInt(7.9, 20)).toBe(7);
  });
});

describe('getPaginationParams', () => {
  it('never returns NaN skip or take for garbage query values', () => {
    const garbage = getPaginationParams({ page: 'foo', limit: 'bar' });
    expect(Number.isFinite(garbage.page)).toBe(true);
    expect(Number.isFinite(garbage.limit)).toBe(true);
    expect(Number.isFinite(garbage.skip)).toBe(true);
    expect(garbage.page).toBe(1);
    expect(garbage.limit).toBe(20);
    expect(garbage.skip).toBe(0);
  });

  it('caps limit so public list queries cannot request unbounded take', () => {
    const huge = getPaginationParams({ page: '1', limit: '999999999' }, 100);
    expect(huge.limit).toBe(100);
    expect(huge.skip).toBe(0);
  });

  it('keeps a custom default limit when query.limit is omitted', () => {
    const leaderboard = getPaginationParams({}, 100, 50);
    expect(leaderboard.limit).toBe(50);
  });
});

describe('getCursorParams', () => {
  it('does not pass NaN limit through for invalid query.limit', () => {
    const params = getCursorParams({ limit: 'nope' });
    expect(Number.isFinite(params.limit)).toBe(true);
    expect(params.limit).toBe(20);
  });
});
