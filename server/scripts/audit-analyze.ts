/**
 * Post-generation ANALYSIS pass for the itinerary quality audit (read-only).
 * - Validates every stop time chain across all artifacts
 * - Compares scheduled times vs REAL DB opening hours (weekday-keyed arrays)
 * - Duplicate / near-duplicate detection (name + 300m proximity)
 * - Data-quality gaps for the destination's places
 * Usage: npx ts-node scripts/audit-analyze.ts [city=Jabalpur]
 */
import fs from 'fs';
import path from 'path';
import { prisma } from '../src/config/database';
import { haversineDistance } from '../src/shared/utils/geo';

const OUT_DIR = path.resolve('reports/audit');
const city = process.argv[2] || 'Jabalpur';

interface StopRow { order: number; place: string; placeId: string; startTime?: string | null; endTime?: string | null; durationMinutes?: number | null; entryFee?: number | null; lat?: number | null; lng?: number | null; reason?: string | null }

function toMin(t?: string | null): number | null {
  if (!t || !/^\d{1,2}:\d{2}$/.test(t)) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/** Parse the production shape: {"Friday":[{"open":"07:00","close":"18:00"}], ...} */
function parseProductionHours(openingHours: unknown): Record<string, Array<{ open: number; close: number }>> {
  const out: Record<string, Array<{ open: number; close: number }>> = {};
  if (!openingHours || typeof openingHours !== 'object') return out;
  for (const [day, windows] of Object.entries(openingHours as Record<string, unknown>)) {
    if (!Array.isArray(windows)) continue;
    const parsed = windows
      .map((w: any) => {
        const toM = (s: unknown): number | null => {
          if (typeof s !== 'string') return null;
          const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
          if (!m) return null;
          let h = parseInt(m[1], 10);
          const min = m[2] ? parseInt(m[2], 10) : 0;
          const mer = (m[3] || '').toLowerCase();
          if (mer === 'pm' && h < 12) h += 12;
          if (mer === 'am' && h === 12) h = 0;
          if (Number.isNaN(h)) return null;
          return h * 60 + min;
        };
        const open = toM(w?.open);
        const close = toM(w?.close);
        return open != null && close != null ? { open, close } : null;
      })
      .filter((x): x is { open: number; close: number } => x != null);
    if (parsed.length) out[day.toLowerCase()] = parsed;
  }
  return out;
}

async function main() {
  // ---------- load artifacts ----------
  const files = fs.readdirSync(OUT_DIR).filter((f) => f.endsWith('.json'));
  type Art = { scenario: string; tripId: string; days: Array<{ dayNumber: number; theme?: string; stops: StopRow[] }> };
  const arts: Art[] = files
    .map((f) => JSON.parse(fs.readFileSync(path.join(OUT_DIR, f), 'utf8')))
    .filter((a) => a && Array.isArray(a.days));

  console.log(`analyzing ${arts.length} artifacts from ${OUT_DIR}\n`);

  // ---------- Test 11: time chains ----------
  let overlapCount = 0, badDuration = 0, earlyStart = 0, lateEnd = 0;
  for (const art of arts) {
    for (const day of art.days) {
      let prevEnd: number | null = null;
      for (const s of day.stops) {
        const st = toMin(s.startTime), en = toMin(s.endTime);
        if (st == null || en == null) { badDuration++; continue; }
        if (en <= st) { badDuration++; console.log(`BAD DURATION ${art.scenario} D${day.dayNumber} ${s.place}: ${s.startTime}-${s.endTime}`); }
        if (prevEnd != null && st < prevEnd) { overlapCount++; console.log(`OVERLAP ${art.scenario} D${day.dayNumber} ${s.place}`); }
        if (st < 6 * 60) { earlyStart++; console.log(`EARLY START ${art.scenario} D${day.dayNumber} ${s.place} @${s.startTime}`); }
        if (en > 22 * 60) { lateEnd++; console.log(`LATE END ${art.scenario} D${day.dayNumber} ${s.place} @${s.endTime}`); }
        prevEnd = en;
      }
    }
  }
  console.log(JSON.stringify({ overlaps: overlapCount, badDurations: badDuration, earlyStarts: earlyStart, lateEnds: lateEnd }) + '\n');

  // ---------- Opening-hours compliance vs DB truth ----------
  const ids = new Set<string>();
  arts.forEach((a) => a.days.forEach((d) => d.stops.forEach((s) => ids.add(s.placeId))));
  const places = await prisma.place.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, name: true, openingHours: true },
  });
  const hoursById = new Map(places.map((p) => [p.id, p.openingHours]));

  // Audit trips were generated without startDate -> engine treats days as generic.
  // We evaluate against EVERY weekday: a violation counts only if closed on ALL days
  // at that time (conservative), plus report per-weekday miss rate for context.
  let checkedWindows = 0, alwaysClosedViolations = 0;
  const unparseableHours: string[] = [];
  const perPlaceViolation: Array<{ name: string; time: string }> = [];
  for (const art of arts) {
    for (const day of art.days) {
      for (const s of day.stops) {
        const st = toMin(s.startTime), en = toMin(s.endTime);
        if (st == null || en == null) continue;
        const raw = hoursById.get(s.placeId);
        const parsed = parseProductionHours(raw);
        if (!raw || Object.keys(parsed).length === 0) { if (raw && !unparseableHours.includes(s.place)) unparseableHours.push(`${s.place} (${JSON.stringify(raw).slice(0, 60)})`); continue; }
        const weekdays = Object.keys(parsed);
        if (!weekdays.length) continue;
        checkedWindows++;
        const mid = Math.floor((st + en) / 2);
        const openOnSomeDay = weekdays.some((d) => parsed[d].some((w) => mid >= w.open && mid <= w.close));
        if (!openOnSomeDay) {
          alwaysClosedViolations++;
          perPlaceViolation.push({ name: `${art.scenario} D${day.dayNumber} ${s.place}`, time: s.startTime || '' });
        }
      }
    }
  }
  console.log(`opening-hour windows checked=${checkedWindows} visits-closed-all-week=${alwaysClosedViolations}`);
  perPlaceViolation.slice(0, 10).forEach((v) => console.log(`  CLOSED-ALL-WEEK: ${v.name} @${v.time}`));
  unparseableHours.slice(0, 5).forEach((u) => console.log(`  UNPARSEABLE HOURS: ${u}`));

  // ---------- Test 9: duplicates & near-duplicates ----------
  console.log('\n== duplicates / proximity pairs within same day ==');
  let dupPairs = 0;
  for (const art of arts) {
    for (const day of art.days) {
      for (let i = 0; i < day.stops.length; i++) {
        for (let j = i + 1; j < day.stops.length; j++) {
          const a = day.stops[i], b = day.stops[j];
          if (a.placeId === b.placeId) { console.log(`SAME PLACE TWICE ${art.scenario} D${day.dayNumber}: ${a.place}`); dupPairs++; continue; }
          if (a.lat != null && b.lat != null && a.lng != null && b.lng != null) {
            const d = haversineDistance(a.lat, a.lng, b.lat, b.lng) / 1000;
            const normA = a.place.toLowerCase().replace(/[^a-z]/g, '');
            const normB = b.place.toLowerCase().replace(/[^a-z]/g, '');
            const aliasish = normA.includes(normB.slice(0, 8)) || normB.includes(normA.slice(0, 8));
            if (d < 0.3 && !aliasish) {
              console.log(`PROX<300m ${art.scenario} D${day.dayNumber}: "${a.place}" <-> "${b.place}" (${(d * 1000).toFixed(0)}m)`);
              dupPairs++;
            }
          }
        }
      }
    }
  }
  if (dupPairs === 0) console.log('  none found');

  // ---------- Test 13: data quality for destination places ----------
  const destPlaces = await prisma.place.findMany({
    where: { status: 'APPROVED', mergedIntoId: null, OR: [{ city }, { district: { contains: city } }] },
    select: {
      id: true, name: true, category: true, tags: true, rating: true, reviewCount: true,
      estimatedDurationMinutes: true, recommendedDuration: true, ticketPrice: true,
      popularityScore: true, hiddenGemScore: true, description: true, openingHours: true,
    },
  });
  const gaps = destPlaces.map((p) => ({
    name: p.name,
    noCoords: false,
    noRating: p.rating == null,
    noReviews: p.reviewCount === 0,
    noDuration: p.estimatedDurationMinutes == null && !p.recommendedDuration,
    noFees: !p.ticketPrice,
    noTags: !p.tags?.length,
    noPopularity: p.popularityScore == null,
    noDescription: !p.description,
    shortDescLen: p.description?.length ?? 0,
    malformedHours: (() => {
      const h = p.openingHours as any;
      if (!h) return true;
      const vals = Object.values(h).flat() as any[];
      return !vals.length || vals.some((w) => typeof w !== 'object' || typeof w?.open !== 'string' || !/^\d{1,2}(:\d{2})?\s*(am|pm)?$/i.test(String(w?.open ?? '')));
    })(),
  }));
  const count = (pred: (g: any) => boolean) => gaps.filter(pred).length;
  console.log(`\n== data gaps across ${destPlaces.length} ${city} places ==`);
  console.log(JSON.stringify({
    noRating: count((g) => g.noRating),
    noReviews: count((g) => g.noReviews),
    noDurationInfo: count((g) => g.noDuration),
    noTags: count((g) => g.noTags),
    noPopularity: count((g) => g.noPopularity),
    noDescription: count((g) => g.noDescription),
    malformedOrMissingHours: count((g) => g.malformedHours),
  }));
  const worst = [...gaps].sort((a, b) =>
    (b.noRating ? 1 : 0) + (b.noDuration ? 1 : 0) + (b.noTags ? 1 : 0) + (b.noPopularity ? 1 : 0) + (b.malformedHours ? 1 : 0)
    - ((a.noRating ? 1 : 0) + (a.noDuration ? 1 : 0) + (a.noTags ? 1 : 0) + (a.noPopularity ? 1 : 0) + (a.malformedHours ? 1 : 0)),
  ).slice(0, 20);
  console.log('\n== TOP 20 worst metadata records ==');
  worst.forEach((g) => console.log(`${g.name.padEnd(44)} rating:${g.noRating ? 'MISSING' : 'ok'} dur:${g.noDuration ? 'MISSING' : 'ok'} tags:${g.noTags ? 'MISSING' : 'ok'} pop:${g.noPopularity ? 'MISSING' : 'ok'} hours:${g.malformedHours ? 'MALFORMED' : 'ok'} descLen:${g.shortDescLen}`));

  // ---------- Test 14: vendors/offers availability ----------
  const vendors = await prisma.vendor.count();
  const vendorsNear = await prisma.vendor.count({
    where: { OR: [{ city: { contains: city } }, { businessCity: { contains: city } }] } as never,
  }).catch(() => -1);
  let offers = -1, activeOffers = -1;
  try {
    offers = await prisma.vendorOffer.count();
    activeOffers = await prisma.vendorOffer.count({ where: { isActive: true, validFrom: { lte: new Date() }, validUntil: { gte: new Date() } } });
  } catch { /* table shape differs */ }
  console.log(`\n== vendors/offers ==\ntotalVendors=${vendors} vendorsNear${city}=${vendorsNear} totalOffers=${offers} activeOffers=${activeOffers}`);

  // ---------- Test 15: gamification linkage ----------
  const walletCount = await prisma.wallet.count();
  console.log(`\n== gamification ==\nwallets=${walletCount}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
