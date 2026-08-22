import { describe, expect, it } from 'vitest';
import {
  isPlaceOpenAt,
  nextOpenMinuteAt,
  normalizeOpeningHours,
} from '../modules/trips/itineraryEngine';

/** Production import shape: capitalized weekday keys, array of window objects. */
const PRODUCTION_SHAPE = {
  Friday: [{ open: '09:00', close: '18:00' }],
  Monday: [{ open: '07:00', close: '18:00' }],
};

describe('normalizeOpeningHours (production data compatibility)', () => {
  it('normalizes the production array-of-windows shape with case-insensitive keys', () => {
    const norm = normalizeOpeningHours(PRODUCTION_SHAPE);
    expect(norm).not.toBeNull();
    expect(norm!['friday']).toEqual([{ open: 540, close: 1080 }]);
    expect(norm!['monday']).toEqual([{ open: 420, close: 1080 }]);
  });

  it('still supports the legacy string range shape', () => {
    const norm = normalizeOpeningHours({ friday: '07:00 - 18:00' });
    expect(norm!['friday']).toEqual([{ open: 420, close: 1080 }]);
  });

  it('supports am/pm strings and generic daily fallback keys', () => {
    const norm = normalizeOpeningHours({ daily: '9 AM - 5 PM' });
    expect(norm!['daily']).toEqual([{ open: 540, close: 1020 }]);

    const withMeridiem = normalizeOpeningHours({ Friday: [{ open: '06:00am', close: '6pm' }] });
    expect(withMeridiem!['friday']).toEqual([{ open: 360, close: 1080 }]);
  });

  it('treats zero-length windows as invalid, not open', () => {
    // Real corrupted record found in the audit: open === close on every day.
    const corrupt = {
      Friday: [{ open: '07:00', close: '07:00' }],
      Monday: [{ open: '00:00', close: '00:00' }],
    };
    expect(normalizeOpeningHours(corrupt)).toBeNull();
  });

  it('marks explicit "closed" days and keeps them distinct from unknown', () => {
    const norm = normalizeOpeningHours({ monday: 'Closed', Tuesday: [{ open: '9', close: '17' }] });
    expect(norm!['monday']).toEqual([]);
    expect(norm!['tuesday']).toEqual([{ open: 540, close: 1020 }]);
  });

  it('supports overnight windows (close < open wraps past midnight)', () => {
    const norm = normalizeOpeningHours({ friday: [{ open: '21:00', close: '02:00' }] });
    expect(norm!['friday']).toEqual([{ open: 1260, close: 1560 }]);
  });

  it('drops malformed entries instead of fabricating hours', () => {
    const norm = normalizeOpeningHours({
      friday: [{ open: 'garbage', close: '18:00' }, { open: '10:00', close: '12:00' }],
      saturday: 'whenever',
    });
    expect(norm).not.toBeNull();
    expect(Object.keys(norm!)).toEqual(['friday']);
    expect(norm!['friday']).toEqual([{ open: 600, close: 720 }]);
  });

  it('returns null for empty/null/unparseable input', () => {
    expect(normalizeOpeningHours(null)).toBeNull();
    expect(normalizeOpeningHours(undefined)).toBeNull();
    expect(normalizeOpeningHours({})).toBeNull();
    expect(normalizeOpeningHours({ friday: 'nonsense' })).toBeNull();
  });
});

describe('isPlaceOpenAt (normalized evaluation)', () => {
  const friday = new Date('2026-01-02T00:00:00Z'); // a Friday

  it('open during visit window', () => {
    expect(isPlaceOpenAt(PRODUCTION_SHAPE, friday, 600)).toBe(true); // 10:00
  });

  it('closes before visit -> false', () => {
    expect(isPlaceOpenAt(PRODUCTION_SHAPE, friday, 19 * 60)).toBe(false); // 19:00 after 18:00 close
  });

  it('opens after visit -> false', () => {
    expect(isPlaceOpenAt(PRODUCTION_SHAPE, friday, 8 * 60)).toBe(false); // 08:00 before 09:00 open
  });

  it('explicitly closed day -> false even at noon', () => {
    expect(isPlaceOpenAt({ monday: 'Closed' }, new Date('2026-01-05T00:00:00Z'), 720)).toBe(false);
  });

  it('overnight window covers late night and early morning spill', () => {
    const overnight = { friday: [{ open: '21:00', close: '02:00' }] };
    expect(isPlaceOpenAt(overnight, friday, 22 * 60)).toBe(true);   // 22:00 same evening
    expect(isPlaceOpenAt(overnight, friday, 1 * 60)).toBe(true);    // 01:00 (window from "yesterday" side)
    expect(isPlaceOpenAt(overnight, friday, 12 * 60)).toBe(false);  // noon
  });

  it('malformed / missing data -> UNKNOWN (null), never falsely open', () => {
    expect(isPlaceOpenAt(null, friday, 600)).toBeNull();
    expect(isPlaceOpenAt({}, friday, 600)).toBeNull();
    expect(isPlaceOpenAt({ friday: [{ open: 'xx', close: 'yy' }] }, friday, 600)).toBeNull();
    // Zero-length corruption: no valid window -> unknown
    expect(isPlaceOpenAt({ friday: [{ open: '07:00', close: '07:00' }] }, friday, 600)).toBeNull();
  });

  it('unknown weekday falls back to daily when provided', () => {
    expect(isPlaceOpenAt({ daily: '24 hours' }, friday, 3 * 60)).toBe(true);
  });

  it('without a date only generic keys can answer', () => {
    expect(isPlaceOpenAt(PRODUCTION_SHAPE, null, 600)).toBeNull();
    expect(isPlaceOpenAt({ all: '09:00 - 17:00' }, null, 600)).toBe(true);
  });
});

describe('nextOpenMinuteAt (schedule shift support)', () => {
  const friday = new Date('2026-01-02T00:00:00Z');

  it('returns the opening minute when arrival is before open', () => {
    expect(nextOpenMinuteAt(PRODUCTION_SHAPE, friday, 7 * 60)).toBe(540);
  });

  it('returns null when already open, closed all day, or unknown', () => {
    expect(nextOpenMinuteAt(PRODUCTION_SHAPE, friday, 600)).toBeNull();
    expect(nextOpenMinuteAt({ friday: 'Closed' }, friday, 600)).toBeNull();
    expect(nextOpenMinuteAt(null, friday, 600)).toBeNull();
  });

  it('returns null when opening has passed for good (closing soon)', () => {
    expect(nextOpenMinuteAt(PRODUCTION_SHAPE, friday, 19 * 60)).toBeNull();
  });
});
