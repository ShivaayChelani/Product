import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Canonical Places contract fields (canonical_name, district, image_metadata):
 * - sanitizeImageMetadata strips null/blank entries
 * - create/update place validation accepts the new fields
 * - bulk import maps them into create/update writes and sanitizes metadata
 */

const h = vi.hoisted(() => ({
  findMany: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('../config/database', () => ({
  prisma: {
    place: {
      findMany: h.findMany,
      findUnique: h.findUnique,
      create: h.create,
      update: h.update,
    },
    $transaction: h.transaction,
  },
}));

import { placesBulkService } from '../modules/places/services/places.bulk.service';
import { sanitizeImageMetadata } from '../modules/places/services/places.helpers';
import { createPlaceSchema, updatePlaceSchema } from '../modules/places/places.validation';

const validRow = {
  name: 'Khangchendzonga National Park',
  city: 'Gangtok',
  state: 'Sikkim',
  category: 'park',
  latitude: 27.7,
  longitude: 88.15,
};

describe('sanitizeImageMetadata', () => {
  it('keeps verbatim values and drops blank entries', () => {
    const cleaned = sanitizeImageMetadata({
      image_page_url: 'https://commons.wikimedia.org/wiki/File:K',
      image_source: '  Wikimedia Commons  ',
      image_author: '',
      image_license: null,
    });
    expect(cleaned).toEqual({
      image_page_url: 'https://commons.wikimedia.org/wiki/File:K',
      image_source: '  Wikimedia Commons  ',
    });
  });

  it('returns undefined when every value is blank', () => {
    expect(
      sanitizeImageMetadata({ image_page_url: ' ', image_source: null, image_author: '', image_license: undefined }),
    ).toBeUndefined();
    expect(sanitizeImageMetadata(undefined)).toBeUndefined();
    expect(sanitizeImageMetadata(null)).toBeUndefined();
  });
});

describe('places validation schemas (canonical fields)', () => {
  it('createPlaceSchema parses canonicalName, district and imageMetadata', () => {
    const parsed = createPlaceSchema.parse({
      name: 'Taj Mahal',
      description: 'Marble mausoleum in Agra.',
      canonicalName: 'Taj Mahal',
      latitude: 27.1751,
      longitude: 78.0421,
      category: 'monument',
      city: 'Agra',
      district: 'Agra',
      state: 'Uttar Pradesh',
      country: 'India',
      imageMetadata: {
        image_page_url: 'https://commons.wikimedia.org/wiki/Taj',
        image_source: 'Wikimedia Commons',
        image_author: 'John Doe',
        image_license: 'CC BY-SA 4.0',
      },
    });
    expect(parsed.district).toBe('Agra');
    expect(parsed.canonicalName).toBe('Taj Mahal');
    expect(parsed.imageMetadata?.image_author).toBe('John Doe');
  });

  it('createPlaceSchema rejects overlong canonicalName and imageMetadata values', () => {
    expect(() =>
      createPlaceSchema.parse({
        name: 'X',
        description: 'desc',
        latitude: 1,
        longitude: 1,
        category: 'other',
        canonicalName: 'x'.repeat(201),
      }),
    ).toThrow();

    expect(() =>
      createPlaceSchema.parse({
        name: 'X',
        description: 'desc',
        latitude: 1,
        longitude: 1,
        category: 'other',
        imageMetadata: { image_license: 'x'.repeat(501) },
      }),
    ).toThrow();
  });

  it('updatePlaceSchema accepts clearing canonicalName (explicit null)', () => {
    const parsed = updatePlaceSchema.parse({ canonicalName: null, district: 'Agra' });
    expect(parsed.canonicalName).toBeNull();
    expect(parsed.district).toBe('Agra');
  });
});

describe('placesBulkService.bulkImport (canonical field mapping)', () => {
  beforeEach(() => {
    h.findMany.mockReset().mockResolvedValue([]);
    h.findUnique.mockReset().mockResolvedValue(null);
    h.create.mockReset().mockResolvedValue({ id: 'created-place-id' });
    h.update.mockReset().mockResolvedValue({ id: 'updated-place-id' });
    h.transaction.mockReset().mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops));
  });

  it('writes canonicalName, district and sanitized imageMetadata on create', async () => {
    const res = await placesBulkService.bulkImport([
      {
        ...validRow,
        canonicalName: 'Khangchendzonga National Park',
        district: 'Mangan',
        imageMetadata: {
          image_page_url: 'https://commons.wikimedia.org/wiki/File:K',
          image_source: 'Wikimedia Commons',
          image_author: 'A. Photographer',
          image_license: 'CC BY 4.0',
        },
      },
    ]);
    expect(res.created).toBe(1);
    expect(res.errors).toBe(0);
    const [data] = h.create.mock.calls[0];
    expect(data.data.district).toBe('Mangan');
    expect(data.data.canonicalName).toBe('Khangchendzonga National Park');
    expect(data.data.imageMetadata).toEqual({
      image_page_url: 'https://commons.wikimedia.org/wiki/File:K',
      image_source: 'Wikimedia Commons',
      image_author: 'A. Photographer',
      image_license: 'CC BY 4.0',
    });
  });

  it('writes undefined imageMetadata and null canonicalName when absent', async () => {
    await placesBulkService.bulkImport([{ ...validRow }]);
    const [data] = h.create.mock.calls[0];
    expect(data.data.canonicalName).toBeNull();
    expect(data.data.imageMetadata).toBeUndefined();
    expect(data.data.district).toBe('');
  });

  it('strips blank imageMetadata entries before persisting', async () => {
    await placesBulkService.bulkImport([
      { ...validRow, imageMetadata: { image_page_url: '', image_source: '   ', image_author: 'OK' } },
    ]);
    const [data] = h.create.mock.calls[0];
    expect(data.data.imageMetadata).toEqual({ image_author: 'OK' });
  });

  it('updates canonical fields on duplicate overwrite', async () => {
    h.findMany.mockResolvedValue([
      { id: 'existing-1', name: 'Khangchendzonga National Park', city: 'Gangtok', state: 'Sikkim', slug: 'khangchen', latitude: 27.7, longitude: 88.15 },
    ]);
    const res = await placesBulkService.bulkImport(
      [
        {
          ...validRow,
          canonicalName: 'Official Name',
          district: 'Mangan',
          imageMetadata: { image_source: 'Wiki' },
        },
      ],
      { overwrite: true },
    );
    expect(res.skipped).toBe(1);
    expect(res.errors).toBe(0);
    const [args] = h.update.mock.calls[0];
    expect(args.where.id).toBe('existing-1');
    expect(args.data.district).toBe('Mangan');
    expect(args.data.canonicalName).toBe('Official Name');
    expect(args.data.imageMetadata).toEqual({ image_source: 'Wiki' });
  });
});