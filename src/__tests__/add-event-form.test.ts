/**
 * Add Event flow: route wiring, the pure form helpers, and the payload builder.
 *
 * Follows the project's source-assertion convention (see events-discovery.test.ts)
 * for navigation wiring plus plain unit tests for `eventFormDate`, which holds no
 * React so it can run headlessly.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
    multiSet: jest.fn(() => Promise.resolve()),
    multiRemove: jest.fn(() => Promise.resolve()),
  },
}));

import fs from 'fs';
import path from 'path';
import {
  buildCreateEventInput,
  EMPTY_EVENT_DRAFT,
  EVENT_FORM_LIMITS,
  EVENT_SUBMIT_NOTICE,
  firstEventFormError,
  formatDisplayDate,
  formatTime12,
  isDateOnOrAfter,
  isDraftDirty,
  isEventDraftSubmittable,
  isHttpUrl,
  isTimeAfter,
  partsToHhmm,
  toIsoDate,
  validateEventDraft,
  type EventDraft,
} from '../features/events/eventFormDate';

const root = path.join(__dirname, '..');

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const MIN_OK = {
  title: 'Jaipur Literature Festival',
  eventType: 'FESTIVAL',
  startDate: '2026-11-07',
  endDate: '2026-11-09',
  startTime: '10:00',
  endTime: '17:30',
  hasLocation: true,
  latitude: 26.8856,
  longitude: 75.8086,
  address: 'Jawahar Kala Kendra, Jaipur',
  city: 'Jaipur',
  state: 'Rajasthan',
  shortDescription: 'India’s biggest literary gathering.',
  description: 'A long description about books and writers.',
  coverImageUri: null,
  imageUris: [],
  organizerName: 'Team JKLF',
  organizerContact: '',
  websiteUrl: '',
  entryFee: '',
  linkedPlaceId: null,
  linkedPlaceName: null,
} satisfies EventDraft;

function valid(): EventDraft {
  return { ...EMPTY_EVENT_DRAFT, ...MIN_OK };
}

describe('event form: date helpers', () => {
  it('writes local-time zone YYYY-MM-DD, not UTC', () => {
    // 20:30 IST == 15:00Z. toIsoDate must keep the calendar day the user sees.
    const evening = new Date(2026, 9, 6, 20, 30);
    expect(toIsoDate(evening)).toBe('2026-10-06');
  });

  it('rejects impossible calendar days instead of rolling them forward', () => {
    expect(isDateOnOrAfter('2026-02-30', '2026-02-28')).toBe(false);
    expect(isDateOnOrAfter('2026-04-31', '2026-04-01')).toBe(false);
    expect(isDateOnOrAfter('2026-03-02', '2026-02-28')).toBe(true);
  });

  it('renders a readable label and tolerates junk input', () => {
    expect(formatDisplayDate('2027-03-14')).toContain('2027');
    expect(formatDisplayDate('not-a-date')).toBe('');
  });
});

describe('event form: time helpers', () => {
  it('round-trips the 12-hour wheel into 24-hour wire text', () => {
    expect(partsToHhmm(9, 30, 'AM')).toBe('09:30');
    expect(partsToHhmm(12, 0, 'AM')).toBe('00:00');
    expect(partsToHhmm(12, 15, 'PM')).toBe('12:15');
    expect(partsToHhmm(9, 45, 'PM')).toBe('21:45');
    expect(formatTime12('09:30')).toBe('9:30 AM');
    expect(formatTime12('18:00')).toBe('6:00 PM');
  });

  it('requires the end strictly after the start', () => {
    expect(isTimeAfter('10:00', '10:30')).toBe(true);
    expect(isTimeAfter('10:30', '10:30')).toBe(false);
    expect(isTimeAfter('10:30', '10:00')).toBe(false);
    expect(isTimeAfter('bogus', '10:00')).toBe(false);
  });

  it('accepts only http(s) websites', () => {
    expect(isHttpUrl('https://example.com')).toBe(true);
    expect(isHttpUrl('http://example.com')).toBe(true);
    expect(isHttpUrl('example.com')).toBe(false);
    expect(isHttpUrl('ftp://example.com')).toBe(false);
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
  });
});

describe('event form: validation', () => {
  it('accepts a fully completed draft', () => {
    expect(isEventDraftSubmittable(valid())).toBe(true);
  });

  it('flags the title, type and schedule in screen order', () => {
    const draft = valid();
    draft.title = 'x';
    draft.eventType = null;
    draft.startDate = '';
    const fields = validateEventDraft(draft).map(e => e.field);
    expect(fields).toEqual(expect.arrayContaining(['title', 'eventType', 'startDate']));
    expect(firstEventFormError(draft)?.field).toBe('title');
  });

  it('requires coordinates and rejects a missing pair', () => {
    const draft = valid();
    draft.hasLocation = false;
    expect(firstEventFormError(draft)?.field).toBe('location');
  });

  it('rejects an end date before the start date', () => {
    const draft = valid();
    draft.endDate = '2026-11-01';
    const errs = firstFieldErrors(draft);
    expect(errs.endDate).toMatch(/before the start date/i);
  });

  it('clamps oversized images and long text', () => {
    const draft = valid();
    draft.imageUris = Array.from({ length: 8 }, (_, i) => `file:///photo-${i}.jpg`);
    draft.description = 'a'.repeat(EVENT_FORM_LIMITS.descriptionMax + 1);
    const errs = firstFieldErrors(draft);
    expect(errs.images).toMatch(/photos/i);
    expect(errs.description).toMatch(/characters or fewer/i);
  });

  it('validates the website and the entry fee when supplied', () => {
    const draft = valid();
    draft.websiteUrl = 'not-a-url';
    draft.entryFee = '-5';
    const errs = firstFieldErrors(draft);
    expect(errs.websiteUrl).toMatch(/http/);
    expect(errs.entryFee).toMatch(/cannot be negative/i);
  });
});

describe('event form: dirty tracking + payload', () => {
  it('starts clean and becomes dirty on any edit', () => {
    expect(isDraftDirty(EMPTY_EVENT_DRAFT)).toBe(false);
    const touched = { ...EMPTY_EVENT_DRAFT, startTime: '10:00' };
    expect(isDraftDirty(touched)).toBe(true);
  });

  it('never sends moderation fields the server owns', () => {
    const input = buildCreateEventInput(valid(), { coverImage: null, images: [] });
    expect(input).not.toHaveProperty('status');
    expect(input).not.toHaveProperty('approvedAt');
    expect(input).not.toHaveProperty('approvedBy');
    expect(input.status).toBeUndefined();
  });

  it('defaults endDate to startDate and converts blanks to null', () => {
    const draft = valid();
    draft.endDate = '';
    draft.city = '';
    draft.state = '';
    draft.entryFee = '';
    const input = buildCreateEventInput(draft, { coverImage: null, images: [] });
    expect(input.endDate).toBe(input.startDate);
    expect(input.city).toBeNull();
    expect(input.state).toBeNull();
    expect(input.entryFee).toBeNull();
  });

  it('never coerces a blank fee to 0, but keeps an explicit 0', () => {
    const blank = buildCreateEventInput(valid(), { coverImage: null, images: [] });
    expect(blank.entryFee).toBeNull();

    const free = valid();
    free.entryFee = '0';
    expect(buildCreateEventInput(free, { coverImage: null, images: [] }).entryFee).toBe(0);
  });

  it('strips + truncates long optional text instead of failing the submit', () => {
    const draft = valid();
    draft.address = `  ${'a'.repeat(EVENT_FORM_LIMITS.addressMax + 20)}  `;
    const input = buildCreateEventInput(draft, { coverImage: null, images: [] });
    expect(input.address).not.toBeNull();
    expect(input.address!.length).toBe(EVENT_FORM_LIMITS.addressMax);
  });

  it('advertises the PENDING REVIEW status copy', () => {
    expect(EVENT_SUBMIT_NOTICE.status).toBe('PENDING REVIEW');
    expect(EVENT_SUBMIT_NOTICE.title).toContain('submitted for review');
  });
});

describe('event form: navigation wiring', () => {
  it('registers the form, the map picker and My Events on the root stack', () => {
    const src = read('navigation/RootNavigator.tsx');
    expect(src).toMatch(/name="AddEvent"/);
    expect(src).toMatch(/name="PickEventLocation"/);
    expect(src).toMatch(/name="MyEvents"/);
  });

  it('keeps the Add Event screen identity stable when picker params merge back', () => {
    const src = read('navigation/RootNavigator.tsx');
    expect(src).toMatch(/const loadAddEventScreen = \(\) => require\('\.\.\/screens\/AddEventScreen'\);/);
    expect(src).toMatch(/useLazyScreen\(loadAddEventScreen, 'AddEvent'\)/);
  });

  it('types PickEventLocation and AddEvent params for merged results', () => {
    const src = read('navigation/types.ts');
    expect(src).toMatch(/PickedEventLocation\b/);
    expect(src).toMatch(/PickEventLocation:/);
    expect(src).toMatch(/AddEvent:/);
    expect(src).toMatch(/pickedNonce/);
  });

  it('opens AddEvent and MyEvents from the Events header', () => {
    const src = read('screens/EventsScreen.tsx');
    expect(src).toMatch(/navigation\.navigate\('MyEvents'\)/);
    expect(src).toMatch(/navigation\.navigate\('AddEvent'\)/);
    expect(src).toMatch(/events-add-event"/);
    expect(src).toMatch(/events-my-events"/);
  });

  it('returns to the existing AddEvent screen with the picked location', () => {
    const src = read('screens/PickEventLocationScreen.tsx');
    expect(src).toMatch(/navigation\.popTo\('AddEvent'/);
    expect(src).toMatch(/pickedLocation/);
    expect(src).toMatch(/pickedNonce/);
    expect(src).toMatch(/pickCenter/);
  });
});

function firstFieldErrors(draft: EventDraft): Record<string, string> {
  const map: Record<string, string> = {};
  for (const error of validateEventDraft(draft)) {
    map[error.field] = error.message;
  }
  return map;
}

describe('event form: submit guard rails', () => {
  const screen = read('screens/AddEventScreen.tsx');

  it('refuses to submit until every required field validates', () => {
    expect(screen).toMatch(/if \(!runClientValidation\(\)\) return;/);
    expect(screen).toMatch(/const found = validateEventDraft\(target\);/);
    expect(screen).toMatch(/setSubmitting\(true\);/);
    expect(screen).toMatch(/eventsApi\.create\(input\)/);
  });

  it('re-validates the live draft after uploads, before the create call', () => {
    // Uploads are async: the draft can change while they run, so the payload is
    // built from (and validated against) the ref, never the submit-time closure.
    expect(screen).toMatch(/const draftRef = useRef\(draft\);/);
    expect(screen).toMatch(/const live = draftRef\.current;/);
    expect(screen).toMatch(/if \(!runClientValidation\(live\)\) return;/);
    expect(screen).toMatch(/buildCreateEventInput\(live, \{ coverImage: cover, images: gallery \}\)/);
  });
});