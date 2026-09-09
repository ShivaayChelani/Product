/**
 * ITINERARY HARDENING — Section 5: Destination / city matching hardening.
 *
 * Covers the full public surface of the destination-matching module,
 * including edge inputs that must never crash or misplace a place.
 */
import {
  canonicalizeDestination,
  cityKeyFromPlace,
  destinationMatchesCity,
  placeBelongsToDestination,
  isGenericDestination,
  tripCanAcceptPlaceCity,
  extractMustVisitHints,
  normalizeDestinationKey,
  formatDestinationLabel,
} from '../utils/destination';

describe('canonicalizeDestination hardening', () => {
  it('matches an exact city', () => {
    expect(canonicalizeDestination('Kolkata')).toBe('kolkata');
  });

  it('handles case differences', () => {
    expect(canonicalizeDestination('KOLKATA')).toBe('kolkata');
    expect(canonicalizeDestination('kolkata')).toBe('kolkata');
  });

  it('handles whitespace differences', () => {
    expect(canonicalizeDestination('  Kolkata  ')).toBe('kolkata');
    expect(canonicalizeDestination('Kolkata District')).toBe('kolkata');
  });

  it('handles city + state', () => {
    expect(canonicalizeDestination('Pune, Maharashtra')).toBe('pune');
  });

  it('handles a generic destination', () => {
    expect(canonicalizeDestination('My Trip')).toBe('my trip');
  });

  it('does not crash on missing city / null destination', () => {
    expect(canonicalizeDestination(undefined as any)).toBe('');
    expect(canonicalizeDestination(null as any)).toBe('');
    expect(canonicalizeDestination('')).toBe('');
  });

  it('does not over-normalize unrelated cities into each other', () => {
    expect(canonicalizeDestination('Ranchi')).toBe('ranchi');
    expect(canonicalizeDestination('Ranchi') === canonicalizeDestination('Delhi')).toBe(false);
  });
});

describe('cityKeyFromPlace hardening', () => {
  it('returns city when present', () => {
    expect(cityKeyFromPlace({ city: 'Kolkata', state: 'West Bengal' })).toBe('kolkata');
  });

  it('falls back to state when city is missing', () => {
    expect(cityKeyFromPlace({ city: null, state: 'West Bengal' })).toBe('west bengal');
    expect(cityKeyFromPlace({ state: 'Goa' })).toBe('goa');
  });

  it('returns empty for a place with no city or state', () => {
    expect(cityKeyFromPlace({})).toBe('');
    expect(cityKeyFromPlace({ city: '', state: '' })).toBe('');
    expect(cityKeyFromPlace(null as any)).toBe('');
  });
});

describe('destinationMatchesCity hardening', () => {
  it('true on exact city match', () => {
    expect(destinationMatchesCity('Kolkata', 'kolkata')).toBe(true);
  });

  it('false when destination is generic', () => {
    expect(destinationMatchesCity('My Itinerary', 'kolkata')).toBe(false);
    expect(destinationMatchesCity('', 'kolkata')).toBe(false);
  });

  it('false when city mismatches', () => {
    expect(destinationMatchesCity('Delhi', 'kolkata')).toBe(false);
  });

  it('false on null / undefined destination', () => {
    expect(destinationMatchesCity(null, 'kolkata')).toBe(false);
    expect(destinationMatchesCity(undefined, 'kolkata')).toBe(false);
  });
});

describe('placeBelongsToDestination hardening', () => {
  it('true when place city is the destination', () => {
    expect(placeBelongsToDestination({ city: 'Kolkata' }, 'Kolkata')).toBe(true);
  });

  it('true when place state is the destination region', () => {
    expect(placeBelongsToDestination({ city: 'Gangtok', state: 'Sikkim' }, 'Sikkim')).toBe(true);
  });

  it('true when place name embeds the destination', () => {
    expect(placeBelongsToDestination({ name: 'Victoria Memorial, Kolkata' }, 'Kolkata')).toBe(true);
  });

  it('false when place is outside the destination', () => {
    expect(placeBelongsToDestination({ city: 'Delhi' }, 'Kolkata')).toBe(false);
    expect(placeBelongsToDestination({ city: 'Howrah', state: 'West Bengal' }, 'Kolkata')).toBe(false);
  });

  it('false when destination is a mismatched city', () => {
    expect(placeBelongsToDestination({ city: 'Mumbai' }, 'Delhi')).toBe(false);
  });

  it('false when destination is generic / empty', () => {
    expect(placeBelongsToDestination({ city: 'Kolkata' }, '')).toBe(false);
    expect(placeBelongsToDestination({ city: 'Kolkata' }, 'My Trip')).toBe(false);
  });

  it('does not crash on a null place', () => {
    expect(placeBelongsToDestination(null as any, 'Kolkata')).toBe(false);
  });

  it('handles case/whitespace differences on both sides', () => {
    expect(placeBelongsToDestination({ city: '  KOLKATA ' }, ' kolkata ')).toBe(true);
  });
});

describe('tripCanAcceptPlaceCity hardening', () => {
  it('rejects a place when the trip already has a different city stop', () => {
    expect(tripCanAcceptPlaceCity('Kolkata', ['delhi'], 'kolkata')).toBe(false);
  });

  it('accepts a place when the trip destination matches its city', () => {
    expect(tripCanAcceptPlaceCity('Kolkata', [], 'kolkata')).toBe(true);
  });

  it('accepts the first city stop on a generic empty draft', () => {
    expect(tripCanAcceptPlaceCity('My Trip', [], 'kolkata')).toBe(true);
  });

  it('rejects a city stop on a concrete non-matching destination', () => {
    expect(tripCanAcceptPlaceCity('Delhi', [], 'kolkata')).toBe(false);
  });
});

describe('isGenericDestination + normalizeDestinationKey', () => {
  it('classifies generic and concrete destinations', () => {
    expect(isGenericDestination('')).toBe(true);
    expect(isGenericDestination('My Trip')).toBe(true);
    expect(isGenericDestination(null)).toBe(true);
    expect(isGenericDestination('Kolkata')).toBe(false);
  });

  it('normalizes punctuation and district suffixes', () => {
    expect(normalizeDestinationKey('Kolkata District!')).toBe('kolkata district');
    expect(normalizeDestinationKey('  pune, mh  ')).toBe('pune mh');
  });

  it('formats canonical labels with title case', () => {
    expect(formatDestinationLabel('ranchi')).toBe('Ranchi');
    expect(formatDestinationLabel('KOLKATA')).toBe('Kolkata');
  });
});

describe('extractMustVisitHints', () => {
  it('extracts quoted landmarks', () => {
    const hints = extractMustVisitHints('Plan a trip to Kolkata including "Victoria Memorial" and "Howrah Bridge"', 'Kolkata');
    expect(hints).toContain('Victoria Memorial');
    expect(hints).toContain('Howrah Bridge');
  });

  it('returns [] for empty prompt', () => {
    expect(extractMustVisitHints('', 'Kolkata')).toEqual([]);
    expect(extractMustVisitHints(null, 'Kolkata')).toEqual([]);
    expect(extractMustVisitHints('   ', 'Kolkata')).toEqual([]);
  });

  it('never returns the destination itself as a hint', () => {
    const hints = extractMustVisitHints('I want to visit Kolkata', 'Kolkata');
    expect(hints.includes('kolkata')).toBe(false);
  });
});