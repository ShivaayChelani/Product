import { describe, expect, it } from 'vitest';
import {
  selectFullRefreshAvoidIds,
  excludeRepeatedButKeepPinned,
} from '../modules/trips/refreshAvoid';

describe('selectFullRefreshAvoidIds (full refresh varies away from every non-pinned stop)', () => {
  it('collects every day\'s non-pinned stops, not just Day 1', () => {
    const stops = [
      { placeId: 'hawa-mahal', isPinned: false }, // day 1
      { placeId: 'amber-fort', isPinned: false },
      { placeId: 'city-palace', isPinned: true }, // pinned — stays available
      { placeId: 'jal-mahal', isPinned: false }, // day 2
    ];
    expect(selectFullRefreshAvoidIds(stops).sort()).toEqual([
      'amber-fort',
      'hawa-mahal',
      'jal-mahal',
    ]);
  });

  it('never excludes pinned places', () => {
    expect(selectFullRefreshAvoidIds([{ placeId: 'city-palace', isPinned: true }])).toEqual([]);
  });

  it('honours hint-excluded ids (explicit remove requests stay excluded)', () => {
    const stops = [
      { placeId: 'hawa-mahal', isPinned: false },
      { placeId: 'amber-fort', isPinned: false },
    ];
    expect(selectFullRefreshAvoidIds(stops, new Set(['hawa-mahal']))).toEqual(['amber-fort']);
  });

  it('an empty trip yields nothing to avoid', () => {
    expect(selectFullRefreshAvoidIds([])).toEqual([]);
  });

  it('deduplicates identical place ids', () => {
    const stops = [
      { placeId: 'hawa-mahal', isPinned: false },
      { placeId: 'hawa-mahal', isPinned: false },
    ];
    expect(selectFullRefreshAvoidIds(stops)).toEqual(['hawa-mahal']);
  });
});

describe('excludeRepeatedButKeepPinned (same-route retry keeps pins)', () => {
  const previous = ['hawa-mahal', 'amber-fort', 'city-palace', 'jal-mahal'];

  it('drops every non-pinned repeat but never a pinned id', () => {
    expect(excludeRepeatedButKeepPinned(previous, ['city-palace'])).toEqual([
      'hawa-mahal',
      'amber-fort',
      'jal-mahal',
    ]);
  });

  it('keeps everything when nothing is pinned', () => {
    expect(excludeRepeatedButKeepPinned(previous, [])).toEqual(previous);
  });

  it('an empty previous round is a no-op', () => {
    expect(excludeRepeatedButKeepPinned([], ['city-palace'])).toEqual([]);
  });
});