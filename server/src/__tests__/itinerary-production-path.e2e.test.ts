/**
 * End-to-end tests for the PRODUCTION generation function:
 * generateItineraryPlan (used by tripsService.aiGenerate).
 *
 * The suite self-seeds a compact Jabalpur fixture (Bhedaghat marble-rocks
 * cluster, city-side Madan Mahal Fort and Payali Island) into the test DB,
 * so it runs against any empty schema without depending on production data.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '../config/database';
import { generateItineraryPlan } from '../modules/trips/itineraryEngine';
import { clearPlannerCache } from '../modules/trips/plannerCache';

interface SeedPlace {
  key: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
  rating: number;
  editorialPriority: number;
  durationMinutes: number;
}

/**
 * Mirrors the real geography used by the cluster unit tests:
 * Bhedaghat / Dhuandhar / Chausath Yogini are the marble-rocks cluster;
 * Madan Mahal sits ~15 km toward central Jabalpur; Payali is ~25 km out.
 */
const SEED_PLACES: SeedPlace[] = [
  { key: 'bhedaghat', name: 'Bhedaghat', category: 'viewpoint', lat: 23.1254, lng: 79.8012, rating: 4.8, editorialPriority: 5, durationMinutes: 45 },
  { key: 'chausath', name: 'Chausath Yogini Mandir', category: 'temple', lat: 23.1298, lng: 79.7955, rating: 4.7, editorialPriority: 5, durationMinutes: 60 },
  { key: 'dhuandhar', name: 'Dhuandhar Falls', category: 'waterfall', lat: 23.125, lng: 79.8134, rating: 4.6, editorialPriority: 5, durationMinutes: 90 },
  { key: 'balancing', name: 'Balancing Rock', category: 'viewpoint', lat: 23.118, lng: 79.808, rating: 4.0, editorialPriority: 3, durationMinutes: 45 },
  { key: 'marble', name: 'Marble Rocks Ghat', category: 'nature', lat: 23.132, lng: 79.8, rating: 3.3, editorialPriority: 3, durationMinutes: 75 },
  { key: 'madan', name: 'Madan Mahal Fort', category: 'fort', lat: 23.178, lng: 79.945, rating: 4.7, editorialPriority: 5, durationMinutes: 120 },
  { key: 'rani', name: 'Rani Durgavati Museum', category: 'museum', lat: 23.185, lng: 79.955, rating: 4.0, editorialPriority: 3, durationMinutes: 60 },
  { key: 'payali', name: 'Payali Island', category: 'nature', lat: 22.98, lng: 80.05, rating: 4.6, editorialPriority: 5, durationMinutes: 90 },
];

const IDS: Record<string, string> = {};

async function seedJabalpurFixture(): Promise<void> {
  // Keep the fixture deterministic across repeated local runs.
  await prisma.place.deleteMany({ where: { slug: { startsWith: 'itinerary-e2e-' } } });

  const runKey = `itinerary-e2e-${Date.now()}`;
  await prisma.place.createMany({
    data: SEED_PLACES.map((p) => ({
      name: p.name,
      slug: `${runKey}-${p.key}`,
      description: `E2E itinerary fixture: ${p.name}`,
      category: p.category,
      tags: [],
      latitude: p.lat,
      longitude: p.lng,
      city: 'Jabalpur',
      state: 'Madhya Pradesh',
      rating: p.rating,
      editorialPriority: p.editorialPriority,
      estimatedDurationMinutes: p.durationMinutes,
      status: 'APPROVED',
    })),
  });

  const seeded = await prisma.place.findMany({
    where: { slug: { startsWith: runKey } },
    select: { slug: true, id: true },
  });
  for (const row of seeded) {
    IDS[row.slug.replace(`${runKey}-`, '')] = row.id;
  }
}

function parseHHMM(s: string | null | undefined): number | null {
  if (!s) return null;
  const [h, m] = String(s).split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function assertNoTimeOverlaps(
  stops: Array<{ dayNumber: number; order: number; name: string; startTime: string; endTime: string }>,
) {
  const byDay = new Map<number, typeof stops>();
  for (const s of stops) {
    if (!byDay.has(s.dayNumber)) byDay.set(s.dayNumber, []);
    byDay.get(s.dayNumber)!.push(s);
  }
  for (const [day, list] of byDay) {
    const ordered = [...list].sort((a, b) => a.order - b.order);
    for (let i = 1; i < ordered.length; i++) {
      const prev = ordered[i - 1];
      const cur = ordered[i];
      const pe = parseHHMM(prev.endTime);
      const cs = parseHHMM(cur.startTime);
      expect(
        pe != null && cs != null && cs >= pe,
        `Day ${day} overlap: ${prev.name} ${prev.startTime}-${prev.endTime} vs ${cur.name} ${cur.startTime}-${cur.endTime}`,
      ).toBe(true);
    }
  }
}

function sumSegmentDistances(
  stops: Array<{ dayNumber: number; order: number; distanceFromPrev: number | null }>,
): number {
  let sum = 0;
  const byDay = new Map<number, typeof stops>();
  for (const s of stops) {
    if (!byDay.has(s.dayNumber)) byDay.set(s.dayNumber, []);
    byDay.get(s.dayNumber)!.push(s);
  }
  for (const list of byDay.values()) {
    for (const s of [...list].sort((a, b) => a.order - b.order)) {
      if (s.distanceFromPrev != null) sum += s.distanceFromPrev;
    }
  }
  return Math.round(sum * 10) / 10;
}

const hasDb = !!process.env.DATABASE_URL;

describe.runIf(hasDb)('production path generateItineraryPlan (Jabalpur E2E)', () => {
  beforeAll(async () => {
    await seedJabalpurFixture();
    clearPlannerCache();
  });

  it('1-day Jabalpur: Bhedaghat lock — Madan and Payali rejected; sequential times', async () => {
    const plan = await generateItineraryPlan({
      destination: 'Jabalpur',
      days: 1,
      pace: 'QUICK',
      interests: ['heritage', 'nature', 'temples', 'waterfalls', 'adventure'],
      avoid: [],
      startDate: new Date('2026-09-15T00:00:00.000Z'),
    });

    expect(plan.stops.length).toBeGreaterThan(0);
    const ids = plan.stops.map((s) => s.placeId);
    expect(ids).not.toContain(IDS.madan);
    expect(ids).not.toContain(IDS.payali);

    // Selected outing should be Bhedaghat-area (not city-side Madan/Payali)
    const names = plan.stops.map((s) => s.name).join(' | ');
    expect(
      /bhedaghat|dhuandhar|chausath|marble/i.test(names),
      `expected Bhedaghat-area stops, got: ${names}`,
    ).toBe(true);
    expect(
      plan.stops.length,
      `day 1 too thin (${plan.stops.length}): ${names}`,
    ).toBeGreaterThanOrEqual(4);

    assertNoTimeOverlaps(plan.stops);

    const chausath = plan.stops.find((s) => s.placeId === IDS.chausath);
    if (chausath) {
      // Coords are not on EngineStop — presence in Bhedaghat day is enough here;
      // coord integrity is covered by DB exact-ID scripts.
      expect(chausath.name).toMatch(/chausath/i);
    }

    const seg = sumSegmentDistances(plan.stops);
    expect(Math.abs(seg - plan.totalDistanceKm)).toBeLessThan(0.2);
  }, 60_000);

  it('relaxed 1-day Jabalpur still covers Bhedaghat — not two lonely stops', async () => {
    const plan = await generateItineraryPlan({
      destination: 'Jabalpur',
      days: 1,
      pace: 'VERY_RELAXED',
      interests: ['heritage', 'nature', 'temples', 'waterfalls', 'adventure'],
      avoid: [],
      startDate: new Date('2026-09-15T00:00:00.000Z'),
    });

    const names = plan.stops.map((s) => s.name).join(' | ');
    expect(plan.stops.map((s) => s.placeId)).not.toContain(IDS.madan);
    expect(
      plan.stops.length,
      `relaxed day 1 too thin (${plan.stops.length}): ${names}`,
    ).toBeGreaterThanOrEqual(4);
    expect(/bhedaghat|dhuandhar|chausath|marble/i.test(names)).toBe(true);
  }, 60_000);

  it('4-day Jabalpur: no duplicate place IDs; no time overlaps; dayStart propagates', async () => {
    const plan = await generateItineraryPlan({
      destination: 'Jabalpur',
      days: 4,
      pace: 'BALANCED',
      interests: ['heritage', 'nature', 'temples', 'waterfalls', 'adventure'],
      avoid: [],
      startDate: new Date('2026-09-15T00:00:00.000Z'),
    });

    const ids = plan.stops.map((s) => s.placeId);
    expect(new Set(ids).size).toBe(ids.length);

    assertNoTimeOverlaps(plan.stops);

    // Intra-day jumps must not casually exceed ~25 km (NEW_EXCURSION territory)
    const longJumps: string[] = [];
    for (const s of plan.stops) {
      if (s.distanceFromPrev != null && s.distanceFromPrev > 25) {
        longJumps.push(`D${s.dayNumber} ${s.name} ${s.distanceFromPrev.toFixed(1)}km`);
      }
    }
    expect(longJumps, `unexpected long intra-day jumps: ${longJumps.join('; ')}`).toEqual([]);

    // Bhedaghat should not be thinly sprinkled across many days without reason —
    // soft check: at most 2 days contain Bhedaghat-core names for a 4-day trip
    // (strict region-coverage is a follow-up; this catches angular round-robin splits).
    const bhedDays = new Set<number>();
    for (const s of plan.stops) {
      if (/bhedaghat|dhuandhar|chausath yogini|marble rocks/i.test(s.name)) {
        bhedDays.add(s.dayNumber);
      }
    }
    expect(
      bhedDays.size,
      `Bhedaghat attractions spread across days ${[...bhedDays].join(',')}`,
    ).toBeLessThanOrEqual(2);
  }, 90_000);
});
