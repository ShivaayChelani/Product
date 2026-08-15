import { insertAtCursor } from '../features/creator/utils/captionEmoji';
import {
  locationQueryScore,
  mergeLocationSuggestions,
} from '../features/creator/utils/locationSuggestions';

describe('creator caption emoji', () => {
  it('inserts an emoji at the cursor without replacing the whole caption', () => {
    expect(insertAtCursor('Hello place', '🔥', 6, 6)).toEqual({
      text: 'Hello 🔥place',
      cursor: 8,
    });
  });
});

describe('creator location suggestions', () => {
  it('merges places and vendors with kind labels', () => {
    const merged = mergeLocationSuggestions(
      [{ id: 'p1', name: 'Bhedaghat', city: 'Jabalpur' }],
      { data: [{ id: 'v1', businessName: 'River View Cafe', city: 'Jabalpur' }] },
    );
    expect(merged.some((item) => item.kind === 'place' && item.name === 'Bhedaghat')).toBe(true);
    expect(merged.some((item) => item.kind === 'vendor' && item.name === 'River View Cafe')).toBe(true);
    expect(merged.find((item) => item.kind === 'vendor')?.subtitle).toMatch(/Vendor/);
  });

  it('keeps subscribed businesses visible for case-insensitive name search', () => {
    expect(locationQueryScore('River View Cafe', 'cafe')).toBeGreaterThan(0);
    expect(locationQueryScore('River View Cafe', 'CAFE')).toBeGreaterThan(0);
    expect(locationQueryScore('River View Cafe', 'river view cafe')).toBe(3);

    const merged = mergeLocationSuggestions(
      [
        { id: 'p1', name: 'Cafe Road', city: 'Jabalpur' },
        { id: 'p2', name: 'Cafe Point', city: 'Jabalpur' },
        { id: 'p3', name: 'Heritage Cafe', city: 'Jabalpur' },
        { id: 'p4', name: 'Marble Cafe', city: 'Jabalpur' },
        { id: 'p5', name: 'Sunset Cafe', city: 'Jabalpur' },
      ],
      { data: [{ id: 'v1', businessName: 'Nidan Cafe', city: 'Jabalpur' }] },
      8,
      'CAFE',
    );
    expect(merged.some((item) => item.kind === 'vendor' && item.name === 'Nidan Cafe')).toBe(true);
  });
});
