/**
 * PHASE 2 — Reverse-geocode PILOT via BigDataCloud (free, OSM-derived). DRY-RUN (no DB writes).
 *
 * Two cohorts:
 *  - geocode set (default 500): active places missing `city` → propose city/state/district/country.
 *  - validation set (default 250): active places WITH existing city+state → compare geocoder vs DB.
 *
 * Metrics: city accuracy, state accuracy, district accuracy, failure rate.
 * Checkpoint/resume via reports/phase2-pilot-bdc.progress.jsonl.
 *
 * Usage:
 *   ts-node scripts/phase2_geocode_pilot_bigdatacloud.ts [--limit=500] [--validate=250]
 *          [--spacing=1500] [--out=reports/phase2-pilot-bdc]
 */
import fs from 'fs';
import path from 'path';
import { prisma } from '../src/config/database';
import { pipelineFetch } from './lib/pipeline-reliability/http-agent';

const USER_AGENT = 'PalSafar-FactualEnrichment/1.0 (https://palsafar.com; ops@palsafar.local)';
const ENDPOINT = 'https://api.bigdatacloud.net/data/reverse-geocode-client';

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

let lastAt = 0;

async function rateLimit(spacingMs: number) {
  const now = Date.now();
  const wait = Math.max(0, spacingMs - (now - lastAt));
  if (wait > 0) await sleep(wait);
  lastAt = Date.now();
}

interface GeoOut {
  ok: boolean;
  attempts: number;
  city: string;
  state: string;
  stateCode: string;
  district: string;
  country: string;
  postcode: string;
  lastError?: string;
}

async function reverseGeocode(lat: number, lng: number, opts: { spacingMs: number }): Promise<GeoOut> {
  const url = `${ENDPOINT}?latitude=${lat}&longitude=${lng}&localityLanguage=en`;
  const backoffs = [3_000, 10_000, 30_000, 90_000];
  let attempts = 0;

  for (;;) {
    attempts++;
    await rateLimit(opts.spacingMs);
    let res: Response;
    try {
      res = await pipelineFetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        timeoutMs: 25_000,
      });
    } catch (e: any) {
      if (attempts > backoffs.length) return { ok: false, attempts, city: '', state: '', stateCode: '', district: '', country: '', postcode: '', lastError: `fetch: ${e?.message || e}` };
      await sleep(backoffs[attempts - 1]);
      continue;
    }

    try {
      if (res.ok) {
        const j = (await res.json()) as any;
        let district = '';
        if (Array.isArray(j?.localityInfo?.administrative)) {
          const d5 = j.localityInfo.administrative.find((a: any) => a.adminLevel === 5);
          if (d5?.name) district = String(d5.name).replace(/\s+district$/i, '');
        }
        return {
          ok: true,
          attempts,
          city: j.city || j.locality || '',
          state: j.principalSubdivision || '',
          stateCode: j.principalSubdivisionCode || '',
          district,
          country: j.countryName || '',
          postcode: j.postcode || '',
        };
      }
      if (res.status === 429 || res.status === 403) {
        const retryAfter = Number(res.headers.get('retry-after') || '0') * 1000;
        if (attempts > backoffs.length) return { ok: false, attempts, city: '', state: '', stateCode: '', district: '', country: '', postcode: '', lastError: `HTTP ${res.status} after ${attempts} attempts` };
        const waitMs = Math.max(retryAfter, backoffs[attempts - 1]);
        console.log(`    HTTP ${res.status} → waiting ${Math.round(waitMs / 1000)}s (attempt ${attempts})`);
        await sleep(waitMs);
        continue;
      }
      if (res.status >= 500) {
        if (attempts > backoffs.length) return { ok: false, attempts, city: '', state: '', stateCode: '', district: '', country: '', postcode: '', lastError: `HTTP ${res.status} after ${attempts} attempts` };
        await sleep(backoffs[attempts - 1]);
        continue;
      }
      return { ok: false, attempts, city: '', state: '', stateCode: '', district: '', country: '', postcode: '', lastError: `HTTP ${res.status}` };
    } finally {
      await res.body?.cancel?.().catch(() => undefined);
    }
  }
}

function norm(s?: string | null): string {
  return (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

const CITY_ALIAS: Record<string, string> = {
  bangalore: 'bengaluru', 'bangalore urban': 'bengaluru', banglore: 'bengaluru',
  bombay: 'mumbai', calcutta: 'kolkata', madras: 'chennai',
  pondicherry: 'puducherry', mysore: 'mysuru', cochin: 'kochi', trichy: 'tiruchirappalli',
  trivandrum: 'thiruvananthapuram', 'new delhi': 'delhi', 'delhi ncr': 'delhi',
  'madurai m corp': 'madurai', 'hyderabad m corp': 'hyderabad', 'pune m corp': 'pune',
  'salem m corp': 'salem', 'vijayawada m corp': 'vijayawada', 'warangal m corp': 'warangal',
  'kota m corp': 'kota', 'udaipur m corp': 'udaipur', 'meerut m corp': 'meerut',
  'gwalior m corp': 'gwalior', 'jabalpur m corp': 'jabalpur', 'tumakuru': 'tumkur',
};

function cityAlias(n: string): string {
  return CITY_ALIAS[n] || n;
}

const STATE_ALIAS: Record<string, string> = {
  'uttara kannada': 'karnataka', 'bangalore urban': 'karnataka',
  'andaman & nicobar islands': 'andaman and nicobar islands',
  'andaman and nicobar island': 'andaman and nicobar islands',
  'dadra and nagar haveli and daman and diu': 'dadra and nagar haveli and daman and diu',
  'jammu & kashmir': 'jammu and kashmir', 'jammu and kashmir (ut)': 'jammu and kashmir',
  'delhi ncr': 'delhi', 'new delhi': 'delhi', 'national capital territory of delhi': 'delhi',
  'pondicherry': 'puducherry', 'tamilnadu': 'tamil nadu', 'telengana': 'telangana',
  'uttaranchal': 'uttarakhand', 'orissa': 'odisha',
  'andhra pradesh (new)': 'andhra pradesh',
};

function stateAlias(n: string): string {
  return STATE_ALIAS[n] || n;
}

function cityMatch(dbCity: string, geoCity: string): 'exact' | 'alias' | 'substring' | 'none' {
  const d = norm(dbCity);
  const g = norm(geoCity);
  if (!d || !g) return 'none';
  if (d === g) return 'exact';
  if (cityAlias(d) === cityAlias(g)) return 'alias';
  if (d.includes(g) || g.includes(d)) return 'substring';
  return 'none';
}

function stateMatch(dbState: string, geoState: string): boolean {
  const d = stateAlias(norm(dbState));
  const g = stateAlias(norm(geoState));
  if (!d || !g) return false;
  return d === g;
}

function districtMatch(dbDistrict: string, geoDistrict: string): boolean {
  const d = norm(dbDistrict);
  const g = norm(geoDistrict);
  if (!d || !g) return false;
  return d === g || d.includes(g) || g.includes(d);
}

function arg(name: string, def: string): string {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] || def;
}

interface PlaceRow {
  id: string;
  name: string;
  category: string;
  latitude: number;
  longitude: number;
  city: string;
  state: string;
  district: string;
  country: string;
}

async function main() {
  const limit = Number(arg('limit', '500'));
  const validate = Number(arg('validate', '250'));
  const spacingMs = Number(arg('spacing', '1500'));
  const base = path.resolve(arg('out', 'reports/phase2-pilot-bdc'));
  const progressFile = base + '.progress.jsonl';
  const outMd = base + '.md';
  const outJson = base + '.json';

  console.log(`Phase 2 pilot: geocode=${limit}, validate=${validate}, spacing=${spacingMs}ms`);

  const geocodeRows = await prisma.$queryRaw<PlaceRow[]>`
    WITH ranked AS (
      SELECT id, name, category, latitude, longitude,
             COALESCE(city, '') AS city, COALESCE(state, '') AS state,
             COALESCE(district, '') AS district, COALESCE(country, '') AS country,
             ROW_NUMBER() OVER (PARTITION BY COALESCE(state, '') ORDER BY random()) AS rn
      FROM public.places
      WHERE merged_into_id IS NULL
        AND latitude IS NOT NULL AND longitude IS NOT NULL
        AND (city IS NULL OR TRIM(city) = '')
    )
    SELECT id, name, category, latitude, longitude, city, state, district, country
    FROM ranked WHERE rn <= 15 ORDER BY random() LIMIT ${limit}
  `;

  const validateRows = await prisma.$queryRaw<PlaceRow[]>`
    WITH ranked AS (
      SELECT id, name, category, latitude, longitude,
             COALESCE(city, '') AS city, COALESCE(state, '') AS state,
             COALESCE(district, '') AS district, COALESCE(country, '') AS country,
             ROW_NUMBER() OVER (PARTITION BY COALESCE(state, '') ORDER BY random()) AS rn
      FROM public.places
      WHERE merged_into_id IS NULL
        AND latitude IS NOT NULL AND longitude IS NOT NULL
        AND TRIM(city) <> '' AND TRIM(state) <> ''
    )
    SELECT id, name, category, latitude, longitude, city, state, district, country
    FROM ranked WHERE rn <= 8 ORDER BY random() LIMIT ${validate}
  `;

  console.log(`geocode rows: ${geocodeRows.length}, validate rows: ${validateRows.length}`);

  const done = new Set<string>();
  const results: any[] = [];
  if (fs.existsSync(progressFile)) {
    for (const line of fs.readFileSync(progressFile, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const rec = JSON.parse(line);
        done.add(`${rec.kind}:${rec.placeId}`);
        results.push(rec);
      } catch {
        /* ignore */
      }
    }
    console.log(`Resumed ${done.size} already-processed rows`);
  }

  const append = fs.createWriteStream(progressFile, { flags: 'a' });
  let failures = 0;

  const processOne = async (row: PlaceRow, kind: 'geo' | 'val') => {
    if (done.has(`${kind}:${row.id}`)) return;
    const g = await reverseGeocode(row.latitude, row.longitude, { spacingMs });

    let rec: any;
    if (!g.ok) {
      failures++;
      rec = { kind, placeId: row.id, name: row.name, status: 'ERROR', attempts: g.attempts, lastError: g.lastError };
    } else if (kind === 'geo') {
      const existing = { city: row.city, state: row.state, district: row.district, country: row.country };
      const wouldFill = {
        city: !norm(row.city) && norm(g.city) ? g.city : null,
        state: !norm(row.state) && norm(g.state) ? g.state : null,
        district: !norm(row.district) && norm(g.district) ? g.district : null,
        country: !norm(row.country) && norm(g.country) ? g.country : null,
      };
      rec = {
        kind, placeId: row.id, name: row.name, category: row.category, lat: row.latitude, lng: row.longitude,
        attempts: g.attempts, existing, proposed: { city: g.city, state: g.state, stateCode: g.stateCode, district: g.district, country: g.country },
        wouldFill, stateMatchesExisting: row.state ? stateMatch(row.state, g.state) : null,
      };
    } else {
      rec = {
        kind, placeId: row.id, name: row.name, category: row.category, lat: row.latitude, lng: row.longitude,
        attempts: g.attempts,
        dbCity: row.city, dbState: row.state, dbDistrict: row.district,
        geoCity: g.city, geoState: g.state, geoStateCode: g.stateCode, geoDistrict: g.district, geoCountry: g.country,
        cityMatch: cityMatch(row.city, g.city),
        stateMatch: stateMatch(row.state, g.state),
        districtMatch: row.district ? districtMatch(row.district, g.district) : null,
      };
    }

    results.push(rec);
    append.write(JSON.stringify(rec) + '\n');
    done.add(`${kind}:${row.id}`);
  };

  for (const row of geocodeRows) await processOne(row, 'geo');
  for (const row of validateRows) await processOne(row, 'val');
  append.end();

  const valRows = results.filter((r) => r.kind === 'val' && r.status !== 'ERROR');
  const geoRows = results.filter((r) => r.kind === 'geo' && r.status !== 'ERROR');
  const valErrors = results.filter((r) => r.kind === 'val' && r.status === 'ERROR').length;
  const geoErrors = results.filter((r) => r.kind === 'geo' && r.status === 'ERROR').length;

  const count = (rows: any[], p: (r: any) => boolean) => rows.filter(p).length;

  const cityExact = count(valRows, (r) => r.cityMatch === 'exact');
  const cityAliasN = count(valRows, (r) => r.cityMatch === 'alias');
  const citySub = count(valRows, (r) => r.cityMatch === 'substring');
  const cityNone = count(valRows, (r) => r.cityMatch === 'none');
  const stateAgree = count(valRows, (r) => r.stateMatch === true);
  const districtCheck = count(valRows, (r) => r.districtMatch !== null);
  const districtAgree = count(valRows, (r) => r.districtMatch === true);

  const fillCounts = geoRows.reduce(
    (acc: any, r) => {
      if (r.wouldFill?.city) acc.city++;
      if (r.wouldFill?.state) acc.state++;
      if (r.wouldFill?.district) acc.district++;
      if (r.wouldFill?.country) acc.country++;
      return acc;
    },
    { city: 0, state: 0, district: 0, country: 0 },
  );

  const summary = {
    generatedAt: new Date().toISOString(),
    source: 'BigDataCloud reverse-geocode-client (OSM-derived, free, no key)',
    cohorts: { geocodeSize: geocodeRows.length, validationSize: validateRows.length },
    failures: { geocode: geoErrors, validation: valErrors, total: failures },
    failureRate: failures / (geocodeRows.length + validateRows.length),
    validation: {
      city: { checked: valRows.length, exact: cityExact, alias: cityAliasN, substring: citySub, none: cityNone, exactAliasPct: ((cityExact + cityAliasN) / (valRows.length || 1)) * 100, inclSubstringPct: ((cityExact + cityAliasN + citySub) / (valRows.length || 1)) * 100 },
      state: { checked: valRows.length, agree: stateAgree, pct: (stateAgree / (valRows.length || 1)) * 100 },
      district: { checked: districtCheck, agree: districtAgree, pct: districtCheck ? (districtAgree / districtCheck) * 100 : null },
    },
    fillsProposed: fillCounts,
    proposedStateDistribution: await proposedStateDist(geoRows),
    note: 'DRY-RUN — no database writes performed. Provenance would be source=BigDataCloud, sourceType=reverse-geocode.',
  };

  fs.writeFileSync(outMd, buildMarkdown(summary, results));
  fs.writeFileSync(outJson, JSON.stringify({ summary, results }, null, 2));
  console.log('Report written:', outMd);
  console.log(JSON.stringify(summary, null, 2));
}

async function proposedStateDist(results: any[]): Promise<{ state: string; count: number }[]> {
  const m = new Map<string, number>();
  for (const r of results) {
    if (!r.proposed?.state) continue;
    const s = stateAlias(norm(r.proposed.state)) || r.proposed.state;
    m.set(s, (m.get(s) || 0) + 1);
  }
  return [...m.entries()].map(([state, count]) => ({ state, count })).sort((a, b) => b.count - a.count);
}

function buildMarkdown(summary: any, results: any[]): string {
  const L: string[] = [];
  L.push('# Phase 2 — Reverse-Geocode Pilot (BigDataCloud) — DRY-RUN QA Report');
  L.push('');
  L.push(`Generated: ${summary.generatedAt}`);
  L.push(`Source: ${summary.source}`);
  L.push('');
  L.push('## Failure rate');
  L.push('');
  L.push(`| Cohort | Rows | Errors | Rate |`);
  L.push('|--------|-----:|-------:|-----:|');
  L.push(`| Geocode set | ${summary.cohorts.geocodeSize} | ${summary.failures.geocode} | ${((summary.failures.geocode / summary.cohorts.geocodeSize) * 100).toFixed(2)}% |`);
  L.push(`| Validation set | ${summary.cohorts.validationSize} | ${summary.failures.validation} | ${((summary.failures.validation / summary.cohorts.validationSize) * 100).toFixed(2)}% |`);
  L.push('');
  L.push('## Validation accuracy (geocoder vs existing DB values)');
  L.push('');
  const v = summary.validation;
  L.push('| Metric | Checked | Correct | Accuracy |');
  L.push('|--------|--------:|--------:|---------:|');
  L.push(`| City (exact + alias) | ${v.city.checked} | ${v.city.exact + v.city.alias} | ${v.city.exactAliasPct.toFixed(2)}% |`);
  L.push(`| City (incl. substring) | ${v.city.checked} | ${v.city.exact + v.city.alias + v.city.substring} | ${v.city.inclSubstringPct.toFixed(2)}% |`);
  L.push(`| State | ${v.state.checked} | ${v.state.agree} | ${v.state.pct.toFixed(2)}% |`);
  L.push(`| District (where DB value exists) | ${v.district.checked} | ${v.district.agree} | ${v.district.pct?.toFixed(2) ?? 'n/a'}% |`);
  L.push('');
  L.push(`Breakdown (city): exact=${v.city.exact}, alias=${v.city.alias}, substring=${v.city.substring}, none=${v.city.none}`);
  L.push('');
  L.push('## Proposed fills (geocode set — only empty fields would be filled)');
  L.push('');
  L.push('| Field | Would fill |');
  L.push('|-------|-----------:|');
  L.push(`| city | ${summary.fillsProposed.city} |`);
  L.push(`| state | ${summary.fillsProposed.state} |`);
  L.push(`| district | ${summary.fillsProposed.district} |`);
  L.push(`| country | ${summary.fillsProposed.country} |`);
  L.push('');
  L.push('## Proposed state distribution (geocode set)');
  L.push('');
  L.push('| State | Places |');
  L.push('|-------|-------:|');
  for (const s of summary.proposedStateDistribution) L.push(`| ${s.state} | ${s.count} |`);
  L.push('');
  L.push('## City mismatches (validation sample, for human review)');
  L.push('');
  L.push('| Place | DB city | Geocoder city | Match |');
  L.push('|-------|---------|---------------|-------|');
  const noneCity = results.filter((r) => r.kind === 'val' && r.cityMatch === 'none').slice(0, 30);
  for (const r of noneCity) L.push(`| ${r.name} | ${r.dbCity} | ${r.geoCity} | none |`);
  L.push('');
  L.push('## State mismatches (validation sample)');
  L.push('');
  const noneState = results.filter((r) => r.kind === 'val' && r.stateMatch === false).slice(0, 30);
  if (noneState.length === 0) L.push('None.');
  for (const r of noneState) L.push(`- ${r.name}: DB=${r.dbState} vs geo=${r.geoState}`);
  L.push('');
  L.push('## Notes');
  L.push('- Proposals only fill EMPTY fields; existing verified values are never overwritten.');
  L.push('- Provenance to be recorded on apply: source=BigDataCloud, sourceType=reverse-geocode.');
  L.push('- Rate-limited to 1 req/1.5s; 429/403 backoff; checkpoint/resume via progress JSONL.');
  return L.join('\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());