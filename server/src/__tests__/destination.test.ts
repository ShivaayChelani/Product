import { describe, expect, it } from 'vitest';
import {
  canonicalizeDestination,
  extractMustVisitHints,
  placeBelongsToDestination,
  formatDestinationLabel,
  destinationMatchesInText,
  isGenericDestination,
  cityKeyFromPlace,
  destinationMatchesCity,
  tripCanAcceptPlaceCity,
} from '../shared/utils/destination';
import { INDIA_DESTINATION_ALIASES } from '../../../shared/indiaDestinationAliases';

describe('destination accuracy helpers', () => {
  it('treats placeholder destinations as generic and matches city keys', () => {
    expect(isGenericDestination('My Trip')).toBe(true);
    expect(isGenericDestination('Jaipur')).toBe(false);
    expect(cityKeyFromPlace({ city: 'Bangalore', state: 'Karnataka' })).toBe('bengaluru');
    expect(destinationMatchesCity('Bengaluru', 'bengaluru')).toBe(true);
    expect(destinationMatchesCity('My Trip', 'jaipur')).toBe(false);
  });

  it('canonicalizes common aliases', () => {
    expect(canonicalizeDestination('Bangalore')).toBe('bengaluru');
    expect(canonicalizeDestination('New Delhi')).toBe('delhi');
    expect(canonicalizeDestination('Pondicherry')).toBe('puducherry');
    expect(canonicalizeDestination('  JAIPUR city ')).toBe('jaipur');
  });

  it('formats destination labels for trip titles', () => {
    expect(formatDestinationLabel('bangalore')).toBe('Bengaluru');
    expect(formatDestinationLabel('jim corbett')).toBe('Jim Corbett');
  });

  it('accepts places that belong to the asked city and rejects others', () => {
    expect(placeBelongsToDestination({ city: 'Jaipur', state: 'Rajasthan', name: 'Hawa Mahal' }, 'Jaipur')).toBe(true);
    expect(placeBelongsToDestination({ city: 'Agra', state: 'Uttar Pradesh', name: 'Taj Mahal' }, 'Jaipur')).toBe(false);
    expect(placeBelongsToDestination({ city: 'Kochi', state: 'Kerala', name: 'Fort Kochi' }, 'Kerala')).toBe(true);
    expect(placeBelongsToDestination({ city: 'Hampi', state: 'Karnataka', name: 'Vittala Temple' }, 'Hampi')).toBe(true);
  });

  it('maps Kashi to Varanasi and rejects Uttarkashi false positives', () => {
    expect(canonicalizeDestination('Kashi')).toBe('varanasi');
    expect(placeBelongsToDestination({ city: 'Varanasi', state: 'Uttar Pradesh', name: 'Dashashwamedh Ghat' }, 'Kashi')).toBe(true);
    expect(placeBelongsToDestination({ city: 'Uttarkashi', state: 'Uttarakhand', name: 'Some Temple' }, 'Kashi')).toBe(false);
  });

  it('does not map Kashmir trips to Varanasi via kashi substring', () => {
    expect(canonicalizeDestination('Kashmir')).toBe('kashmir');
    expect(canonicalizeDestination('trip to kashmir valley')).toBe('kashmir');
    expect(placeBelongsToDestination({ city: 'Srinagar', state: 'Jammu and Kashmir', name: 'Dal Lake' }, 'Kashmir')).toBe(true);
  });

  it('canonicalizes place city variants to match destination', () => {
    expect(placeBelongsToDestination({ city: 'Bangalore', state: 'Karnataka', name: 'Lalbagh' }, 'Bengaluru')).toBe(true);
    expect(placeBelongsToDestination({ city: 'Mysore', state: 'Karnataka', name: 'Palace' }, 'Mysuru')).toBe(true);
    expect(placeBelongsToDestination({ city: 'Madikeri', state: 'Karnataka', name: 'Abbey Falls' }, 'Coorg')).toBe(true);
    expect(placeBelongsToDestination({ city: 'Gurgaon', state: 'Haryana', name: 'Kingdom of Dreams' }, 'Gurugram')).toBe(true);
  });

  it('maps widespread India city aliases', () => {
    const samples: Array<[string, string]> = [
      ['Bombay', 'mumbai'],
      ['Calcutta', 'kolkata'],
      ['Madras', 'chennai'],
      ['Benares', 'varanasi'],
      ['Allahabad', 'prayagraj'],
      ['Trivandrum', 'thiruvananthapuram'],
      ['Cochin', 'kochi'],
      ['Alleppey', 'alappuzha'],
      ['Calicut', 'kozhikode'],
      ['Baroda', 'vadodara'],
      ['Simla', 'shimla'],
      ['Trichy', 'tiruchirappalli'],
      ['Tanjore', 'thanjavur'],
      ['Vizag', 'visakhapatnam'],
      ['Panjim', 'goa'],
      ['Corbett', 'jim corbett'],
    ];
    for (const [input, expected] of samples) {
      expect(canonicalizeDestination(input), input).toBe(expected);
    }
  });

  it('every alias resolves to a non-empty canonical', () => {
    for (const [alias, canonical] of Object.entries(INDIA_DESTINATION_ALIASES)) {
      expect(alias.length, alias).toBeGreaterThan(0);
      expect(canonical.length, `${alias} -> ${canonical}`).toBeGreaterThan(0);
      expect(canonicalizeDestination(alias), alias).toBe(canonical);
    }
  });

  it('word-boundary matching avoids substring false positives', () => {
    expect(destinationMatchesInText('uttarkashi', 'kashi')).toBe(false);
    expect(destinationMatchesInText('kashmir', 'kashi')).toBe(false);
    expect(destinationMatchesInText('ongole', 'goa')).toBe(false);
    expect(destinationMatchesInText('varanasi', 'kashi')).toBe(false);
    expect(destinationMatchesInText('new delhi', 'delhi')).toBe(true);
    expect(destinationMatchesInText('jaipur district', 'jaipur')).toBe(true);
  });

  it('extracts must-visit landmarks from a free-text prompt', () => {
    const hints = extractMustVisitHints(
      'Plan a 2-day trip to Agra with Taj Mahal, Agra Fort and Mehtab Bagh',
      'Agra',
    );
    expect(hints.some((h) => /taj mahal/i.test(h))).toBe(true);
    expect(hints.some((h) => /agra fort/i.test(h))).toBe(true);
    expect(hints.some((h) => /mehtab bagh/i.test(h))).toBe(true);
    expect(hints.every((h) => h.toLowerCase() !== 'agra')).toBe(true);
  });

  it('enforces one itinerary per destination city', () => {
    expect(tripCanAcceptPlaceCity('Jabalpur', ['jabalpur'], 'jabalpur')).toBe(true);
    expect(tripCanAcceptPlaceCity('Jabalpur', ['jabalpur'], 'ujjain')).toBe(false);
    expect(tripCanAcceptPlaceCity('My Trip', [], 'ujjain')).toBe(true);
    expect(tripCanAcceptPlaceCity('Jabalpur', ['jabalpur'], '')).toBe(false);
    expect(tripCanAcceptPlaceCity('Jabalpur', ['jabalpur', 'sawai madhopur'], 'jabalpur')).toBe(false);
  });
});
