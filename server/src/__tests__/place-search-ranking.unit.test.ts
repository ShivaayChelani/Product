import { describe, expect, it } from 'vitest';
import { scorePlaceSearchMatch } from '../modules/search/search-ranking';

describe('scorePlaceSearchMatch — location beats weak name matches', () => {
  it('ranks a place in the searched city above an unrelated fuzzy name', () => {
    const inCity = scorePlaceSearchMatch('Jabalpur', {
      name: 'Bhedaghat',
      city: 'Jabalpur',
      state: 'Madhya Pradesh',
    });
    const unrelated = scorePlaceSearchMatch('Jabalpur', {
      name: 'Kundalpur Jain Temple',
      city: 'Nalanda',
      state: 'Bihar',
    });
    expect(inCity).toBeGreaterThan(0);
    expect(unrelated).toBe(0);
    expect(inCity).toBeGreaterThan(unrelated);
  });

  it('does not surface a result for a coincidental shared substring', () => {
    expect(scorePlaceSearchMatch('Jabalpur', { name: 'Kundalpur' })).toBe(0);
  });
});

describe('scorePlaceSearchMatch — tier ordering', () => {
  it('exact name > name prefix > name contains > city exact > state exact', () => {
    const exact = scorePlaceSearchMatch('Jaipur', { name: 'Jaipur' });
    const prefix = scorePlaceSearchMatch('Jaipur', { name: 'Jaipur Gate' });
    const contains = scorePlaceSearchMatch('Jaipur', { name: 'Sanganer Jaipur Road' });
    const city = scorePlaceSearchMatch('Jaipur', { name: 'Hawa Mahal', city: 'Jaipur' });
    const state = scorePlaceSearchMatch('Jaipur', { name: 'Hawa Mahal', state: 'Jaipur' });
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(contains);
    expect(contains).toBeGreaterThan(city);
    expect(city).toBeGreaterThan(state);
    expect(state).toBeGreaterThan(0);
  });

  it('matches the canonical name when the display name differs', () => {
    const canonical = scorePlaceSearchMatch('Marble Rocks', {
      name: 'Bhedaghat',
      canonicalName: 'Marble Rocks',
    });
    expect(canonical).toBeGreaterThan(0);
  });

  it('matches district and state without treating them as the name', () => {
    const district = scorePlaceSearchMatch('Jabalpur', { name: 'Bhedaghat', district: 'Jabalpur' });
    const state = scorePlaceSearchMatch('Madhya Pradesh', { name: 'Bhedaghat', state: 'Madhya Pradesh' });
    expect(district).toBeGreaterThan(0);
    expect(state).toBeGreaterThan(0);
  });

  it('is case-insensitive and ignores null fields', () => {
    expect(scorePlaceSearchMatch('JAIPUR', { name: 'jaipur' })).toBe(
      scorePlaceSearchMatch('jaipur', { name: 'jaipur' }),
    );
    expect(scorePlaceSearchMatch('jabalpur', { name: null, city: undefined, state: null })).toBe(0);
  });

  it('empty / whitespace-only queries score zero', () => {
    expect(scorePlaceSearchMatch('   ', { name: 'Jabalpur' })).toBe(0);
  });
});
