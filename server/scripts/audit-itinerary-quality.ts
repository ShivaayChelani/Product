/**
 * PRODUCTION ITINERARY QUALITY AUDIT runner (read-only w.r.t. product code).
 * Generates real itineraries via tripsService.aiGenerate, saves full JSON
 * artifacts under reports/audit/, and prints compact per-scenario analyses.
 *
 * Usage:
 *   npx ts-node scripts/audit-itinerary-quality.ts run [scenario...]
 *   npx ts-node scripts/audit-itinerary-quality.ts cleanup
 */
import fs from 'fs';
import path from 'path';
import { prisma } from '../src/config/database';
import { tripsService } from '../src/modules/trips/trips.service';
import { haversineDistance } from '../src/shared/utils/geo';

const OUT_DIR = path.resolve('reports/audit');

const CAR_SPEED_KMH = 35;
const TRANSPORT_COST_PER_KM = 8;

interface DayAnalysis {
  dayNumber: number;
  stopCount: number;
  firstStart: string | null;
  lastEnd: string | null;
  totalVisitMinutes: number;
  totalKm: number;
  segments: number;
  maxSegmentKm: number;
  maxTravelMinutes: number;
  detourIndex: number | null;
  overlaps: string[];
  closedByStart: boolean;
}

interface TripAnalysis {
  scenario: string;
  durationMs: number;
  note: string | null;
  warnings: string[];
  engineEstimatedBudget: number;
  recomputedEntryFeesX1: number;
  recomputedEntryFeesX2: number;
  recomputedTransportCost: number;
  totalKm: number;
  stops: number;
  days: DayAnalysis[];
  stopNames: Record<number, string[]>;
}

function toMinutes(hhmm?: string | null): number | null {
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(':').map((x) => parseInt(x, 10));
  return h * 60 + m;
}

function km(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  return haversineDistance(a.latitude, a.longitude, b.latitude, b.longitude) / 1000;
}

function analyzeTrip(scenario: string, durationMs: number, trip: any, warnings: string[]): TripAnalysis {
  const days = [...(trip.tripDays || [])].sort((a: any, b: any) => a.dayNumber - b.dayNumber);
  const dayAnalyses: DayAnalysis[] = [];
  let totalEntryFees = 0;
  let totalKm = 0;
  let stopsCount = 0;
  const stopNames: Record<number, string[]> = {};

  for (const day of days) {
    const stops = [...(day.stops || [])].sort((a: any, b: any) => a.order - b.order);
    stopNames[day.dayNumber] = stops.map((s: any) => s.place?.name || s.notes || s.placeId);
    stopsCount += stops.length;

    let visitTotal = 0;
    let prevEnd: number | null = null;
    const overlaps: string[] = [];
    const segKms: number[] = [];

    for (let i = 0; i < stops.length; i++) {
      const s = stops[i];
      const start = toMinutes(s.startTime);
      const end = toMinutes(s.endTime);
      if (start != null && end != null) {
        visitTotal += Math.max(0, end - start);
        if (prevEnd != null && start < prevEnd) {
          overlaps.push(`${s.place?.name || s.id} starts ${s.startTime} before previous end`);
        }
        prevEnd = end;
      }
      if (s.entryFee && s.entryFee > 0) totalEntryFees += s.entryFee;
      if (i > 0 && s.distanceFromPrev) {
        segKms.push(Number(s.distanceFromPrev));
        totalKm += Number(s.distanceFromPrev);
      }
    }

    // Detour index via nearest-neighbor baseline: direct span / sum of segments.
    let detourIndex: number | null = null;
    if (segKms.length >= 2) {
      const coords = stops.map((s: any) => s.place).filter((p: any) => p?.latitude != null);
      if (coords.length >= 3) {
        let chain = 0;
        for (let i = 1; i < coords.length; i++) chain += km(coords[i - 1], coords[i]);
        const direct = km(coords[0], coords[coords.length - 1]);
        if (direct > 0.5) detourIndex = Math.round((chain / direct) * 100) / 100;
      }
    }

    const times = stops.map((s: any) => toMinutes(s.startTime)).filter((x): x is number => x != null);
    const ends = stops.map((s: any) => toMinutes(s.endTime)).filter((x): x is number => x != null);
    dayAnalyses.push({
      dayNumber: day.dayNumber,
      stopCount: stops.length,
      firstStart: times.length ? `${String(Math.floor(Math.min(...times) / 60)).padStart(2, '0')}:${String(Math.min(...times) % 60).padStart(2, '0')}` : null,
      lastEnd: ends.length ? `${String(Math.floor(Math.max(...ends) / 60)).padStart(2, '0')}:${String(Math.max(...ends) % 60).padStart(2, '0')}` : null,
      totalVisitMinutes: visitTotal,
      totalKm: Math.round(segKms.reduce((a, b) => a + b, 0) * 10) / 10,
      segments: segKms.length,
      maxSegmentKm: segKms.length ? Math.round(Math.max(...segKms) * 10) / 10 : 0,
      maxTravelMinutes: segKms.length ? Math.max(...segKms.map((d) => Math.max(5, Math.round((d / CAR_SPEED_KMH) * 60)))) : 0,
      detourIndex,
      overlaps,
      closedByStart: false,
    });
  }

  return {
    scenario,
    durationMs,
    note: trip.note ?? null,
    warnings: warnings || [],
    engineEstimatedBudget: trip.estimatedBudget ?? 0,
    recomputedEntryFeesX1: totalEntryFees,
    recomputedEntryFeesX2: totalEntryFees * 2,
    recomputedTransportCost: Math.round(totalKm * TRANSPORT_COST_PER_KM),
    totalKm: Math.round(totalKm * 10) / 10,
    stops: stopsCount,
    days: dayAnalyses,
    stopNames,
  };
}

async function ensureAuditUser(): Promise<{ id: string; email: string }> {
  const email = 'itinerary-audit@palsafar.test';
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  return prisma.user.create({
    data: {
      email,
      password: 'audit-only-no-login',
      name: 'Itinerary Audit',
      emailVerified: true,
    },
  });
}

type ScenarioDef = {
  name: string;
  input: Parameters<typeof tripsService.aiGenerate>[1];
};

function baseInput(overrides: Partial<Parameters<typeof tripsService.aiGenerate>[1]> = {}) {
  return {
    destination: 'Jabalpur',
    days: 2,
    pace: 'BALANCED' as const,
    travelers: 'COUPLE',
    budget: 'CUSTOM' as const,
    customBudgetAmount: 5000,
    interests: ['nature', 'history'],
    avoid: [],
    manualPlaceIds: [],
    transportation: ['CAR'],
    ...overrides,
  };
}

async function runScenario(
  user: { id: string },
  def: ScenarioDef,
): Promise<{ analysis: TripAnalysis; raw: unknown }> {
  clearPlannerCacheSafe();
  const t0 = Date.now();
  const result = await tripsService.aiGenerate(user.id, JSON.parse(JSON.stringify(def.input)));
  const durationMs = Date.now() - t0;
  const trip = (result as any).trip;
  const warnings = (result as any).warnings || [];
  const analysis = analyzeTrip(def.name, durationMs, trip, warnings);

  const raw = {
    scenario: def.name,
    input: def.input,
    generatedAt: new Date().toISOString(),
    generationMs: durationMs,
    tripId: trip.id,
    estimatedBudget: trip.estimatedBudget,
    days: (trip.tripDays || []).map((d: any) => ({
      dayNumber: d.dayNumber,
      theme: d.theme,
      stops: [...(d.stops || [])]
        .sort((a: any, b: any) => a.order - b.order)
        .map((s: any) => ({
          order: s.order,
          place: s.place?.name,
          placeId: s.placeId,
          category: s.place?.category,
          city: s.place?.city,
          lat: s.place?.latitude,
          lng: s.place?.longitude,
          startTime: s.startTime,
          endTime: s.endTime,
          timeSlot: s.timeSlot,
          durationMinutes: s.duration,
          entryFee: s.entryFee,
          distanceFromPrevKm: s.distanceFromPrev,
          reason: s.reason,
          isPinned: s.isPinned,
        })),
    })),
    analysis,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, `${def.name}.json`), JSON.stringify(raw, null, 2));
  console.log(`\n=== ${def.name} (${durationMs} ms) ===`);
  console.log(`note: ${analysis.note}`);
  console.log(`stops=${analysis.stops} budget(engine)=${analysis.engineEstimatedBudget} entryFees(x1)=${analysis.recomputedEntryFeesX1} x2=${analysis.recomputedEntryFeesX2} transport=${analysis.recomputedTransportCost} km=${analysis.totalKm}`);
  for (const d of analysis.days) {
    console.log(`  D${d.dayNumber}: ${d.stopCount} stops ${d.firstStart}->${d.lastEnd} visit=${d.totalVisitMinutes}m route=${d.totalKm}km maxSeg=${d.maxSegmentKm}km(${d.maxTravelMinutes}m) detourIdx=${d.detourIndex ?? '-'}${d.overlaps.length ? ` OVERLAPS=${JSON.stringify(d.overlaps)}` : ''}`);
    console.log(`    ${analysis.stopNames[d.dayNumber].join(' -> ')}`);
  }
  if (warnings.length) console.log(`warnings: ${JSON.stringify(warnings)}`);
  return { analysis, raw };
}

// The planner cache is in-process; reset between scenarios for clean timing.
import { clearPlannerCache } from '../src/modules/trips/plannerCache';
function clearPlannerCacheSafe() {
  try { clearPlannerCache(); } catch { /* noop */ }
}

async function main() {
  const mode = process.argv[2] || 'run';
  const only = process.argv.slice(3);

  if (mode === 'cleanup') {
    const user = await prisma.user.findUnique({ where: { email: 'itinerary-audit@palsafar.test' } });
    if (!user) { console.log('no audit user'); return; }
    const trips = await prisma.tripPlan.findMany({ where: { userId: user.id }, select: { id: true } });
    for (const t of trips) {
      await prisma.aiGenerationLog.deleteMany({ where: { tripPlanId: t.id } }).catch(() => undefined);
      await prisma.tripPlan.delete({ where: { id: t.id } }).catch((e) => console.log(`trip ${t.id}: ${e.message}`));
    }
    await prisma.user.delete({ where: { id: user.id } });
    console.log(`cleanup done — removed ${trips.length} trips + audit user`);
    return;
  }

  const user = await ensureAuditUser();
  console.log(`audit user: ${user.id}`);

  // ---- Base generation scenarios ----
  const scenarios: ScenarioDef[] = [
    { name: 'T1-jabalpur-2d-moderate', input: baseInput() },
    { name: 'T2-jabalpur-3d-relaxed', input: baseInput({ days: 3, pace: 'RELAXED', customBudgetAmount: 7500, interests: ['nature', 'food'] }) },
    { name: 'T3-jabalpur-2d-lowbudget', input: baseInput({ pace: 'BALANCED', customBudgetAmount: 2000, interests: ['history', 'local culture'] }) },
  ];

  // ---- NL modification scenarios (each needs its own fresh base trip) ----
  async function modificationScenario(name: string, prompt: string, overrides = {}) {
    const base = await runScenario(user, { name: `${name}-base`, input: baseInput(overrides) });
    const tripId = (base.raw as any).tripId;
    return runScenario(user, {
      name,
      input: { ...baseInput(overrides), tripId, prompt },
    });
  }

  const wanted = only.length ? only : null;
  async function maybe(name: string, fn: () => Promise<unknown>) {
    if (!wanted || wanted.some((w) => name === w || name.startsWith(w))) {
      await fn();
    }
  }

  const results: Record<string, unknown> = {};

  if (!wanted || wanted.some((w) => ['T1', 'T2', 'T3'].includes(w))) {
    for (const s of scenarios) {
      if (wanted && !wanted.includes(s.name.split('-')[0])) continue;
      results[s.name] = (await runScenario(user, s)).raw;
    }
  }

  await maybe('T4-day2-less-busy', async () => { results.T4 = (await modificationScenario('T4-day2-less-busy', 'Make Day 2 less busy.')).raw; });
  await maybe('T5-start-after-10am', async () => { results.T5 = (await modificationScenario('T5-start-after-10am', 'Start after 10 AM.')).raw; });
  await maybe('T6-make-cheaper', async () => { results.T6 = (await modificationScenario('T6-make-cheaper', 'Make this trip cheaper.')).raw; });
  await maybe('T7-add-more-nature', async () => {
    // Base deliberately WITHOUT nature so the prompt must introduce it.
    results.T7 = (await modificationScenario('T7-add-more-nature', 'Add more nature.', { interests: ['history'] })).raw;
  });
  await maybe('T8-remove-bhedaghat', async () => { results.T8 = (await modificationScenario('T8-remove-bhedaghat', 'Remove Bhedaghat.')).raw; });

  // ---- Regeneration variation study (Test 17) ----
  await maybe('R-regeneration', async () => {
    const runs: Array<Record<string, unknown>> = [];
    for (let seed = 0; seed <= 3; seed++) {
      const r = await runScenario(user, {
        name: `R-seed-${seed}`,
        input: seed === 0 ? baseInput() : { ...baseInput(), refresh: true, variationSeed: seed },
      });
      runs.push({ seed, names: (r.raw as any).days.map((d: any) => d.stops.map((s: any) => s.place)), analysis: r.analysis });
    }
    fs.writeFileSync(path.join(OUT_DIR, 'R-regeneration.json'), JSON.stringify(runs, null, 2));
    const setOf = (r: any) => JSON.stringify((r.names as number[][]).flat());
    console.log('\n=== R-regeneration summary ===');
    console.log(`seed0==seed1: ${setOf(runs[0]) === setOf(runs[1])}`);
    console.log(`seed1==seed2: ${setOf(runs[1]) === setOf(runs[2])}`);
    console.log(`seed2==seed3: ${setOf(runs[2]) === setOf(runs[3])}`);
  });

  // ---- Cache behavior (Test 18) ----
  await maybe('P-cache', async () => {
    const cold = await runScenario(user, { name: 'P-cache-cold', input: baseInput({ destination: 'Jabalpur' , interests: ['nature'] }) });
    const warm = await tripsService.aiGenerate(user.id, baseInput({ destination: 'Jabalpur', interests: ['nature'] }));
    console.log('\n=== P-cache summary ===');
    console.log(`cold generation ms: ${(cold.analysis as TripAnalysis).durationMs}`);
    console.log('warm (same input, no refresh): returned from cache:', !!warm);
  });

  console.log('\nAll requested scenarios complete. Artifacts in server/reports/audit/');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

