/**
 * Treasure Hunt — District-Aware City Resolution Unit Tests
 *
 * Verifies that GPS coordinates resolve to a candidate set
 * (settlement + district + state) and that:
 *  - the DISTRICT candidate is authoritative (every store hunt is district-grain):
 *    a settlement name that collides with a different district's hunt
 *    (Patan / Una) must NOT hijack resolution,
 *  - the settlement falls back only when the district has no hunt (or is null),
 *  - a mismatched candidate set returns NO hunt (never a guess),
 *  - getCurrentCityHunt() and verifyHuntCity() consume the SAME
 *    resolveCurrentHuntFromLocation() result,
 *  - same-name cities across states never cross-select,
 *  - the client cannot force a city / state / huntId — candidates come only
 *    from the geocoder,
 *  - ordering is deterministic.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config/database', () => ({
  prisma: {
    treasureHunt: { findMany: vi.fn() },
  },
}));

vi.mock('../../src/shared/utils/reverseGeocode', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../src/shared/utils/reverseGeocode')>();
  return {
    ...orig,
    reverseGeocodeCandidates: vi.fn(),
  };
});

import { prisma } from '../../src/config/database';
import { reverseGeocodeCandidates } from '../../src/shared/utils/reverseGeocode';
import { riddlesService } from '../../src/modules/riddles/riddles.service';
import { resolveCurrentHuntFromLocation } from '../../src/modules/riddles/huntCityResolution';
import { locationQuerySchema } from '../../src/modules/riddles/riddles.validation';
import { ApiError } from '../../src/shared/utils/ApiError';

const P = prisma as unknown as Record<string, any>;

type HuntShape = {
  id: string;
  city: string;
  title: string;
  description: string | null;
  rewardCoins: number;
  status: string;
  state?: string | null;
  _count: { riddles: number };
};

function hunt(
  city: string,
  activeRiddles = 4,
  id = `hunt-${city.toLowerCase()}`,
  extra: { state?: string | null } = {},
): HuntShape {
  return {
    id,
    city,
    title: `${city} Treasure Hunt`,
    description: null,
    rewardCoins: 20,
    status: 'ACTIVE',
    state: extra.state,
    _count: { riddles: activeRiddles },
  };
}

const PANAGAR_CANDIDATES = { settlement: 'Panagar', district: 'Jabalpur', state: 'Madhya Pradesh' };
const BHEDAGHAT_CANDIDATES = { settlement: 'Bhedaghat', district: 'Jabalpur', state: 'Madhya Pradesh' };
const PATAN_CANDIDATES = { settlement: 'Patan', district: 'Jabalpur', state: 'Madhya Pradesh' };

const JABALPUR_HUNT = hunt('Jabalpur', 4, 'jbp');
const PATAN_GJ_HUNT = hunt('Patan', 4, 'patan-gujarat');
const UNA_HP_HUNT = hunt('Una', 5, 'una-hp');
const GIR_SOMNATH_HUNT = hunt('Gir Somnath', 4, 'gs');
const SAS_NAGAR_HUNT = hunt('Sahibzada Ajit Singh Nagar Sas Nagar', 5, 'mohali-hunt');
const BALODA_HUNT = hunt('Balodabazar Bhatapara', 4, 'baloda-hunt');
const BILASPUR_HP = hunt('Bilaspur', 5, 'bilaspur-hp', { state: 'Himachal Pradesh' });
const BILASPUR_CG = hunt('Bilaspur', 5, 'bilaspur-cg', { state: 'Chhattisgarh' });

/** Simulates the stored hunt table (authoritative ACTIVE hunts). */
function installHuntTable(rows: HuntShape[]) {
  (P.treasureHunt.findMany as any).mockImplementation(async () => rows);
}

async function expectParity(lat: number, lng: number) {
  const listed = await riddlesService.getCurrentCityHunt(lat, lng);
  const resolved = await resolveCurrentHuntFromLocation(lat, lng);
  expect(resolved).not.toBeNull();
  expect(listed.city).toBe(resolved!.displayCity);
  expect(listed.hunt?.id ?? null).toBe(resolved!.hunt?.id ?? null);

  if (listed.hunt) {
    await expect(riddlesService.verifyHuntCity(listed.hunt, lat, lng)).resolves.toBe(listed.city);
  }
  return { listed, resolved };
}

describe('getCurrentCityHunt — settlement/district candidate resolution', () => {
  beforeEach(() => {
    P.treasureHunt.findMany.mockReset();
    (reverseGeocodeCandidates as any).mockReset();
  });

  it('1. Panagar → Jabalpur hunt (district fallback)', async () => {
    (reverseGeocodeCandidates as any).mockResolvedValue(PANAGAR_CANDIDATES);
    installHuntTable([JABALPUR_HUNT]);

    const res = await riddlesService.getCurrentCityHunt(23.28, 79.99);

    expect(res.hunt).not.toBeNull();
    expect(res.hunt!.city).toBe('Jabalpur');
    expect(res.hunt!.id).toBe('jbp');
  });

  it('2. Exact Jabalpur → Jabalpur hunt', async () => {
    (reverseGeocodeCandidates as any).mockResolvedValue({
      settlement: 'Jabalpur',
      district: 'Jabalpur',
      state: 'Madhya Pradesh',
    });
    installHuntTable([JABALPUR_HUNT]);

    const res = await riddlesService.getCurrentCityHunt(23.18, 79.98);

    expect(res.hunt!.city).toBe('Jabalpur');
  });

  it('3. Settlement whose key equals the district (Indore) resolves to the single hunt', async () => {
    const candidates = { settlement: 'Indore', district: 'Indore', state: 'Madhya Pradesh' };
    (reverseGeocodeCandidates as any).mockResolvedValue(candidates);
    installHuntTable([hunt('Indore', 3, 'ind')]);

    const res = await riddlesService.getCurrentCityHunt(22.72, 75.85);

    expect(res.hunt!.id).toBe('ind');
    expect(res.hunt!.city).toBe('Indore');
    expect(P.treasureHunt.findMany).toHaveBeenCalledTimes(1);
  });

  it('4. DISTRICT is tried first (Panagar → Jabalpur district hunt, settlement is fallback)', async () => {
    (reverseGeocodeCandidates as any).mockResolvedValue(PANAGAR_CANDIDATES);
    installHuntTable([JABALPUR_HUNT, hunt('Panagar', 4, 'pan')]);

    const res = await riddlesService.getCurrentCityHunt(23.28, 79.99);

    expect(res.hunt!.city).toBe('Jabalpur');
    expect(res.hunt!.id).toBe('jbp');
  });

  it('4b. settlement fallback only when the district has no hunt (settlement has its own hunt)', async () => {
    (reverseGeocodeCandidates as any).mockResolvedValue(PANAGAR_CANDIDATES);
    installHuntTable([hunt('Panagar', 4, 'pan')]);

    const res = await riddlesService.getCurrentCityHunt(23.28, 79.99);

    expect(res.hunt!.city).toBe('Panagar');
    expect(res.hunt!.id).toBe('pan');
  });

  it('5. Neither settlement nor district has a hunt → no hunt', async () => {
    (reverseGeocodeCandidates as any).mockResolvedValue({
      settlement: 'Somewhere',
      district: 'Elsewhere',
      state: null,
    });
    installHuntTable([]);

    const res = await riddlesService.getCurrentCityHunt(30, 60);

    expect(res.hunt).toBeNull();
    expect(res.city).toBe('Somewhere');
  });

  it('6. Bhedaghat → Jabalpur hunt (district fallback)', async () => {
    (reverseGeocodeCandidates as any).mockResolvedValue(BHEDAGHAT_CANDIDATES);
    installHuntTable([JABALPUR_HUNT]);

    const res = await riddlesService.getCurrentCityHunt(23.12, 79.8);

    expect(res.hunt).not.toBeNull();
    expect(res.hunt!.city).toBe('Jabalpur');
  });

  it('7. Patan → Jabalpur hunt (district fallback, district wins)', async () => {
    (reverseGeocodeCandidates as any).mockResolvedValue(PATAN_CANDIDATES);
    installHuntTable([JABALPUR_HUNT]);

    const res = await riddlesService.getCurrentCityHunt(23.4, 79.9);

    expect(res.hunt).not.toBeNull();
    expect(res.hunt!.city).toBe('Jabalpur');
  });

  it('7b. COLLISION: Patan village (settlement) in Jabalpur district MUST NOT resolve to the Patan (Gujarat) hunt even when it exists in store', async () => {
    (reverseGeocodeCandidates as any).mockResolvedValue(PATAN_CANDIDATES);
    installHuntTable([PATAN_GJ_HUNT, JABALPUR_HUNT]);

    const res = await riddlesService.getCurrentCityHunt(23.4, 79.9);

    expect(res.hunt).not.toBeNull();
    expect(res.hunt!.city).toBe('Jabalpur');
    expect(res.hunt!.id).toBe('jbp');
  });

  it('7c. COLLISION: Una (Gir Somnath, Gujarat) MUST NOT resolve to the Una (Himachal Pradesh) hunt', async () => {
    (reverseGeocodeCandidates as any).mockResolvedValue({
      settlement: 'Una',
      district: 'Gir Somnath',
      state: 'Gujarat',
    });
    installHuntTable([UNA_HP_HUNT, GIR_SOMNATH_HUNT]);

    const res = await riddlesService.getCurrentCityHunt(20.82, 70.53);

    expect(res.hunt!.city).toBe('Gir Somnath');
    expect(res.hunt!.id).toBe('gs');
  });

  it('8. Completely unrelated city → no match (no hunt, no guessing)', async () => {
    (reverseGeocodeCandidates as any).mockResolvedValue({
      settlement: 'Mumbai',
      district: 'Mumbai City',
      state: 'Maharashtra',
    });
    installHuntTable([JABALPUR_HUNT]);

    const res = await riddlesService.getCurrentCityHunt(19.07, 72.87);

    expect(res.hunt).toBeNull();
  });

  it('hunt with zero active riddles is treated as no hunt and falls through to district', async () => {
    (reverseGeocodeCandidates as any).mockResolvedValue(PANAGAR_CANDIDATES);
    installHuntTable([hunt('Panagar', 0, 'pan'), JABALPUR_HUNT]);

    const res = await riddlesService.getCurrentCityHunt(23.28, 79.99);

    expect(res.hunt).not.toBeNull();
    expect(res.hunt!.city).toBe('Jabalpur');
  });

  it('fail-closed: candidate null → CITY_RESOLUTION_FAILED', async () => {
    (reverseGeocodeCandidates as any).mockResolvedValue(null);
    installHuntTable([JABALPUR_HUNT]);

    await expect(riddlesService.getCurrentCityHunt(23.28, 79.99)).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('verified aliases — Mohali / Baloda Bazar', () => {
  beforeEach(() => {
    P.treasureHunt.findMany.mockReset();
    (reverseGeocodeCandidates as any).mockReset();
  });

  it('4. Mohali OSM district Sahibzada Ajit Singh Nagar → stored SAS Nagar hunt', async () => {
    (reverseGeocodeCandidates as any).mockResolvedValue({
      settlement: 'Mohali',
      district: 'Sahibzada Ajit Singh Nagar',
      state: 'Punjab',
    });
    installHuntTable([SAS_NAGAR_HUNT]);

    const res = await riddlesService.getCurrentCityHunt(30.7, 76.72);
    expect(res.hunt!.id).toBe('mohali-hunt');
    expect(res.hunt!.city).toBe('Sahibzada Ajit Singh Nagar Sas Nagar');
  });

  it('Mohali settlement-only still maps via the curated Mohali alias', async () => {
    (reverseGeocodeCandidates as any).mockResolvedValue({
      settlement: 'Mohali',
      district: null,
      state: 'Punjab',
    });
    installHuntTable([SAS_NAGAR_HUNT]);

    const res = await riddlesService.getCurrentCityHunt(30.7, 76.72);
    expect(res.hunt!.id).toBe('mohali-hunt');
  });

  it('5. Baloda Bazar OSM spelling → stored Balodabazar Bhatapara hunt', async () => {
    (reverseGeocodeCandidates as any).mockResolvedValue({
      settlement: 'Baloda Bazar',
      district: 'Baloda Bazar',
      state: 'Chhattisgarh',
    });
    installHuntTable([BALODA_HUNT]);

    const res = await riddlesService.getCurrentCityHunt(21.66, 82.16);
    expect(res.hunt!.id).toBe('baloda-hunt');
    expect(res.hunt!.city).toBe('Balodabazar Bhatapara');
  });

  it('Balodabazar (no space) OSM spelling → same stored hunt', async () => {
    (reverseGeocodeCandidates as any).mockResolvedValue({
      settlement: 'Balodabazar',
      district: null,
      state: 'Chhattisgarh',
    });
    installHuntTable([BALODA_HUNT]);

    const res = await riddlesService.getCurrentCityHunt(21.66, 82.16);
    expect(res.hunt!.id).toBe('baloda-hunt');
  });
});

describe('Bilaspur cross-state safety', () => {
  beforeEach(() => {
    P.treasureHunt.findMany.mockReset();
    (reverseGeocodeCandidates as any).mockReset();
  });

  it('A/6. Bilaspur HP → HP hunt only', async () => {
    (reverseGeocodeCandidates as any).mockResolvedValue({
      settlement: 'Bilaspur',
      district: null,
      state: 'Himachal Pradesh',
    });
    installHuntTable([BILASPUR_HP, BILASPUR_CG]);

    const res = await riddlesService.getCurrentCityHunt(31.33, 76.76);
    expect(res.hunt!.id).toBe('bilaspur-hp');
    expect(res.hunt!.id).not.toBe('bilaspur-cg');
  });

  it('B/7. Bilaspur CG → CG hunt only', async () => {
    (reverseGeocodeCandidates as any).mockResolvedValue({
      settlement: 'Bilaspur',
      district: 'Bilaspur',
      state: 'Chhattisgarh',
    });
    installHuntTable([BILASPUR_HP, BILASPUR_CG]);

    const res = await riddlesService.getCurrentCityHunt(22.08, 82.15);
    expect(res.hunt!.id).toBe('bilaspur-cg');
    expect(res.hunt!.id).not.toBe('bilaspur-hp');
  });

  it('C. Same city name, different state → no cross-state selection', async () => {
    (reverseGeocodeCandidates as any).mockResolvedValue({
      settlement: 'Bilaspur',
      district: null,
      state: 'Himachal Pradesh',
    });
    installHuntTable([BILASPUR_HP, BILASPUR_CG]);

    const listed = await riddlesService.getCurrentCityHunt(31.33, 76.76);
    const err = await riddlesService.verifyHuntCity(BILASPUR_CG, 31.33, 76.76).catch((e: ApiError) => e);
    expect(listed.hunt!.id).toBe('bilaspur-hp');
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('TREASURE_HUNT_CITY_MISMATCH');
  });

  it('D/8. Ambiguous Bilaspur without state → fail closed (no hunt)', async () => {
    (reverseGeocodeCandidates as any).mockResolvedValue({
      settlement: 'Bilaspur',
      district: null,
      state: null,
    });
    installHuntTable([BILASPUR_HP, BILASPUR_CG]);

    const res = await riddlesService.getCurrentCityHunt(31.33, 76.76);
    expect(res.hunt).toBeNull();
    expect(res.city).toBe('Bilaspur');
  });

  it('production-shaped catalog (single HP hunt, no state column): CG GPS does not receive the HP hunt', async () => {
    (reverseGeocodeCandidates as any).mockResolvedValue({
      settlement: 'Bilaspur',
      district: 'Bilaspur',
      state: 'Chhattisgarh',
    });
    installHuntTable([hunt('Bilaspur', 5, 'bilaspur-hp')]);

    const res = await riddlesService.getCurrentCityHunt(22.08, 82.15);
    expect(res.hunt).toBeNull();
  });

  it('13. Provider state missing + ambiguous key → safe failure, not an arbitrary hunt', async () => {
    (reverseGeocodeCandidates as any).mockResolvedValue({
      settlement: 'Bilaspur',
      district: null,
      state: null,
    });
    installHuntTable([hunt('Bilaspur', 5, 'bilaspur-hp')]);

    const res = await riddlesService.getCurrentCityHunt(31.33, 76.76);
    expect(res.hunt).toBeNull();
  });
});

describe('verifyHuntCity — same candidate set as getCurrentCityHunt', () => {
  beforeEach(() => {
    P.treasureHunt.findMany.mockReset();
    (reverseGeocodeCandidates as any).mockReset();
  });

  it('9. accepts the district fallback for the same GPS coordinates (Panagar → Jabalpur hunt)', async () => {
    (reverseGeocodeCandidates as any).mockResolvedValue(PANAGAR_CANDIDATES);
    installHuntTable([JABALPUR_HUNT]);

    const current = await riddlesService.verifyHuntCity(JABALPUR_HUNT, 23.28, 79.99);
    expect(current).toBe('Panagar');
  });

  it('exact Jabalpur coords pass for the Jabalpur hunt', async () => {
    (reverseGeocodeCandidates as any).mockResolvedValue({
      settlement: 'Jabalpur',
      district: 'Jabalpur',
      state: 'Madhya Pradesh',
    });
    installHuntTable([JABALPUR_HUNT]);

    await expect(riddlesService.verifyHuntCity(JABALPUR_HUNT, 23.18, 79.98)).resolves.toBe('Jabalpur');
  });

  it('10. unrelated hunt city is rejected — client cannot force a different city', async () => {
    (reverseGeocodeCandidates as any).mockResolvedValue({
      settlement: 'Kolkata',
      district: null,
      state: 'West Bengal',
    });
    installHuntTable([JABALPUR_HUNT, hunt('Kolkata', 4, 'kol')]);

    const err = await riddlesService.verifyHuntCity(JABALPUR_HUNT, 22.57, 88.36).catch((e: ApiError) => e);
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('TREASURE_HUNT_CITY_MISMATCH');
  });

  it('rejects a foreign district candidate not covered by the hunt city', async () => {
    (reverseGeocodeCandidates as any).mockResolvedValue({
      settlement: 'Panagar',
      district: 'Katni',
      state: 'Madhya Pradesh',
    });
    installHuntTable([JABALPUR_HUNT]);

    const err = await riddlesService.verifyHuntCity(JABALPUR_HUNT, 23.28, 79.99).catch((e: ApiError) => e);
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('TREASURE_HUNT_CITY_MISMATCH');
  });

  it('fail-closed: candidate null → CITY_RESOLUTION_FAILED (gate not bypassed)', async () => {
    (reverseGeocodeCandidates as any).mockResolvedValue(null);
    installHuntTable([JABALPUR_HUNT]);

    const err = await riddlesService.verifyHuntCity(JABALPUR_HUNT, 23.28, 79.99).catch((e: ApiError) => e);
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('CITY_RESOLUTION_FAILED');
  });

  it('GATE: the colliding Patan (Gujarat) hunt is REJECTED for Patan-village-in-Jabalpur coords', async () => {
    (reverseGeocodeCandidates as any).mockResolvedValue(PATAN_CANDIDATES);
    installHuntTable([PATAN_GJ_HUNT, JABALPUR_HUNT]);

    const err = await riddlesService.verifyHuntCity(PATAN_GJ_HUNT, 23.4, 79.9).catch((e: ApiError) => e);
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('TREASURE_HUNT_CITY_MISMATCH');
  });

  it('GATE: Una (HP) hunt is REJECTED for Una/Gir Somnath (Gujarat) coords', async () => {
    (reverseGeocodeCandidates as any).mockResolvedValue({
      settlement: 'Una',
      district: 'Gir Somnath',
      state: 'Gujarat',
    });
    installHuntTable([UNA_HP_HUNT, GIR_SOMNATH_HUNT]);

    const err = await riddlesService.verifyHuntCity(UNA_HP_HUNT, 20.82, 70.53).catch((e: ApiError) => e);
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('TREASURE_HUNT_CITY_MISMATCH');
  });

  it('G. Client cannot select another city — listed hunt is the only one that verifies', async () => {
    (reverseGeocodeCandidates as any).mockResolvedValue(PANAGAR_CANDIDATES);
    installHuntTable([JABALPUR_HUNT, hunt('Kolkata', 4, 'kol')]);

    const listed = await riddlesService.getCurrentCityHunt(23.28, 79.99);
    await expect(riddlesService.verifyHuntCity(listed.hunt!, 23.28, 79.99)).resolves.toBe('Panagar');
    const err = await riddlesService.verifyHuntCity(hunt('Kolkata', 4, 'kol'), 23.28, 79.99).catch((e: ApiError) => e);
    expect(err.code).toBe('TREASURE_HUNT_CITY_MISMATCH');
  });

  it('F. Client cannot supply a huntId override — a foreign huntId is rejected at the GPS gate', async () => {
    (reverseGeocodeCandidates as any).mockResolvedValue({
      settlement: 'Bilaspur',
      district: null,
      state: 'Himachal Pradesh',
    });
    installHuntTable([BILASPUR_HP, BILASPUR_CG]);

    const err = await riddlesService.verifyHuntCity(BILASPUR_CG, 31.33, 76.76).catch((e: ApiError) => e);
    expect(err.statusCode).toBe(403);
  });
});

describe('getCurrentCityHunt ⇄ verifyHuntCity parity', () => {
  beforeEach(() => {
    P.treasureHunt.findMany.mockReset();
    (reverseGeocodeCandidates as any).mockReset();
  });

  it('11. the hunt returned for Panagar coords passes verifyHuntCity for those exact coords', async () => {
    (reverseGeocodeCandidates as any).mockResolvedValue(PANAGAR_CANDIDATES);
    installHuntTable([JABALPUR_HUNT]);

    const { listed } = await expectParity(23.28, 79.99);
    expect(listed.hunt!.city).toBe('Jabalpur');
  });

  it('H. listing and verification always agree across district, alias, and collision cases', async () => {
    const cases: Array<{ candidates: object; rows: HuntShape[]; lat: number; lng: number }> = [
      { candidates: PANAGAR_CANDIDATES, rows: [JABALPUR_HUNT], lat: 23.28, lng: 79.99 },
      { candidates: BHEDAGHAT_CANDIDATES, rows: [JABALPUR_HUNT], lat: 23.12, lng: 79.8 },
      { candidates: PATAN_CANDIDATES, rows: [PATAN_GJ_HUNT, JABALPUR_HUNT], lat: 23.4, lng: 79.9 },
      {
        candidates: { settlement: 'Una', district: 'Gir Somnath', state: 'Gujarat' },
        rows: [UNA_HP_HUNT, GIR_SOMNATH_HUNT],
        lat: 20.82,
        lng: 70.53,
      },
      {
        candidates: { settlement: 'Mohali', district: 'Sahibzada Ajit Singh Nagar', state: 'Punjab' },
        rows: [SAS_NAGAR_HUNT],
        lat: 30.7,
        lng: 76.72,
      },
      {
        candidates: { settlement: 'Baloda Bazar', district: 'Baloda Bazar', state: 'Chhattisgarh' },
        rows: [BALODA_HUNT],
        lat: 21.66,
        lng: 82.16,
      },
      {
        candidates: { settlement: 'Bilaspur', district: null, state: 'Himachal Pradesh' },
        rows: [BILASPUR_HP, BILASPUR_CG],
        lat: 31.33,
        lng: 76.76,
      },
      {
        candidates: { settlement: 'Bilaspur', district: 'Bilaspur', state: 'Chhattisgarh' },
        rows: [BILASPUR_HP, BILASPUR_CG],
        lat: 22.08,
        lng: 82.15,
      },
      {
        candidates: { settlement: 'Bilaspur', district: null, state: null },
        rows: [BILASPUR_HP, BILASPUR_CG],
        lat: 31.33,
        lng: 76.76,
      },
    ];

    for (const c of cases) {
      (reverseGeocodeCandidates as any).mockResolvedValue(c.candidates);
      installHuntTable(c.rows);
      await expectParity(c.lat, c.lng);
    }
  });
});

describe('E. Client cannot supply a state / city / huntId override', () => {
  it('location query schema keeps only lat/lng and strips city, state, huntId', () => {
    const parsed = locationQuerySchema.parse({
      lat: '31.33',
      lng: '76.76',
      city: 'Bilaspur',
      state: 'Chhattisgarh',
      huntId: 'bilaspur-cg',
    });
    expect(parsed).toEqual({ lat: '31.33', lng: '76.76' });
    expect((parsed as { city?: string }).city).toBeUndefined();
    expect((parsed as { state?: string }).state).toBeUndefined();
    expect((parsed as { huntId?: string }).huntId).toBeUndefined();
  });

  it('resolveCurrentHuntFromLocation only accepts coordinates (no client state argument)', () => {
    expect(resolveCurrentHuntFromLocation.length).toBe(2);
  });
});
