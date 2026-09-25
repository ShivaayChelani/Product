import { describe, expect, it } from 'vitest';
import { scoreAdminMatch, collapseRepeats } from '../modules/search/search-ranking';

describe('scoreAdminMatch relevance tiers', () => {
  it('exact > prefix > token-prefix > substring > no-match', () => {
    const exact = scoreAdminMatch('Jaipur', 'Jaipur');
    const prefix = scoreAdminMatch('jai', 'Jaipur');
    const tokenPrefix = scoreAdminMatch('jaipur', 'Amber Jaipur Fort');
    const substring = scoreAdminMatch('pur', 'Jaipur');
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(tokenPrefix);
    expect(tokenPrefix).toBeGreaterThan(substring);
    expect(substring).toBeGreaterThan(0);
    expect(scoreAdminMatch('xyz', 'Jaipur')).toBe(0);
  });

  it('the primary (name) field outweighs a secondary (city/state) match', () => {
    const namePrefix = scoreAdminMatch('jai', 'Jaipur Gate', 'Rajasthan', 'Jaipur');
    const cityOnly = scoreAdminMatch('raja', 'Hawa Mahal', 'Rajasthan');
    const cityPrefix = scoreAdminMatch('raja', 'Amber Palace', 'Rajasthan');
    expect(namePrefix).toBeGreaterThan(cityOnly);
    expect(cityPrefix).toBeGreaterThan(0);
  });

  it('best field wins for multi-field entities', () => {
    const nameMatch = scoreAdminMatch('hawa', 'Hawa Mahal', 'Amer, Jaipur');
    const cityMatch = scoreAdminMatch('amer', 'Hawa Mahal', 'Amer, Jaipur');
    expect(nameMatch).toBeGreaterThan(cityMatch);
    expect(cityMatch).toBeGreaterThan(0);
  });
});

describe('scoreAdminMatch robustness', () => {
  it('matches case-insensitively', () => {
    expect(scoreAdminMatch('Jaipur', 'jaipur')).toBe(scoreAdminMatch('jaipur', 'jaipur'));
  });

  it('collapsed spelling (nidaan → nidan) still counts as a prefix', () => {
    expect(collapseRepeats('Nidaan')).toBe('nidan');
    expect(scoreAdminMatch('nidaan', 'Nidan Kamal')).toBeGreaterThan(0);
  });

  it('empty / whitespace-only queries score zero', () => {
    expect(scoreAdminMatch('   ', 'Jaipur')).toBe(0);
  });

  it('null and undefined fields are ignored', () => {
    expect(scoreAdminMatch('jhu', null, undefined, 'Jhummer Mahal')).toBeGreaterThan(0);
    expect(scoreAdminMatch('xyz', null, undefined)).toBe(0);
  });
});

describe('collapseRepeats', () => {
  it('collapses every doubled letter run', () => {
    expect(collapseRepeats('Aaaaapple')).toBe('aple');
  });

  it('leaves single letters untouched', () => {
    expect(collapseRepeats('Pushkar')).toBe('pushkar');
  });
});