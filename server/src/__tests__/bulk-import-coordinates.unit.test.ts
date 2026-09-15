import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression tests for THE 2026 COORDINATE-IMPORT GAP.
 * Bulk CSV import previously stored any finite number as a coordinate
 * (garbage like lng=795447 or lat=95 made it into production rows). These
 * tests pin the new server-side gate and the pure validator.
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
import { validateBulkCoordinates } from '../modules/places/services/place-coordinates';

const validRow = {
  name: 'Valid Waterfall',
  city: 'Jabalpur',
  state: 'Madhya Pradesh',
  category: 'waterfall',
  latitude: 23.1254,
  longitude: 79.8134,
};

describe('validateBulkCoordinates', () => {
  it('accepts an in-range pair and preserves full precision', () => {
    const lat = 27.123456789;
    const lng = 78.987654321;
    const res = validateBulkCoordinates(lat, lng);
    expect(res).toEqual({ ok: true, latitude: lat, longitude: lng });
  });

  it('accepts numeric strings (script/CSV cells)', () => {
    const res = validateBulkCoordinates('27.1751', '78.0421');
    expect(res).toEqual({ ok: true, latitude: 27.1751, longitude: 78.0421 });
  });

  it('accepts range boundaries', () => {
    expect(validateBulkCoordinates(90, -180)).toEqual({ ok: true, latitude: 90, longitude: -180 });
    expect(validateBulkCoordinates(-90, 180)).toEqual({ ok: true, latitude: -90, longitude: 180 });
  });

  it('accepts a lone zero axis (only exact 0,0 is rejected)', () => {
    expect(validateBulkCoordinates(0, 1)).toEqual({ ok: true, latitude: 0, longitude: 1 });
  });

  it('rejects null-island 0,0', () => {
    const res = validateBulkCoordinates(0, 0);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/0,0/);
  });

  it('rejects out-of-range latitude', () => {
    expect(validateBulkCoordinates(91, 78).ok).toBe(false);
    expect(validateBulkCoordinates(-91, 78).ok).toBe(false);
    expect(validateBulkCoordinates(90.0001, 78).ok).toBe(false);
  });

  it('rejects out-of-range longitude', () => {
    expect(validateBulkCoordinates(27, 181).ok).toBe(false);
    expect(validateBulkCoordinates(27, -181).ok).toBe(false);
    expect(validateBulkCoordinates(27, -180.0001).ok).toBe(false);
  });

  it('rejects NaN and Infinity', () => {
    expect(validateBulkCoordinates(Number.NaN, 78).ok).toBe(false);
    expect(validateBulkCoordinates(27, Number.NaN).ok).toBe(false);
    expect(validateBulkCoordinates(Number.POSITIVE_INFINITY, 78).ok).toBe(false);
    expect(validateBulkCoordinates(27, Number.NEGATIVE_INFINITY).ok).toBe(false);
    expect(validateBulkCoordinates('Infinity', '78').ok).toBe(false);
  });

  it('rejects null, undefined, and empty strings', () => {
    expect(validateBulkCoordinates(null, 78).ok).toBe(false);
    expect(validateBulkCoordinates(27, undefined).ok).toBe(false);
    expect(validateBulkCoordinates('', 78).ok).toBe(false);
    expect(validateBulkCoordinates(27, '   ').ok).toBe(false);
  });

  it('rejects malformed numeric values', () => {
    expect(validateBulkCoordinates('abc', '78').ok).toBe(false);
    expect(validateBulkCoordinates('27,1751', '78.0421').ok).toBe(false);
    expect(validateBulkCoordinates({}, '78').ok).toBe(false);
    expect(validateBulkCoordinates([], '78').ok).toBe(false);
  });
});

describe('placesBulkService.bulkImport (coordinate gate)', () => {
  beforeEach(() => {
    h.findMany.mockReset().mockResolvedValue([]);
    h.findUnique.mockReset().mockResolvedValue(null);
    h.create.mockReset().mockResolvedValue({ id: 'created-place-id' });
    h.update.mockReset().mockResolvedValue({ id: 'updated-place-id' });
    h.transaction.mockReset().mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops));
  });

  it('rejects a non-array payload', async () => {
    await expect(placesBulkService.bulkImport(undefined as never)).rejects.toThrow(/array/);
    await expect(placesBulkService.bulkImport({} as never)).rejects.toThrow(/array/);
  });

  it('creates a valid single row and writes its exact coordinates', async () => {
    const res = await placesBulkService.bulkImport([{ ...validRow, latitude: 27.123456789, longitude: 78.987654321 }]);
    expect(res.created).toBe(1);
    expect(res.errors).toBe(0);
    const [args] = h.create.mock.calls[0];
    expect(args.data.latitude).toBe(27.123456789);
    expect(args.data.longitude).toBe(78.987654321);
  });

  it('rejects an out-of-range latitude row without writing', async () => {
    const res = await placesBulkService.bulkImport([{ ...validRow, latitude: 95, longitude: 78 }] as never);
    expect(res.created).toBe(0);
    expect(res.errors).toBe(1);
    expect(res.errorDetails[0].error).toMatch(/outside -90\.\.90/);
    expect(h.create).not.toHaveBeenCalled();
    expect(h.transaction).not.toHaveBeenCalled();
  });

  it('rejects rows that omit coordinates', async () => {
    const res = await placesBulkService.bulkImport([
      { name: 'No Coords', city: 'X', state: 'Y' },
    ] as never);
    expect(res.created).toBe(0);
    expect(res.errors).toBe(1);
    expect(h.create).not.toHaveBeenCalled();
  });

  it('rejects empty-string coordinates', async () => {
    const res = await placesBulkService.bulkImport([
      { ...validRow, latitude: '', longitude: '' },
    ] as never);
    expect(res.created).toBe(0);
    expect(res.errors).toBe(1);
  });

  it('rejects malformed and null-island coordinates', async () => {
    const garbageRow = await placesBulkService.bulkImport([
      { ...validRow, latitude: '79.5447', longitude: 'not-a-number' },
    ] as never);
    expect(garbageRow.created).toBe(0);
    expect(garbageRow.errors).toBe(1);

    const nullIsland = await placesBulkService.bulkImport([
      { ...validRow, latitude: 0, longitude: 0 },
    ] as never);
    expect(nullIsland.created).toBe(0);
    expect(nullIsland.errors).toBe(1);
    expect(h.create).not.toHaveBeenCalled();
  });

  it('keeps valid rows while rejecting invalid ones in a mixed batch', async () => {
    const res = await placesBulkService.bulkImport([
      validRow,
      { ...validRow, name: 'Bad One', latitude: -95, longitude: 78 },
      { ...validRow, name: 'Bad Two', latitude: 27, longitude: 200 },
    ] as never);
    expect(res.created).toBe(1);
    expect(res.errors).toBe(2);
    expect(res.errorDetails.map((e) => e.name)).toEqual(['Bad One', 'Bad Two']);
  });
});