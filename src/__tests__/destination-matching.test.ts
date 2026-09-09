import {
  canonicalizeDestination,
  cityKeyFromPlace,
  destinationMatchesCity,
  placeBelongsToDestination,
  isGenericDestination
} from '../utils/destination';

describe('canonicalizeDestination', () => {
  it('handles exact city matches', () => {
    expect(canonicalizeDestination('mumbai')).toBe('mumbai');
    expect(canonicalizeDestination('delhi')).toBe('delhi');
  });

  it('handles case differences', () => {
    expect(canonicalizeDestination('MUMBAI')).toBe('mumbai');
    expect(canonicalizeDestination('Delhi')).toBe('delhi');
  });

  it('handles whitespace differences', () => {
    expect(canonicalizeDestination('  mumbai  ')).toBe('mumbai');
    expect(canonicalizeDestination('new   delhi')).toBe('delhi'); // normalized by INDIA_DESTINATION_ALIASES
  });

  it('handles city + state gracefully by prioritizing city matching', () => {
    expect(canonicalizeDestination('mumbai, maharashtra')).toBe('mumbai'); // normalized to mumbai
  });

  it('handles null or empty destination', () => {
    expect(canonicalizeDestination('')).toBe('');
    // @ts-ignore
    expect(canonicalizeDestination(null)).toBe('');
  });
});

describe('isGenericDestination', () => {
  it('identifies generic destinations', () => {
    expect(isGenericDestination('')).toBe(true);
    expect(isGenericDestination('my trip')).toBe(true);
    expect(isGenericDestination('my itinerary')).toBe(true);
    expect(isGenericDestination('My Trip')).toBe(true);
  });

  it('returns false for actual cities', () => {
    expect(isGenericDestination('mumbai')).toBe(false);
    expect(isGenericDestination('goa')).toBe(false);
  });
});

describe('cityKeyFromPlace', () => {
  it('extracts city key', () => {
    expect(cityKeyFromPlace({ city: 'Mumbai', state: 'Maharashtra' })).toBe('mumbai');
  });

  it('falls back to state if city is missing', () => {
    expect(cityKeyFromPlace({ city: '', state: 'Goa' })).toBe('goa');
    expect(cityKeyFromPlace({ state: 'Kerala' })).toBe('kerala');
  });
});

describe('destinationMatchesCity', () => {
  it('returns true for matching cities', () => {
    expect(destinationMatchesCity('Mumbai', 'mumbai')).toBe(true);
    expect(destinationMatchesCity('New Delhi', 'delhi')).toBe(true); // new delhi normalizes to delhi
  });

  it('returns false for generic destinations', () => {
    expect(destinationMatchesCity('my trip', 'mumbai')).toBe(false);
  });

  it('returns false for mismatched cities', () => {
    expect(destinationMatchesCity('mumbai', 'delhi')).toBe(false);
  });
});

describe('placeBelongsToDestination', () => {
  it('returns true if city matches destination exactly', () => {
    expect(placeBelongsToDestination({ city: 'mumbai' }, 'mumbai')).toBe(true);
  });

  it('returns true if city matches destination with case difference', () => {
    expect(placeBelongsToDestination({ city: 'MUMBAI' }, 'mumbai')).toBe(true);
  });

  it('returns false for place outside destination', () => {
    expect(placeBelongsToDestination({ city: 'delhi' }, 'mumbai')).toBe(false);
  });

  it('returns true if name contains the destination', () => {
    expect(placeBelongsToDestination({ name: 'Gateway of India, Mumbai' }, 'mumbai')).toBe(true);
  });
});
