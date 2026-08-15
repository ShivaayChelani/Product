/**
 * PHASE 2 — Reverse-geocode PILOT (dry-run), hardened for Nominatim 429s.
 * Bounded stratified sample (~200) of active rows missing `city`.
 * Proposes city/state/district/country via OSM Nominatim. NO WRITES.
 * QA: agreement of proposed `state` vs existing `state`.
 *
 * Usage:
 *   ts-node scripts/phase2_reverse_geocode_pilot.ts [--limit=200] [--spacing=2500] [--probe]
 * Progress is checkpointed to reports/phase2-pilot.progress.jsonl (resume-safe).
 */
import fs from 'fs';
import path from 'path';
import { prisma } from '../src/config/database';
import { pipelineFetch } from './lib/pipeline-reliability/http-agent';

const USER_AGENT = 'PalSafar-FactualEnrichment/1.0 (https://palsafar.com; ops@palsafar.local)';

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

interface ReverseResult {
  ok: boolean;
  attempts: number;
  city?: string;
  village?: string;
  district?: string;
  state?: string;
  country?: string;
  postcode?: string;
  fullAddress?: string;
  sourceUri?: string;
  lastError?: string;
}

async function reverseWithRetry(
  lat: number,
  lng: number,
  opts: { spacingMs: number; timeoutMs: number },
): Promise<ReverseResult> {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
    format: 'jsonv2',
    addressdetails: '1',
    zoom: '10',
  });
  const url = `https://nominatim.openstreetmap.org/reverse?${params}`;
  const backoffs = [5_000, 20_000, 60_000, 180_000];
  let attempts = 0;

  for (;;) {
    attempts++;
    await rateLimit(opts.spacingMs);
    let res: Response;
    try {
      res = await pipelineFetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        timeoutMs: opts.timeoutMs,
      });
    } catch (e: any) {
      if (attempts > backoffs.length) {
        return { ok: false, attempts, lastError: `fetch: ${e?.message || e}` };
      }
      await sleep(backoffs[attempts - 1]);
      continue;
    }

    try {
      if (res.ok) {
        const json = (await res.json()) as { display_name?: string; address?: Record<string, string> };
        const addr = json.address || {};
        return {
          ok: true,
          attempts,
          city: addr.city || addr.town || addr.village || addr.hamlet || addr.suburb || addr.county,
          village: addr.village || addr.hamlet || addr.suburb,
          district: addr.state_district || addr.district || addr.county,
          state: addr.state,
          country: addr.country,
          postcode: addr.postcode,
          fullAddress: json.display_name,
          sourceUri: url,
        };
      }
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after') || '0') * 1000;
        if (attempts > backoffs.length) {
          return { ok: false, attempts, lastError: `HTTP 429 after ${attempts} attempts` };
        }
        const waitMs = Math.max(retryAfter, backoffs[attempts - 1]);
        console.log(`    429 → waiting ${Math.round(waitMs / 1000)}s (attempt ${attempts})`);
        await sleep(waitMs);
        continue;
      }
      if (res.status >= 500) {
        if (attempts > backoffs.length) {
          return { ok: false, attempts, lastError: `HTTP ${res.status} after ${attempts} attempts` };
        }
        await sleep(backoffs[attempts - 1]);
        continue;
      }
      return { ok: false, attempts, lastError: `HTTP ${res.status}` };
    } finally {
      await res.body?.cancel?.().catch(() => undefined);
    }
  }
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

function norm(s?: string | null): string {
  return (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeState(s?: string | null): string {
  const n = norm(s);
  const map: Record<string, string> = {
    'uttara kannada': 'karnataka', 'bangalore urban': 'karnataka',
    'andaman & nicobar islands': 'andaman and nicobar islands',
    'andaman and nicobar island': 'andaman and nicobar islands',
    'dadra and nagar haveli and daman and diu': 'dadra and nagar haveli and daman and diu',
    'jammu & kashmir': 'jammu and kashmir', 'jammu and kashmir (ut)': 'jammu and kashmir',
    'delhi ncr': 'delhi', 'new delhi': 'delhi', 'national capital territory of delhi': 'delhi',
    'pondicherry': 'puducherry', 'tamilnadu': 'tamil nadu', 'telengana': 'telangana',
    'uttaranchal': 'uttarakhand', 'orissa': 'odisha',
  };
  return map[n] || n;
}

function stateMatch(a?: string | null, b?: string | null): boolean | null {
  const na = normalizeState(a);
  const nb = normalizeState(b);
  if (!na || !nb) return null;
  return na === nb;
}

function arg(name: string, def: string): string {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] || def;
}

async function main() {
  const limit = Number(arg('limit', '200'));
  const spacingMs = Number(arg('spacing', '2500'));
  const probe = process.argv.includes('--probe');
  const base = path.resolve('reports/phase2-pilot');
  const progressFile = base + '.progress.jsonl';
  const outMd = base + '.md';
  const outJson = base + '.json';

  if (probe) {
    console.log('Probe: 3 requests to Nominatim...');
    for (const [lat, lng] of [[28.61, 77.2], [19.07, 72.87], [13.08, 80.27]]) {
      const r = await reverseWithRetry(lat, lng, { spacingMs, timeoutMs: 20_000 });
      console.log(`  (${lat}, ${lng}) → ok=${r.ok} attempts=${r.attempts} city=${r.city} state=${r.state}${r.lastError ? ` ERR=${r.lastError}` : ''}`);
    }
    process.exit(0);
  }

  const rows = await prisma.$queryRaw<PlaceRow[]>`
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
    FROM ranked WHERE rn <= 6
    ORDER BY random()
    LIMIT ${limit}
  `;

  console.log(`Pilot sample: ${rows.length} places (limit ${limit}, spacing ${spacingMs}ms)`);

  const done = new Set<string>();
  const results: any[] = [];
  if (fs.existsSync(progressFile)) {
    for (const line of fs.readFileSync(progressFile, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const rec = JSON.parse(line);
        done.add(rec.placeId);
        results.push(rec);
      } catch {
        /* skip corrupt line */
      }
    }
    console.log(`Resumed: ${done.size} already processed (${rows.length - done.size} remaining)`);
  }

  let failures = 0;
  let stateAgree = 0;
  let stateCheck = 0;
  const append = fs.createWriteStream(progressFile, { flags: 'a' });

  for (const row of rows) {
    if (done.has(row.id)) continue;
    const geo = await reverseWithRetry(row.latitude, row.longitude, { spacingMs, timeoutMs: 25_000 });

    if (!geo.ok) {
      failures++;
      const rec = { placeId: row.id, name: row.name, category: row.category, status: 'ERROR', attempts: geo.attempts, lastError: geo.lastError };
      results.push(rec);
      append.write(JSON.stringify(rec) + '\n');
      continue;
    }

    const existing = { city: row.city, state: row.state, district: row.district, country: row.country };
    const proposed = { city: geo.city || '', state: geo.state || '', district: geo.district || '', country: geo.country || '' };
    const wouldFill = {
      city: !norm(row.city) && norm(proposed.city) ? proposed.city : null,
      state: !norm(row.state) && norm(proposed.state) ? proposed.state : null,
      district: !norm(row.district) && norm(proposed.district) ? proposed.district : null,
      country: !norm(row.country) && norm(proposed.country) ? proposed.country : null,
    };
    const agree = stateMatch(row.state, proposed.state);
    if (agree === true) stateAgree++;
    if (agree !== null) stateCheck++;

    const rec = {
      placeId: row.id,
      name: row.name,
      category: row.category,
      lat: row.latitude,
      lng: row.longitude,
      attempts: geo.attempts,
      existing,
      proposed,
      wouldFill,
      stateMatchesExisting: agree,
      fullAddress: geo.fullAddress || '',
      sourceUri: geo.sourceUri || '',
    };
    results.push(rec);
    append.write(JSON.stringify(rec) + '\n');

    if (results.length % 25 === 0) {
      console.log(`  processed ${results.length}/${rows.length} (failures ${failures})`);
    }
  }
  append.end();

  const fillCounts = results.reduce(
    (acc: any, r) => {
      if (r.wouldFill?.city) acc.city++;
      if (r.wouldFill?.state) acc.state++;
      if (r.wouldFill?.district) acc.district++;
      if (r.wouldFill?.country) acc.country++;
      return acc;
    },
    { city: 0, state: 0, district: 0, country: 0 },
  );

  const okResults = results.filter((r) => r.status !== 'ERROR');
  const summary = {
    generatedAt: new Date().toISOString(),
    sampleSize: rows.length,
    geocodeFailures: failures,
    fillsProposed: fillCounts,
    stateAgreement: stateCheck > 0 ? { checked: stateCheck, agree: stateAgree, rate: (stateAgree / stateCheck) * 100 } : null,
    proposedStateDistribution: await proposedStateDist(okResults),
    note: 'DRY-RUN — no database writes performed.',
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
    const s = normalizeState(r.proposed.state) || r.proposed.state;
    m.set(s, (m.get(s) || 0) + 1);
  }
  return [...m.entries()].map(([state, count]) => ({ state, count })).sort((a, b) => b.count - a.count);
}

function buildMarkdown(summary: any, results: any[]): string {
  const L: string[] = [];
  L.push('# Phase 2 — Reverse-Geocode Pilot (DRY-RUN)');
  L.push('');
  L.push(`Generated: ${summary.generatedAt}`);
  L.push('');
  L.push('## Summary');
  L.push('');
  L.push('| Metric | Value |');
  L.push('|--------|------:|');
  L.push(`| Sample size | ${summary.sampleSize} |`);
  L.push(`| Geocode failures | ${summary.geocodeFailures} |`);
  L.push(`| Fills proposed — city | ${summary.fillsProposed.city} |`);
  L.push(`| Fills proposed — state | ${summary.fillsProposed.state} |`);
  L.push(`| Fills proposed — district | ${summary.fillsProposed.district} |`);
  L.push(`| Fills proposed — country | ${summary.fillsProposed.country} |`);
  if (summary.stateAgreement) {
    L.push(`| State agreement (proposed vs existing) | ${summary.stateAgreement.agree}/${summary.stateAgreement.checked} (${summary.stateAgreement.rate.toFixed(1)}%) |`);
  }
  L.push(`| Writes performed | 0 (dry-run) |`);
  L.push('');
  L.push('## Proposed state distribution');
  L.push('');
  L.push('| State | Places |');
  L.push('|-------|-------:|');
  for (const s of summary.proposedStateDistribution) L.push(`| ${s.state} | ${s.count} |`);
  L.push('');
  L.push('## Detail');
  L.push('');
  L.push('| Place | Existing city | → Proposed city | Existing state | → Proposed state | District fill | Country | State match |');
  L.push('|-------|--------------|-----------------|----------------|------------------|---------------|----------|-------------|');
  for (const r of results) {
    if (r.status === 'ERROR') {
      L.push(`| ${r.name} (\`${r.placeId}\`) | ERROR (${r.attempts} tries: ${r.lastError}) | | | | | |`);
      continue;
    }
    const agree = r.stateMatchesExisting === null ? 'n/a' : r.stateMatchesExisting ? 'yes' : 'NO';
    L.push(
      `| ${r.name} | ${r.existing.city || '—'} | ${r.wouldFill.city || (r.existing.city || '—')} | ` +
      `${r.existing.state || '—'} | ${r.wouldFill.state || r.existing.state || '—'} | ` +
      `${r.wouldFill.district || '—'} | ${r.wouldFill.country || r.existing.country || '—'} | ${agree} |`,
    );
  }
  L.push('');
  L.push('## Notes');
  L.push('- Nominatim (OSM) reverse geocode, zoom=10, rate-limited (default 2.5s spacing), 429-aware backoff.');
  L.push('- Proposals only fill EMPTY fields; verified existing values are never overwritten.');
  return L.join('\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());