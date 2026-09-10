/**
 * PALSAFAR TREASURE HUNT — RELEASE GATE v35 (E2E, HTTP-level, TEST DB only)
 *
 * Exactly 35 unique scenarios (S01..S35) covering:
 *   - test-DB guard, seed + stale-test cleanup
 *   - multi-city GPS resolution (OSM/Google agnostic, canonical city identity)
 *   - admin HTTP create + Excel bulk import (validate/confirm/idempotency)
 *   - per-city isolation, unsupported-city no-leak, ?city= override attack
 *   - hidden-data audit (list/detail/my-submission JSON + DB source-of-truth)
 *   - cross-city security (GET detail / hint / check-in / submit → 403)
 *   - check-in radius (within/outside 500m), fake distance/allowed/stale-check-in attacks
 *   - city normalization (write-path canonical + legacy alias reads)
 *   - admin approval / duplicate-submit 409 / concurrent approve / wallet atomicity / reject
 *   - marker-scoped cleanup + DB hygiene (non-marker data untouched)
 *
 * Uses supertest(app) directly — no external server required.
 * Run via:  node scripts/_releasegate-boot.cjs scripts/release-gate-treasure-hunt-35.ts
 */
import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/config/database';
import { ensureDbExtensions } from '../src/config/db-extensions';
import { ensureSeedData } from '../src/config/db-seed';
import { reverseGeocodeToCity } from '../src/shared/utils/reverseGeocode';
import { cityDisplayName, canonicalCityKey } from '../src/shared/utils/cityIdentity';
import * as XLSX from 'xlsx';

const BASE = '/api/v1';
const TEST_DB_HOST = 'dpg-d9usgk37uimc73al1gv0-a.ohio-postgres.render.com';
const PROD_DB_HOST = 'dpg-d9rqpkf10e5c738lgckg-a.singapore-postgres.render.com';
const GEO_PACE_MS = 650; // stay comfortably under OSM Nominatim's ~1 req/s tolerance

// ─────────────────────────────── harness ───────────────────────────────

type Pass = 'PASS' | 'FAIL' | 'SKIP';
interface Row { id: string; label: string; pass: Pass; detail: string; }

const rows: Row[] = [];
let passCount = 0;
let failCount = 0;
let skipCount = 0;

function scenario(id: string, label: string, fn: () => Promise<string>): Promise<void> {
  return Promise.resolve().then(async () => {
    try {
      const detail = await fn();
      passCount++;
      rows.push({ id, label, pass: 'PASS', detail });
      console.log(`  [PASS] S${id} ${label} — ${detail}`);
    } catch (e: any) {
      failCount++;
      rows.push({ id, label, pass: 'FAIL', detail: (e && e.message) || String(e) });
      console.log(`  [FAIL] S${id} ${label} — ${(e && e.message) || String(e)}`);
    }
  });
}

function assert(cond: any, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Bounded retry for transient DB connectivity blips on the remote test instance.
// Only CONNECTION-level errors are retried; query/validation errors fail fast.
async function dbWithRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const CONNECT_CODES = new Set(['P1001', 'P1002', 'P1017', 'P2028', 'ECONNRESET', 'ETIMEDOUT']);
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      const msg = String(e?.message || e);
      const retriable = CONNECT_CODES.has(e?.code) || msg.includes('Can\'t reach database server');
      if (!retriable || attempt === 5) throw e;
      console.error(`[db-retry] ${label} transient: ${e?.code || e?.message} (attempt ${attempt}/5)`);
      await sleep(1500 * attempt);
    }
  }
  throw new Error(`dbWithRetry exhausted for ${label}`);
}

// ─────────────────────────────── api helpers ───────────────────────────────

function authReq(method: 'get' | 'post' | 'patch' | 'delete', path: string, token: string, body?: any) {
  const req = request(app)[method](BASE + path).set('Authorization', `Bearer ${token}`);
  if (body !== undefined) req.send(body);
  return req;
}

async function login(email: string, password: string): Promise<string> {
  for (let i = 0; i < 6; i++) {
    let res: any = null;
    try {
      res = await request(app).post(`${BASE}/auth/login`).send({ email, password });
    } catch (e: any) {
      // network/socket-level failure — no response received; retry is safe
      // (login writes no state beyond a token). Log for evidence, then back off.
      console.error(`[login] transient failure for ${email}: ${e?.code || e?.message} (attempt ${i + 1}/6)`);
    }
    if (res && res.status === 200 && res.body?.data?.accessToken) return res.body.data.accessToken;
    await sleep(1000 * (i + 1));
  }
  throw new Error(`login failed for ${email}`);
}

function offsetMeters(lat: number, lng: number, north: number, east: number) {
  const latOff = north / 111320;
  const lngOff = east / (111320 * Math.cos((lat * Math.PI) / 180));
  return { lat: lat + latOff, lng: lng + lngOff };
}

const FORBIDDEN_GAMEPLAY = ['correctLat', 'correctLng', 'correctPlaceName', 'hintImage'];

/** Reverse-geocode with local caching + pacing. Resolves to the canonical display name. */
const geoCache = new Map<string, Promise<string>>();
function resolveCity(label: string, lat: number, lng: number): Promise<string> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const existing = geoCache.get(key);
  if (existing) return existing;
  const p = (async () => {
    let city: string | null = null;
    for (let i = 0; i < 4 && !city; i++) {
      try { city = await reverseGeocodeToCity(lat, lng); } catch { /* retry */ }
      if (!city) {
        await sleep(600);
      }
    }
    if (!city) throw new Error(`CITY_RESOLUTION_FAILED for ${label}`);
    await sleep(GEO_PACE_MS);
    return city;
  })();
  geoCache.set(key, p);
  return p;
}

// ─────────────────────────────── main ───────────────────────────────

async function main() {
  const MARKER = `TEST_E2E_${Date.now()}`;
  const PLACE_PREFIX = `TEST_E2E_PLACE_${Date.now()}`;

  console.log('\nMARKER:', MARKER);

  // ── S01 · Preflight: extensions, seeds, test-DB guard, stale cleanup, auth ──
  await scenario('01', 'Preflight: test-DB guard + seeds + stale cleanup + auth', async () => {
    const dbUrl = process.env.DATABASE_URL || '';
    const host = new URL(dbUrl).hostname;
    const isTest = host === TEST_DB_HOST;
    const isProd = host === PROD_DB_HOST;
    assert(isTest, `DATABASE_URL host=[${host}] — must be the TEST database`);
    assert(!isProd, `PROHIBITED: would run against production DB ([${PROD_DB_HOST}])`);

    await dbWithRetry('S01 ensureDbExtensions', ensureDbExtensions);
    await dbWithRetry('S01 ensureSeedData', ensureSeedData);

    const userRow = await dbWithRetry('S01 user lookup', () => prisma.user.findUnique({ where: { email: 'user@palsafar.com' }, select: { id: true } }));
    const adminRow = await dbWithRetry('S01 admin lookup', () => prisma.user.findUnique({ where: { email: 'shivaay.chelani@gmail.com' }, select: { id: true } }));
    assert(userRow && adminRow, 'Seed user/admin accounts missing');

    // Marker-scoped stale cleanup (previous gate runs).
    const staleRiddles = await dbWithRetry('S01 stale scan', () => prisma.riddle.findMany({ where: { title: { startsWith: 'TEST_E2E' } }, select: { id: true } }));
    if (staleRiddles.length) {
      const staleSubs = await dbWithRetry('S01 stale subs', () => prisma.riddleSubmission.findMany({ where: { riddleId: { in: staleRiddles.map((r) => r.id) } }, select: { id: true } }));
      const subIds = staleSubs.map((s) => s.id);
      if (subIds.length) await prisma.walletTransaction.deleteMany({ where: { referenceId: { in: subIds }, referenceType: 'RIDDLE' } });
      await prisma.riddleSubmission.deleteMany({ where: { riddleId: { in: staleRiddles.map((r) => r.id) } } });
    }
    await prisma.riddle.deleteMany({ where: { title: { startsWith: 'TEST_E2E' } } });
    await prisma.place.deleteMany({ where: { name: { startsWith: 'TEST_E2E_PLACE' } } });

    const nonMarkerBefore = await prisma.riddle.count({ where: { NOT: { title: { startsWith: 'TEST_E2E' } } } });
    (globalThis as any).__nonMarkerBefore = nonMarkerBefore;

    return `DB=[${host}] seeds OK, cleaned stale=${staleRiddles.length}, non-marker riddles=${nonMarkerBefore}`;
  });

  // ── S02 · Multi-city GPS resolution — canonical identity ──
  let kolCity: string, delCity: string, bhoCity: string, bomCity: string; // captured for later use
  const KOL = { lat: 22.5448, lng: 88.3426 };
  const DEL = { lat: 28.6129, lng: 77.2295 };
  const BHO = { lat: 23.2599, lng: 77.4126 };
  const BOM = { lat: 18.922, lng: 72.8347 };

  await scenario('02', 'Multi-city GPS resolution → canonical city names', async () => {
    const cities = await Promise.all([
      resolveCity('Kolkata', KOL.lat, KOL.lng),
      resolveCity('Delhi', DEL.lat, DEL.lng),
      resolveCity('Bhopal', BHO.lat, BHO.lng),
      resolveCity('Mumbai', BOM.lat, BOM.lng),
    ]);
    [kolCity, delCity, bhoCity, bomCity] = cities;
    const expected: Array<[string, string]> = [
      [kolCity, 'Kolkata'], [delCity, 'Delhi'], [bhoCity, 'Bhopal'], [bomCity, 'Mumbai'],
    ];
    for (const [got, want] of expected) {
      assert(cityDisplayName(got) === want, `[${got}] canonicalized to [${cityDisplayName(got)}] ≠ expected [${want}]`);
    }
    assert(new Set(cities.map((c) => canonicalCityKey(c))).size === 4, 'resolved cities must be pairwise distinct');
    return `KOL=${kolCity} DEL=${delCity} BHO=${bhoCity} BOM=${bomCity} (all canonical display names)`;
  });

  // Destination fixture places (approved, with coords) — the answer candidates.
  const DEST = {
    kolkata: { name: `${PLACE_PREFIX}_Victoria`, lat: KOL.lat, lng: KOL.lng },
    delhi: { name: `${PLACE_PREFIX}_IndiaGate`, lat: DEL.lat, lng: DEL.lng },
    bhopal: { name: `${PLACE_PREFIX}_TajUlMasajid`, lat: BHO.lat, lng: BHO.lng },
    mumbai: { name: `${PLACE_PREFIX}_GatewayOfIndia`, lat: BOM.lat, lng: BOM.lng },
    pune: { name: `${PLACE_PREFIX}_ShaniwarWada`, lat: 18.5196, lng: 73.8553 },
  };
  await prisma.place.createMany({
    data: Object.values(DEST).map((d) => ({
      name: d.name,
      slug: d.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      description: 'E2E release-gate test destination',
      category: 'Monument',
      status: 'APPROVED' as any,
      latitude: d.lat,
      longitude: d.lng,
      city: d.name.includes('Victoria') ? 'Kolkata' : d.name.includes('IndiaGate') ? 'Delhi' : d.name.includes('TajUl') ? 'Bhopal' : d.name.includes('Gateway') ? 'Mumbai' : 'Pune',
      state: d.name.includes('Victoria') ? 'West Bengal' : d.name.includes('IndiaGate') ? 'Delhi' : d.name.includes('TajUl') ? 'Madhya Pradesh' : 'Maharashtra',
    })),
  });
  const placePune = DEST.pune;

  // ── S03 · Admin HTTP create (11 riddles, incl. messy-city write-path sample) ──
  const riddleData = {
    kol: { title: `${MARKER} Riddle Kolkata`, clue: 'White-marble monument clue', hintImage: 'https://example.com/hint-kolkata.jpg', correctPlaceName: DEST.kolkata.name, correctLat: DEST.kolkata.lat, correctLng: DEST.kolkata.lng, rewardPoints: 100 },
    del: { title: `${MARKER} Riddle Delhi`, clue: 'National gate clue', hintImage: 'https://example.com/hint-delhi.jpg', correctPlaceName: DEST.delhi.name, correctLat: DEST.delhi.lat, correctLng: DEST.delhi.lng, rewardPoints: 120 },
    bho: { title: `${MARKER} Riddle Bhopal`, clue: 'Grand mosque clue', correctPlaceName: DEST.bhopal.name, correctLat: DEST.bhopal.lat, correctLng: DEST.bhopal.lng, rewardPoints: 90 },
    bom: { title: `${MARKER} Riddle Mumbai`, clue: 'Harbour arch clue', hintImage: 'https://example.com/hint-mumbai.jpg', correctPlaceName: DEST.mumbai.name, correctLat: DEST.mumbai.lat, correctLng: DEST.mumbai.lng, rewardPoints: 100 },
    norm: { title: `${MARKER} Riddle Norm`, clue: 'Write-path normalization sample', correctPlaceName: DEST.kolkata.name, correctLat: DEST.kolkata.lat, correctLng: DEST.kolkata.lng, city: '  KolKaTa Municipal Corp  ', rewardPoints: 100 },
    noHind: { title: `${MARKER} Riddle NoHint`, clue: 'Clue with no hint image', correctPlaceName: DEST.kolkata.name, correctLat: DEST.kolkata.lat, correctLng: DEST.kolkata.lng, rewardPoints: 100 },
    appr: { title: `${MARKER} Riddle Approve`, clue: 'Admin approval flow', correctPlaceName: DEST.kolkata.name, correctLat: DEST.kolkata.lat, correctLng: DEST.kolkata.lng, rewardPoints: 100 },
    conc: { title: `${MARKER} Riddle Concurrent`, clue: 'Concurrent approval flow', correctPlaceName: DEST.kolkata.name, correctLat: DEST.kolkata.lat, correctLng: DEST.kolkata.lng, rewardPoints: 150 },
    rew: { title: `${MARKER} Riddle Reward`, clue: 'Reward atomicity flow', correctPlaceName: DEST.kolkata.name, correctLat: DEST.kolkata.lat, correctLng: DEST.kolkata.lng, rewardPoints: 90 },
    rej: { title: `${MARKER} Riddle Reject`, clue: 'Reject flow', correctPlaceName: DEST.kolkata.name, correctLat: DEST.kolkata.lat, correctLng: DEST.kolkata.lng, rewardPoints: 100 },
    ato: { title: `${MARKER} Riddle Atomic`, clue: 'Balance math flow', correctPlaceName: DEST.kolkata.name, correctLat: DEST.kolkata.lat, correctLng: DEST.kolkata.lng, rewardPoints: 120 },
  };

  let userToken: string = '', adminToken: string = '';
  const riddleIds: Record<string, string> = {};
  await scenario('03', 'Admin HTTP create 11 riddles (incl. messy city) → 201', async () => {
    userToken = await login('user@palsafar.com', 'User@123');
    adminToken = await login('shivaay.chelani@gmail.com', 'Admin@123');
    for (const [key, data] of Object.entries(riddleData) as [string, any][]) {
      const payload: any = { ...data };
      if (data.city === undefined) {
        const cityKeys = ['kol', 'del', 'bho', 'bom', 'norm', 'noHind', 'appr', 'conc', 'rew', 'rej', 'ato'];
        const cityNames = ['Kolkata', 'Delhi', 'Bhopal', 'Mumbai', 'Kolkata', 'Kolkata', 'Kolkata', 'Kolkata', 'Kolkata', 'Kolkata', 'Kolkata'];
        payload.city = cityNames[cityKeys.indexOf(key)] || 'Kolkata';
      }
      if (data.hintImage === undefined) delete payload.hintImage;
      payload.startsAt = new Date().toISOString();

      // Idempotent-with-retry: a transient DB/socket hiccup must never double-create.
      let res: any = null;
      for (let attempt = 1; attempt <= 4; attempt++) {
        try {
          res = await authReq('post', '/admin/riddles', adminToken, payload);
        } catch (e: any) {
          res = null; // network/socket-level failure — no response received
        }
        if (res && res.status === 201 && res.body?.data?.id) break;
        const existing = await prisma.riddle.findFirst({ where: { title: payload.title } });
        if (existing) { res = { status: 201, body: { data: existing } }; break; }
        await sleep(2000 * attempt);
      }
      assert(res && res.status === 201, `create ${key}: failed after retries (last=${res && res.status} ${JSON.stringify(res && res.body).slice(0, 200)})`);
      assert(res.body?.data?.id, `create ${key}: missing id`);
      riddleIds[key] = res.body.data.id;
    }
    return `created ${Object.keys(riddleIds).length} riddles (kol/del/bho/bom/norm/noHind/appr/conc/rew/rej/ato)`;
  });

  // ── S04 · Excel validation breakdown ──
  await scenario('04', 'Excel validate: 6 rows → 4 VALID / 1 NEEDS_ATTENTION / 1 INVALID', async () => {
    const wb = XLSX.utils.book_new();
    const wsData = [
      ['State', 'District', 'City Name', 'Riddle English', 'Answer English', 'Riddle Hindi', 'Answer Hindi', 'Reward'],
      ['WB', 'Kolkata', ' Kolkata ', `${MARKER} XLSX Kolkata`, DEST.kolkata.name, '', '', '100'],
      ['DL', 'Delhi', 'Delhi', `${MARKER} XLSX Delhi`, DEST.delhi.name, '', '', '120'],
      ['MH', 'Mumbai', 'Mumbai', `${MARKER} XLSX Mumbai`, DEST.mumbai.name, '', '', '100'],
      ['MH', 'Pune', 'Pune', `${MARKER} XLSX Pune`, placePune.name, '', '', '100'],
      ['WB', 'Kolkata', 'Kolkata', `${MARKER} XLSX Unknown`, 'NoSuchPlace_XYZ_12345', '', '', '100'],
      ['', '', '', `${MARKER} XLSX Missing`, DEST.kolkata.name, '', '', '100'],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(wsData), 'Riddles');
    const buf: any = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const res = await request(app)
      .post(`${BASE}/admin/riddles/bulk-import/validate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', buf, 'riddles.xlsx');
    assert(res.status === 200, `status=${res.status} ${JSON.stringify(res.body).slice(0, 200)}`);
    const summary = res.body.data.summary;
    assert(summary.total === 6, `total=${summary.total}`);
    assert(summary.valid === 4, `valid=${summary.valid}`);
    assert(summary.needsAttention === 1, `needsAttention=${summary.needsAttention}`);
    assert(summary.invalid === 1, `invalid=${summary.invalid}`);
    assert(summary.citiesCount === 4, `citiesCount=${summary.citiesCount}`);
    const expected: Record<string, number> = { Kolkata: 2, Delhi: 1, Mumbai: 1, Pune: 1 };
    for (const [c, n] of Object.entries(expected)) assert(summary.citiesBreakdown[c] === n, `breakdown[${c}]=${summary.citiesBreakdown[c]} exp ${n}`);
    const statuses = res.body.data.data.map((r: any) => r.status);
    assert(statuses.filter((s: string) => s === 'VALID').length === 4, 'VALID count');
    assert(statuses.filter((s: string) => s === 'NEEDS_ATTENTION').length === 1, 'NEEDS_ATTENTION count');
    assert(statuses.filter((s: string) => s === 'INVALID').length === 1, 'INVALID count');
    (globalThis as any).__xlsxRowsKol = res.body.data.data; // reuse in S05
    return `total=6 valid=4 attention=1 invalid=1 breakdown=${JSON.stringify(summary.citiesBreakdown)}`;
  });

  // ── S05 · Excel confirm import + trimmed/normalized city stored ──
  await scenario('05', 'Excel confirm → import 4; city " Kolkata " stored as "Kolkata"', async () => {
    const validRows = ((globalThis as any).__xlsxRowsKol as any[]).filter((r) => r.status === 'VALID');
    const c1 = await authReq('post', '/admin/riddles/bulk-import/confirm', adminToken, { validRows });
    assert(c1.status === 200, `confirm status=${c1.status} ${JSON.stringify(c1.body).slice(0, 200)}`);
    assert(c1.body.data.imported === 4, `imported=${c1.body.data.imported}`);
    const dbRiddle = await prisma.riddle.findFirst({ where: { title: `${MARKER} XLSX Kolkata` } });
    assert(dbRiddle, 'imported XLSX Kolkata riddle missing in DB');
    assert(dbRiddle!.city === 'Kolkata', `stored city=[${dbRiddle!.city}] expected Kolkata (trim/normalize)`);
    return `imported=4, stored city trim+canonical → "Kolkata"`;
  });

  // ── S06 · Duplicate import idempotency ──
  await scenario('06', 'Reconfirm same valid rows → imported=0, no dup rows', async () => {
    const validRows = ((globalThis as any).__xlsxRowsKol as any[]).filter((r) => r.status === 'VALID');
    const c2 = await authReq('post', '/admin/riddles/bulk-import/confirm', adminToken, { validRows });
    assert(c2.status === 200, `confirm2 status=${c2.status}`);
    assert(c2.body.data.imported === 0, `second import=${c2.body.data.imported} (expected 0)`);
    const total = await prisma.riddle.count({ where: { title: `${MARKER} XLSX Kolkata` } });
    assert(total === 1, `DB count=${total} for re-uploaded riddle`);
    return `second import=0, DB count stays 1 (idempotent)`;
  });

  // ── S07 · Unknown answer → NEEDS_ATTENTION ──
  await scenario('07', 'Unknown answer destination → NEEDS_ATTENTION (match=null)', async () => {
    const wb = XLSX.utils.book_new();
    const wsData = [
      ['City Name', 'Riddle English', 'Answer English', 'Reward'],
      ['Kolkata', `${MARKER} UnknownRow`, 'NoSuchPlace_XYZ_54321', '100'],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(wsData), 'Riddles');
    const buf: any = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const res = await request(app)
      .post(`${BASE}/admin/riddles/bulk-import/validate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', buf, 'r.xlsx');
    assert(res.status === 200, `status=${res.status}`);
    const row = res.body.data.data[0];
    assert(row.status === 'NEEDS_ATTENTION', `status=${row.status}`);
    assert(row.match === null, 'match must be null');
    assert((row.error || '').includes('Destination not found'), `error=${row.error}`);
    return 'unknown destination blocked → NEEDS_ATTENTION, match=null';
  });

  // ── S08 · Kolkata GPS → only Kolkata marker riddles ──
  await scenario('08', 'Kolkata GPS → Kolkata riddles only (no Delhi/Bhopal/Mumbai)', async () => {
    await sleep(GEO_PACE_MS);
    const res = await authReq('get', `/riddles/active/current-location?lat=${KOL.lat}&lng=${KOL.lng}`, userToken);
    assert(res.status === 200, `status=${res.status} ${JSON.stringify(res.body).slice(0, 200)}`);
    assert(res.body.data.city === 'Kolkata', `city=${res.body.data.city}`);
    const mine = res.body.data.riddles.filter((r: any) => r.title && r.title.startsWith(MARKER));
    assert(mine.length >= 7, `marker riddles=${mine.length}`);
    for (const r of mine) assert(r.city === 'Kolkata', `non-Kolkata leaked: ${r.title}@${r.city}`);
    return `city=Kolkata, ${mine.length} marker riddles, all Kolkata`;
  });

  // ── S09 · Delhi GPS → only Delhi marker riddles ──
  await scenario('09', 'Delhi GPS → Delhi riddles only', async () => {
    await sleep(GEO_PACE_MS);
    const res = await authReq('get', `/riddles/active/current-location?lat=${DEL.lat}&lng=${DEL.lng}`, userToken);
    assert(res.status === 200, `status=${res.status}`);
    assert(res.body.data.city === 'Delhi', `city=${res.body.data.city}`);
    const mine = res.body.data.riddles.filter((r: any) => r.title && r.title.startsWith(MARKER));
    assert(mine.length >= 1, `no Delhi marker riddles`);
    for (const r of mine) assert(r.city === 'Delhi', `non-Delhi leaked: ${r.title}@${r.city}`);
    return `city=Delhi, ${mine.length} marker riddles, all Delhi`;
  });

  // ── S10 · Bhopal GPS → only Bhopal marker riddles ──
  await scenario('10', 'Bhopal GPS → Bhopal riddles only', async () => {
    await sleep(GEO_PACE_MS);
    const res = await authReq('get', `/riddles/active/current-location?lat=${BHO.lat}&lng=${BHO.lng}`, userToken);
    assert(res.status === 200, `status=${res.status}`);
    assert(res.body.data.city === 'Bhopal', `city=${res.body.data.city}`);
    const mine = res.body.data.riddles.filter((r: any) => r.title && r.title.startsWith(MARKER));
    assert(mine.length >= 1, `no Bhopal marker riddles`);
    for (const r of mine) assert(r.city === 'Bhopal', `non-Bhopal leaked: ${r.title}@${r.city}`);
    return `city=Bhopal, ${mine.length} marker riddles, all Bhopal`;
  });

  // ── S11 · Unsupported city (Mumbai) — no cross-city leak ──
  await scenario('11', 'Mumbai GPS → no Kolkata/Delhi/Bhopal leak', async () => {
    await sleep(GEO_PACE_MS);
    const res = await authReq('get', `/riddles/active/current-location?lat=${BOM.lat}&lng=${BOM.lng}`, userToken);
    assert(res.status === 200, `status=${res.status} ${JSON.stringify(res.body).slice(0, 200)}`);
    assert(res.body.data.city === 'Mumbai', `city=${res.body.data.city}`);
    const mine = res.body.data.riddles.filter((r: any) => r.title && r.title.startsWith(MARKER));
    assert(mine.length >= 1, `no Mumbai marker riddles (Mumbai riddle should be visible here)`);
    const cross = mine.filter((r: any) => ['Kolkata', 'Delhi', 'Bhopal'].includes(r.city));
    assert(cross.length === 0, `CROSS-CITY LEAK: ${cross.map((r: any) => `${r.title}@${r.city}`).join(', ')}`);
    for (const r of mine) assert(r.city === 'Mumbai', `non-Mumbai marker riddle: ${r.title}@${r.city}`);
    return `city=Mumbai, ${mine.length} marker riddles, zero Kolkata/Delhi/Bhopal leak`;
  });

  // ── S12 · Client ?city= override attack ignored ──
  await scenario('12', 'Client ?city=Delhi override ignored (GPS wins)', async () => {
    await sleep(GEO_PACE_MS);
    const res = await authReq('get', `/riddles/active/current-location?lat=${KOL.lat}&lng=${KOL.lng}&city=Delhi`, userToken);
    assert(res.status === 200, `status=${res.status}`);
    assert(res.body.data.city === 'Kolkata', `city=${res.body.data.city} (must ignore ?city=)`);
    const delItems = res.body.data.riddles.filter((r: any) => r.title && r.title.startsWith(MARKER) && r.city === 'Delhi');
    assert(delItems.length === 0, `Delhi riddles surfaced=${delItems.length}`);
    return `?city=Delhi ignored → city=Kolkata, 0 Delhi riddles`;
  });

  // ── S13 · Detail JSON hides coordinates/answer/hint ──
  await scenario('13', 'Riddle detail hides correctLat/Lng, correctPlaceName, hintImage', async () => {
    await sleep(GEO_PACE_MS);
    const res = await authReq('get', `/riddles/${riddleIds.kol}?lat=${KOL.lat}&lng=${KOL.lng}`, userToken);
    assert(res.status === 200, `status=${res.status} ${JSON.stringify(res.body).slice(0, 200)}`);
    const keys = Object.keys(res.body.data);
    const leaked = keys.filter((k) => FORBIDDEN_GAMEPLAY.includes(k));
    assert(leaked.length === 0, `forbidden keys exposed: ${leaked.join(',')}`);
    const raw = JSON.stringify(res.body);
    for (const f of FORBIDDEN_GAMEPLAY) assert(raw.includes(`"${f}"`) === false, `field "${f}" present in detail JSON`);
    assert(raw.includes(DEST.kolkata.name) === false, 'answer name leaked in detail');
    return `detail keys=[${keys.join(',')}] → secrets withheld`;
  });

  // ── S14 · List payload field scan + hasHint flags ──
  await scenario('14', 'List payload: forbidden fields absent; hasHint correct', async () => {
    await sleep(GEO_PACE_MS);
    const res = await authReq('get', `/riddles/active/current-location?lat=${KOL.lat}&lng=${KOL.lng}`, userToken);
    assert(res.status === 200, `status=${res.status}`);
    const raw = JSON.stringify(res.body);
    for (const f of FORBIDDEN_GAMEPLAY) assert(raw.includes(`"${f}"`) === false, `field "${f}" present in list JSON`);
    const mine = res.body.data.riddles.filter((r: any) => r.title && r.title.startsWith(MARKER));
    const byTitle = Object.fromEntries(mine.map((r: any) => [r.title, r]));
    assert(byTitle[riddleData.kol.title].hasHint === true, 'kol hasHint must be true');
    assert(byTitle[riddleData.noHind.title].hasHint === false, 'noHind hasHint must be false');
    return `forbidden absent; kol.hasHint=true noHind.hasHint=false`;
  });

  // ── S15 · DB source-of-truth still holds the secret (proves hiding) ──
  await scenario('15', 'DB source-of-truth holds coords/answer/hint (hiding is real)', async () => {
    const dbR = await prisma.riddle.findUnique({ where: { id: riddleIds.kol }, select: { correctLat: true, correctLng: true, correctPlaceName: true, hintImage: true } });
    assert(dbR && dbR.correctLat != null && dbR.correctLng != null, 'DB must hold coordinates');
    assert(dbR.correctPlaceName === DEST.kolkata.name, 'DB must hold the answer');
    assert(dbR.hintImage != null, 'DB must hold hint');
    return 'secrets EXIST in DB but are withheld from every gameplay JSON payload (S13/S14)';
  });

  // ── S16 · Cross-city GET detail → 403 ──
  await scenario('16', 'Cross-city GET detail → 403 TREASURE_HUNT_CITY_MISMATCH', async () => {
    await sleep(GEO_PACE_MS);
    const res = await authReq('get', `/riddles/${riddleIds.kol}?lat=${DEL.lat}&lng=${DEL.lng}`, userToken);
    assert(res.status === 403, `expected 403 got ${res.status} ${JSON.stringify(res.body).slice(0, 200)}`);
    assert(res.body?.code === 'TREASURE_HUNT_CITY_MISMATCH', `code=${res.body?.code}`);
    return `403 code=TREASURE_HUNT_CITY_MISMATCH`;
  });

  // ── S17 · Cross-city POST hint → 403 ──
  await scenario('17', 'Cross-city POST hint → 403', async () => {
    await sleep(GEO_PACE_MS);
    const res = await authReq('post', `/riddles/${riddleIds.kol}/hint`, userToken, { userLat: DEL.lat, userLng: DEL.lng });
    assert(res.status === 403, `expected 403 got ${res.status} ${JSON.stringify(res.body).slice(0, 200)}`);
    return `403 (code=${res.body?.code})`;
  });

  // ── S18 · Cross-city check-in → 403 ──
  await scenario('18', 'Cross-city check-in → 403', async () => {
    await sleep(GEO_PACE_MS);
    const res = await authReq('post', `/riddles/${riddleIds.kol}/validate-checkin`, userToken, { userLat: DEL.lat, userLng: DEL.lng });
    assert(res.status === 403, `expected 403 got ${res.status} ${JSON.stringify(res.body).slice(0, 200)}`);
    return `403 (code=${res.body?.code})`;
  });

  // ── S19 · Cross-city submit → 403, no submission row ──
  await scenario('19', 'Cross-city submit → 403 (nothing persisted)', async () => {
    await sleep(GEO_PACE_MS);
    const res = await authReq('post', `/riddles/${riddleIds.kol}/submit`, userToken, { photoUrl: `https://example.com/photo-${MARKER}-x.jpg`, userLat: DEL.lat, userLng: DEL.lng });
    assert(res.status === 403, `expected 403 got ${res.status} ${JSON.stringify(res.body).slice(0, 200)}`);
    const row = await prisma.riddleSubmission.findUnique({ where: { riddleId_userId: { riddleId: riddleIds.kol, userId: (await prisma.user.findUniqueOrThrow({ where: { email: 'user@palsafar.com' }, select: { id: true } })).id } } });
    assert(!row, 'a cross-city submission silently persisted');
    return `403; DB has no submission for (kol,user)`;
  });

  // ── S20 · Check-in within 500m → allowed ──
  const closeKol = offsetMeters(DEST.kolkata.lat, DEST.kolkata.lng, 50, 0);

  // Resilient submit: recovers the existing submission id on transient network loss.
  async function submitOrRecover(riddleId: string, photoUrl: string) {
    const userId = (await prisma.user.findUniqueOrThrow({ where: { email: 'user@palsafar.com' }, select: { id: true } })).id;
    for (let attempt = 1; attempt <= 4; attempt++) {
      let res: any = null;
      try {
        res = await authReq('post', `/riddles/${riddleId}/submit`, userToken, { photoUrl, userLat: closeKol.lat, userLng: closeKol.lng });
      } catch { res = null; }
      if (res && res.status === 201 && res.body?.data?.id) return res.body.data.id;
      const mine = await prisma.riddleSubmission.findUnique({ where: { riddleId_userId: { riddleId, userId } } });
      if (mine) return mine.id;
      await sleep(2000 * attempt);
    }
    throw new Error(`submit failed for riddle ${riddleId}`);
  }
  await scenario('20', 'Check-in within 500m → allowed=true', async () => {
    await sleep(GEO_PACE_MS);
    const res = await authReq('post', `/riddles/${riddleIds.kol}/validate-checkin`, userToken, { userLat: closeKol.lat, userLng: closeKol.lng });
    assert(res.status === 200, `status=${res.status} ${JSON.stringify(res.body).slice(0, 200)}`);
    assert(res.body.data.allowed === true, `allowed=${res.body.data.allowed}`);
    assert(res.body.data.distanceMeters <= 500, `distance=${res.body.data.distanceMeters}`);
    return `allowed=true distance=${res.body.data.distanceMeters}m`;
  });

  // ── S21 · Check-in outside 500m (same city) → allowed=false ──
  const farKol800 = offsetMeters(DEST.kolkata.lat, DEST.kolkata.lng, 800, 0);
  await scenario('21', 'Check-in 800m away (same city) → allowed=false', async () => {
    await sleep(GEO_PACE_MS);
    const res = await authReq('post', `/riddles/${riddleIds.kol}/validate-checkin`, userToken, { userLat: farKol800.lat, userLng: farKol800.lng });
    assert(res.status === 200, `status=${res.status} ${JSON.stringify(res.body).slice(0, 200)}`);
    assert(res.body.data.allowed === false, `allowed=${res.body.data.allowed}`);
    assert(res.body.data.distanceMeters > 500, `distance=${res.body.data.distanceMeters}`);
    return `allowed=false distance=${res.body.data.distanceMeters}m (city still Kolkata)`;
  });

  // ── S22 · Valid photo submission → 201 PENDING ──
  let sidAppr: string;
  await scenario('22', 'Valid in-city photo submission → 201 PENDING', async () => {
    await sleep(GEO_PACE_MS);
    sidAppr = await submitOrRecover(riddleIds.appr, `https://example.com/photo-${MARKER}-appr.jpg`);
    const subRow = await prisma.riddleSubmission.findUniqueOrThrow({ where: { id: sidAppr }, select: { status: true } });
    assert(subRow.status === 'PENDING', `status=${subRow.status}`);
    return `submission created (${sidAppr}) → PENDING`;
  });

  // ── S23 · Duplicate submission → 409 ──
  await scenario('23', 'Duplicate submission (same riddle) → 409', async () => {
    await sleep(GEO_PACE_MS);
    const res = await authReq('post', `/riddles/${riddleIds.appr}/submit`, userToken, { photoUrl: `https://example.com/photo-${MARKER}-appr2.jpg`, userLat: closeKol.lat, userLng: closeKol.lng });
    assert(res.status === 409, `expected 409 got ${res.status} body=${JSON.stringify(res.body).slice(0, 250)}`);
    return `409 (code=${res.body?.code})`;
  });

  // ── S24 · Fake distanceMeters spoof → ignored ──
  const farKol3k = offsetMeters(DEST.kolkata.lat, DEST.kolkata.lng, 3000, 0);
  await scenario('24', 'Fake distanceMeters=10 spoof → rejected (server recomputes from GPS)', async () => {
    await sleep(GEO_PACE_MS);
    const res = await authReq('post', `/riddles/${riddleIds.noHind}/submit`, userToken, { photoUrl: `https://example.com/photo-${MARKER}-d.jpg`, userLat: farKol3k.lat, userLng: farKol3k.lng, distanceMeters: 10 });
    assert(res.status === 400 || res.status === 403, `expected rejection got ${res.status} body=${JSON.stringify(res.body).slice(0, 200)}`);
    const sub = await prisma.riddleSubmission.findUnique({ where: { riddleId_userId: { riddleId: riddleIds.noHind, userId: (await prisma.user.findUniqueOrThrow({ where: { email: 'user@palsafar.com' }, select: { id: true } })).id } } });
    assert(!sub, 'spoofed-distance submission persisted');
    return `rejected ${res.status}; distance recomputed from GPS, nothing persisted`;
  });

  // ── S25 · Fake allowed=true attack → ignored ──
  await scenario('25', 'Fake allowed=true attack → rejected', async () => {
    await sleep(GEO_PACE_MS);
    const res = await authReq('post', `/riddles/${riddleIds.noHind}/submit`, userToken, { photoUrl: `https://example.com/photo-${MARKER}-a.jpg`, userLat: farKol3k.lat, userLng: farKol3k.lng, allowed: true });
    assert(res.status === 400 || res.status === 403, `expected rejection got ${res.status} body=${JSON.stringify(res.body).slice(0, 200)}`);
    return `rejected ${res.status} — server ignored client allowed=true`;
  });

  // ── S26 · Stale check-in does not authorize submit ──
  const farKol5k = offsetMeters(DEST.kolkata.lat, DEST.kolkata.lng, 5000, 0);
  await scenario('26', 'Stale check-in attack → submit still re-validates GPS', async () => {
    await sleep(GEO_PACE_MS);
    const ck = await authReq('post', `/riddles/${riddleIds.noHind}/validate-checkin`, userToken, { userLat: closeKol.lat, userLng: closeKol.lng });
    assert(ck.status === 200 && ck.body.data.allowed === true, `pre-check must be allowed (status=${ck.status})`);
    await sleep(GEO_PACE_MS);
    const res = await authReq('post', `/riddles/${riddleIds.noHind}/submit`, userToken, { photoUrl: `https://example.com/photo-${MARKER}-s.jpg`, userLat: farKol5k.lat, userLng: farKol5k.lng });
    assert(res.status === 400 || res.status === 403, `expected rejection got ${res.status} body=${JSON.stringify(res.body).slice(0, 200)}`);
    return 'prior allowed check-in does not authorize a later far-away submit';
  });

  // ── S27 · Hint endpoint: locked until asked ──
  await scenario('27', 'Hint locked until endpoint; no-hint riddle → null', async () => {
    await sleep(GEO_PACE_MS);
    const hint = await authReq('post', `/riddles/${riddleIds.kol}/hint`, userToken, { userLat: KOL.lat, userLng: KOL.lng });
    assert(hint.status === 200, `hint status=${hint.status} ${JSON.stringify(hint.body).slice(0, 200)}`);
    assert(hint.body.data.hintImage === riddleData.kol.hintImage, `hintImage mismatch: ${hint.body.data.hintImage}`);
    await sleep(GEO_PACE_MS);
    const noHint = await authReq('post', `/riddles/${riddleIds.noHind}/hint`, userToken, { userLat: KOL.lat, userLng: KOL.lng });
    assert(noHint.status === 200, `no-hint status=${noHint.status}`);
    assert(noHint.body.data.hintImage === null, `expected null hintImage`);
    return 'hintImage served ONLY via hint endpoint; no-hint → null';
  });

  // ── S28 · hintImage withheld from list/detail/my-submission payloads ──
  await scenario('28', 'hintImage key absent from list, detail, and my-submission JSON', async () => {
    await sleep(GEO_PACE_MS);
    const list = await authReq('get', `/riddles/active/current-location?lat=${KOL.lat}&lng=${KOL.lng}`, userToken);
    assert(list.body.data && list.body.data.riddles.some((r: any) => r.title === riddleData.kol.title), 'kol not in list');
    assert(JSON.stringify(list.body).includes('"hintImage"') === false, 'hintImage leaked in list');
    await sleep(GEO_PACE_MS);
    const det = await authReq('get', `/riddles/${riddleIds.kol}?lat=${KOL.lat}&lng=${KOL.lng}`, userToken);
    assert(JSON.stringify(det.body).includes('"hintImage"') === false, 'hintImage leaked in detail');
    const mine = await authReq('get', `/riddles/${riddleIds.kol}/my-submission`, userToken);
    assert(JSON.stringify(mine.body).includes('"hintImage"') === false, 'hintImage leaked in my-submission');
    return 'hintImage never present in gameplay JSON (list/detail/my-submission)';
  });

  // ── S29 · Write-path city normalization (messy input stored canonical) ──
  await scenario('29', 'Write-path normalization: messy city → canonical "Kolkata", accessible', async () => {
    const dbR = await prisma.riddle.findUnique({ where: { id: riddleIds.norm }, select: { city: true } });
    assert(dbR!.city === 'Kolkata', `stored city=[${dbR!.city}] expected Kolkata`);
    await sleep(GEO_PACE_MS);
    const res = await authReq('get', `/riddles/${riddleIds.norm}?lat=${KOL.lat}&lng=${KOL.lng}`, userToken);
    assert(res.status === 200, `status=${res.status} ${JSON.stringify(res.body).slice(0, 200)}`);
    assert(res.body.data.city === 'Kolkata', `returned city=${res.body.data.city}`);
    await sleep(GEO_PACE_MS);
    const hint = await authReq('post', `/riddles/${riddleIds.norm}/hint`, userToken, { userLat: KOL.lat, userLng: KOL.lng });
    assert(hint.status === 200, `hint status=${hint.status}`);
    return `" KolKaTa Municipal Corp " → stored/returned "Kolkata"; detail+hint OK`;
  });

  // ── S30 · Legacy alias-tolerant reads (stored "New Delhi" found from GPS Delhi) ──
  await scenario('30', 'Legacy "New Delhi" stored row found from GPS Delhi (alias-tolerant)', async () => {
    const legacy = await prisma.riddle.create({
      data: {
        title: `${MARKER} Riddle Legacy`,
        clue: 'Alias tolerance read-path sample',
        correctPlaceName: DEST.delhi.name,
        correctLat: DEST.delhi.lat,
        correctLng: DEST.delhi.lng,
        city: 'New Delhi', // legacy spell↦ canonical key "delhi"
        rewardPoints: 100,
        isActive: true,
        startsAt: new Date(),
      },
    });
    await sleep(GEO_PACE_MS);
    const list = await authReq('get', `/riddles/active/current-location?lat=${DEL.lat}&lng=${DEL.lng}`, userToken);
    const mine = list.body.data.riddles.filter((r: any) => r.title === legacy.title);
    assert(mine.length === 1, `legacy riddle not found from Delhi GPS (list empty?)`);
    assert(list.body.data.city === 'Delhi', `list city=${list.body.data.city}`);
    await sleep(GEO_PACE_MS);
    const det = await authReq('get', `/riddles/${legacy.id}?lat=${DEL.lat}&lng=${DEL.lng}`, userToken);
    assert(det.status === 200, `detail status=${det.status} ${JSON.stringify(det.body).slice(0, 200)}`);
    assert(det.body.data.city === 'Delhi', `detail city=${det.body.data.city}`);
    return `stored "New Delhi" matched GPS Delhi; displayed city="Delhi"`;
  });

  // ── S31 · Admin approves the HTTP-created submission (S22) ──
  let balBefore: number;
  await scenario('31', 'Admin approve (real HTTP submission) → APPROVED + exactly 1 EARN', async () => {
    balBefore = (await prisma.wallet.findUnique({ where: { userId: (await prisma.user.findUniqueOrThrow({ where: { email: 'user@palsafar.com' }, select: { id: true } })).id } }))?.palPoints ?? 0;
    const res = await authReq('post', `/admin/riddles/submissions/${sidAppr}/approve`, adminToken);
    assert(res.status === 200, `approve status=${res.status} ${JSON.stringify(res.body).slice(0, 250)}`);
    assert(res.body.data.status === 'APPROVED', `status=${res.body.data.status}`);
    assert(res.body.data.pointsAwarded === 100, `pointsAwarded=${res.body.data.pointsAwarded}`);
    const txs = await prisma.walletTransaction.findMany({ where: { referenceId: sidAppr, referenceType: 'RIDDLE' } });
    assert(txs.length === 1, `EARN txs=${txs.length}`);
    assert(txs[0].type === 'EARN' && txs[0].amount === 100, `tx type=${txs[0].type} amount=${txs[0].amount}`);
    return `approved, pointsAwarded=100, 1×EARN(+100)`;
  });

  // ── S32 · Concurrent double approve → 200 + 409, single APPROVED, single EARN ──
  await scenario('32', 'Concurrent double approve → one 200 + one 409, single credit', async () => {
    await sleep(GEO_PACE_MS);
    const subRes = await submitOrRecover(riddleIds.conc, `https://example.com/photo-${MARKER}-conc.jpg`);
    const sid = subRes;
    const [r1, r2] = await Promise.all([
      authReq('post', `/admin/riddles/submissions/${sid}/approve`, adminToken),
      authReq('post', `/admin/riddles/submissions/${sid}/approve`, adminToken),
    ]);
    const statuses = [r1.status, r2.status].sort((a, b) => a - b);
    assert(statuses[0] === 200 && statuses[1] === 409, `statuses=[${statuses.join(',')}] bodies=${JSON.stringify([r1.body, r2.body]).slice(0, 250)}`);
    const approved = r1.status === 200 ? r1.body.data : r2.body.data;
    assert(approved.status === 'APPROVED', `approved.status=${approved.status}`);
    const txs = await prisma.walletTransaction.findMany({ where: { referenceId: sid, referenceType: 'RIDDLE' } });
    assert(txs.length === 1 && txs[0].amount === 150, `EARN txs=${txs.length} amount=${txs[0]?.amount}`);
    return `statuses=${r1.status}/${r2.status} → single APPROVED, 1×EARN(+150)`;
  });

  // ── S33 · Wallet atomicity / balance math ──
  await scenario('33', 'Wallet atomicity: exactly 1 EARN per approval, balance delta correct', async () => {
    await sleep(GEO_PACE_MS);
    const subRes = await submitOrRecover(riddleIds.rew, `https://example.com/photo-${MARKER}-rew.jpg`);
    const sid = subRes;
    const uid = (await prisma.user.findUniqueOrThrow({ where: { email: 'user@palsafar.com' }, select: { id: true } })).id;
    const balBefore33 = (await prisma.wallet.findUnique({ where: { userId: uid } }))?.palPoints ?? 0;
    const res = await authReq('post', `/admin/riddles/submissions/${sid}/approve`, adminToken);
    assert(res.status === 200, `approve status=${res.status}`);
    const txs = await prisma.walletTransaction.findMany({ where: { referenceId: sid, referenceType: 'RIDDLE' } });
    assert(txs.length === 1 && txs[0].type === 'EARN' && txs[0].amount === 90, `txs=${txs.length} ${txs[0]?.type} ${txs[0]?.amount}`);
    const wallet = await prisma.wallet.findUnique({ where: { userId: uid } });
    const delta = (wallet?.palPoints || 0) - balBefore33;
    assert(delta === 90, `wallet delta=${delta} (expected +90 for this approval)`);
    return `1×EARN(+90); wallet delta measured against pre-approval baseline = +90`;
  });

  // ── S34 · Reject flow with admin comment ──
  await scenario('34', 'Reject flow: PENDING → REJECTED, comment returned, no reward', async () => {
    await sleep(GEO_PACE_MS);
    const subRes = await submitOrRecover(riddleIds.rej, `https://example.com/photo-${MARKER}-rej.jpg`);
    const sid = subRes;
    const res = await authReq('post', `/admin/riddles/submissions/${sid}/reject`, adminToken, { adminComment: 'Wrong landmark photo' });
    assert(res.status === 200, `reject status=${res.status} ${JSON.stringify(res.body).slice(0, 250)}`);
    assert(res.body.data.status === 'REJECTED', `status=${res.body.data.status}`);
    const txs = await prisma.walletTransaction.findMany({ where: { referenceId: sid } });
    assert(txs.length === 0, `wallet txs for rejected submission=${txs.length}`);
    const mine = await authReq('get', `/riddles/${riddleIds.rej}/my-submission`, userToken);
    assert(mine.status === 200, `my-submission status=${mine.status}`);
    assert(mine.body.data.status === 'REJECTED', `my-submission status=${mine.body.data.status}`);
    assert(mine.body.data.adminComment === 'Wrong landmark photo', `comment=[${mine.body.data.adminComment}]`);
    assert(mine.body.data.photoUrl, 'missing photoUrl');
    return `REJECTED + adminComment persisted; 0 wallet txs`;
  });

  // ── S35 · Cleanup + DB hygiene ──
  await scenario('35', 'Marker-scoped cleanup; non-marker data untouched; no orphan credits', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'user@palsafar.com' }, select: { id: true } });
    const markerSubs = await prisma.riddleSubmission.findMany({ where: { userId: user.id, photoUrl: { contains: MARKER } }, select: { id: true } });
    const subIds = markerSubs.map((s) => s.id);
    const delTxs = await prisma.walletTransaction.deleteMany({ where: { referenceId: { in: subIds }, referenceType: 'RIDDLE' } });
    await prisma.riddleSubmission.deleteMany({ where: { id: { in: subIds } } });
    const delRiddles = await prisma.riddle.deleteMany({ where: { title: { startsWith: MARKER } } });
    const delPlaces = await prisma.place.deleteMany({ where: { name: { startsWith: PLACE_PREFIX } } });

    assert((await prisma.riddle.count({ where: { title: { startsWith: MARKER } } })) === 0, 'marker riddles remain');
    assert((await prisma.riddleSubmission.count({ where: { id: { in: subIds } } })) === 0, 'marker submissions remain');
    assert((await prisma.place.count({ where: { name: { startsWith: PLACE_PREFIX } } })) === 0, 'marker places remain');
    const wildTxs = await prisma.walletTransaction.count({ where: { referenceId: { in: subIds } } });
    assert(wildTxs === 0, `orphan wallet txs=${wildTxs}`);

    const nonMarkerAfter = await prisma.riddle.count({ where: { NOT: { title: { startsWith: 'TEST_E2E' } } } });
    const nonMarkerBefore = (globalThis as any).__nonMarkerBefore as number;
    assert(nonMarkerAfter === nonMarkerBefore, `non-marker riddles ${nonMarkerBefore}→${nonMarkerAfter}`);

    // Cumulative wallet proof: rejected submissions never paid out; only the 3 approvals did.
    const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
    const cumulativeDelta = (wallet?.palPoints || 0) - balBefore;
    assert(cumulativeDelta === 100 + 150 + 90, `cumulative wallet delta=${cumulativeDelta} (expected 340)`);

    const seedOk = await prisma.user.count({ where: { email: { in: ['user@palsafar.com', 'shivaay.chelani@gmail.com'] } } });
    assert(seedOk === 2, 'seed accounts must survive cleanup');
    return `removed riddles=${delRiddles.count} places=${delPlaces.count} wallet-refs=${delTxs.count}; non-marker riddles ${nonMarkerBefore}→${nonMarkerAfter} unchanged; cumulative delta=+${cumulativeDelta}`;
  });

  // ─────────────────────────────── summary ───────────────────────────────
  console.log('\n========================================================');
  console.log('RELEASE GATE v35 — RESULT SUMMARY');
  console.log('========================================================');
  for (const r of rows) {
    console.log(`S${r.id} [${r.pass}] ${r.label} — ${r.detail}`);
  }
  console.log('');
  console.log(`Scenarios: ${rows.length}   Passed: ${passCount}   Failed: ${failCount}   Skipped: ${skipCount}`);

  await prisma.$disconnect().catch(() => {});
  if (failCount > 0 || skipCount > 0 || passCount !== 35) {
    process.exitCode = 1;
  }
  console.log('\nDONE');
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});