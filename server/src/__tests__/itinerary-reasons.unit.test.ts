import { describe, expect, it } from 'vitest';
import { buildReason, humanizeCategory } from '../modules/trips/itineraryEngine';
import type { CandidatePlace } from '../modules/trips/itineraryEngine';

const mkPlace = (over: Partial<CandidatePlace> = {}): CandidatePlace => ({
  id: 'p1',
  name: 'Riverside Ghat',
  category: 'riverfront_/_nature',
  tags: [],
  city: 'Jabalpur',
  state: 'MP',
  latitude: 23.1,
  longitude: 79.8,
  rating: null,
  popularityScore: null,
  hiddenGemScore: null,
  editorialPriority: 3,
  openingHours: null,
  ticketPrice: null,
  estimatedDurationMinutes: null,
  recommendedDuration: null,
  score: 1,
  isPinned: false,
  ...over,
});

describe('humanizeCategory', () => {
  it('converts raw slugs into readable labels', () => {
    expect(humanizeCategory('riverfront_/_nature')).toBe('Riverfront Nature');
    expect(humanizeCategory('park_/_recreational')).toBe('Park Recreational');
    expect(humanizeCategory('waterfall')).toBe('Waterfall');
    expect(humanizeCategory('')).toBe('local spot');
  });
});

describe('buildReason (deterministic copy quality)', () => {
  it('never leaks raw category slugs', () => {
    const reason = buildReason(mkPlace(), ['nature'], 2.4);
    expect(reason).not.toMatch(/_/);
    expect(reason).not.toMatch(/riverfront_\/_nature/);
  });

  it('does not repeat the distance claim — journey layer owns proximity', () => {
    const reason = buildReason(mkPlace({ category: 'temple' }), ['temples'], 2.4);
    expect((reason.match(/km/g) || []).length).toBe(0);
    expect(reason).toContain('fits your interest in temples');
  });

  it('does not claim "Popular"/"Highly rated" without supporting data', () => {
    const reason = buildReason(mkPlace(), [], 0);
    expect(reason.toLowerCase()).not.toContain('popular');
    expect(reason.toLowerCase()).not.toContain('highly rated');
  });

  it('may cite ratings only when rating AND reviews exist', () => {
    const supported = buildReason(mkPlace({ category: 'fort', rating: 4.6, reviewCount: 120 }), [], 0);
    expect(supported).toMatch(/Well-rated fort/i);

    const unsupported = buildReason(mkPlace({ category: 'fort', rating: 4.6, reviewCount: 0 }), [], 0);
    expect(unsupported.toLowerCase()).not.toContain('well-rated');
  });

  it('stays factual and concise for unknown-metadata places', () => {
    const reason = buildReason(mkPlace({ category: 'lake' }), [], 0);
    expect(reason).toBe('Lake.');
  });
});
