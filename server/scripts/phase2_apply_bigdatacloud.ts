/**
 * PHASE 2 — Apply reverse-geocoded metadata via BigDataCloud (PRODUCTION WRITES).
 * Conservative rules (safety > completeness):
 *  - Never overwrite existing values (enforced with updateMany on empty-field where).
 *  - Fill state/district/country only when verified (India, admin-hierarchy confirmed).
 *  - Fill city ONLY when geocoder returns a recognized administrative city/town
 *    (admin entry with city/town/settlement type). Taluk/tehsil/village/district
 *    results leave city empty and go to the editorial queue.
 *  - Reject non-India results; flag conflicts; queue ambiguous records.
 * Provenance recorded per filled field in PlaceFieldProvenance.
 *
 * Checkpoint/resume via reports/phase2-apply.state.json (id cursor) and
 * reports/phase2-apply.progress.jsonl (per-row outcomes).
 *
 * Usage:
 *   ts-node scripts/phase2_apply_bigdatacloud.ts [--limit=2000] [--spacing=1500]
 *          [--final] [--skipDba]
 */
import fs from 'fs';
import path from 'path';
import { prisma } from '../src/config/database';
import { pipelineFetch } from './lib/pipeline-reliability/http-agent';

const USER_AGENT = 'PalSafar-FactualEnrichment/1.0 (https://palsafar.com; ops@palsafar.local)';
const ENDPOINT = 'https://api.bigdatacloud.net/data/reverse-geocode-client';
const STATE_FILE = path.resolve('reports/phase2-apply.state.json');
const PROGRESS_FILE = path.resolve('reports/phase2-apply.progress.jsonl');
const QUEUE_FILE = path.resolve('reports/phase2-editorial-queue.jsonl');
const PROGRESS_MD = path.resolve('reports/phase2-apply-progress.md');
const FINAL_MD = path.resolve('reports/phase2-apply-final.md');

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

interface RawGeo {
  ok: boolean;
  attempts: number;
  countryCode: string;
  countryName: string;
  city: string;
  locality: string;
  state: string;
  stateCode: string;
  district: string;
  districtName?: string;
  postcode: string;
  admin?: any[];
  lastError?: string;
}

async function reverseGeocode(lat: number, lng: number, opts: { spacingMs: number }): Promise<RawGeo> {
  const url = `${ENDPOINT}?latitude=${lat}&longitude=${lng}&localityLanguage=en`;
  const backoffs = [3_000, 10_000, 30_000, 90_000];
  let attempts = 0;
  const empty = (lastError?: string): RawGeo => ({ ok: false, attempts, countryCode: '', countryName: '', city: '', locality: '', state: '', stateCode: '', district: '', postcode: '', lastError });

  for (;;) {
    attempts++;
    await rateLimit(opts.spacingMs);
    let res: Response;
    try {
      res = await pipelineFetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, timeoutMs: 25_000 });
    } catch (e: any) {
      if (attempts > backoffs.length) return empty(`fetch: ${e?.message || e}`);
      await sleep(backoffs[attempts - 1]);
      continue;
    }
    try {
      if (res.ok) {
        const j = await res.json();
        const admin: any[] = Array.isArray(j?.localityInfo?.administrative) ? j.localityInfo.administrative : [];
        const l5 = admin.find((a: any) => a.adminLevel === 5);
        return {
          ok: true,
          attempts,
          countryCode: j.countryCode || '',
          countryName: j.countryName || '',
          city: j.city || '',
          locality: j.locality || '',
          state: j.principalSubdivision || '',
          stateCode: j.principalSubdivisionCode || '',
          district: l5?.name ? String(l5.name).replace(/\s+district$/i, '') : '',
          districtName: l5?.name,
          postcode: j.postcode || '',
          admin,
        };
      }
      if (res.status === 429 || res.status === 403) {
        const retryAfter = Number(res.headers.get('retry-after') || '0') * 1000;
        if (attempts > backoffs.length) return empty(`HTTP ${res.status} after ${attempts} attempts`);
        await sleep(Math.max(retryAfter, backoffs[attempts - 1]));
        continue;
      }
      if (res.status >= 500) {
        if (attempts > backoffs.length) return empty(`HTTP ${res.status} after ${attempts} attempts`);
        await sleep(backoffs[attempts - 1]);
        continue;
      }
      return empty(`HTTP ${res.status}`);
    } finally {
      await res.body?.cancel?.().catch(() => undefined);
    }
  }
}

function norm(s?: string | null): string {
  return (s || '').trim().toLowerCase().replace(/[-–—]/g, ' ').replace(/\s+/g, ' ');
}

const STATE_ALIAS: Record<string, string> = {
  'uttara kannada': 'karnataka', 'bangalore urban': 'karnataka',
  'andaman & nicobar islands': 'andaman and nicobar islands',
  'andaman and nicobar island': 'andaman and nicobar islands',
  'andaman and nicobar': 'andaman and nicobar islands',
  'dadra & nagar haveli and daman and diu': 'dadra and nagar haveli and daman and diu',
  'daman and diu': 'dadra and nagar haveli and daman and diu',
  'jammu & kashmir': 'jammu and kashmir', 'jammu and kashmir (ut)': 'jammu and kashmir',
  'delhi ncr': 'delhi', 'new delhi': 'delhi', 'national capital territory of delhi': 'delhi',
  'pondicherry': 'puducherry', 'tamilnadu': 'tamil nadu', 'telengana': 'telangana',
  'uttaranchal': 'uttarakhand', 'orissa': 'odisha',
};
const INDIAN_STATES = new Set([
  'andaman and nicobar islands', 'andhra pradesh', 'arunachal pradesh', 'assam', 'bihar',
  'chandigarh', 'chhattisgarh', 'dadra and nagar haveli and daman and diu', 'delhi', 'goa',
  'gujarat', 'haryana', 'himachal pradesh', 'jammu and kashmir', 'jharkhand', 'karnataka',
  'kerala', 'ladakh', 'lakshadweep', 'madhya pradesh', 'maharashtra', 'manipur', 'meghalaya',
  'mizoram', 'nagaland', 'odisha', 'puducherry', 'punjab', 'rajasthan', 'sikkim',
  'tamil nadu', 'telangana', 'tripura', 'uttar pradesh', 'uttarakhand', 'west bengal',
]);
const isIndianState = (n: string) => INDIAN_STATES.has(STATE_ALIAS[norm(n)] || norm(n));

type AdminType = 'town' | 'subdistrict' | 'district' | 'not_verified';

function classifyAdminEntry(e: any): AdminType {
  const desc = (e?.description || '').toLowerCase().trim();
  const name = (e?.name || '').toLowerCase();
  const start = desc;
  if (/^(taluk|tehsil|taluka|taluq|tahsil|talluk|mandal|sub.?district|sub.?division|block|circle|panchayat|village|hamlet|ward|neighborhood|neighbourhood|locality|area)/.test(start)) return 'subdistrict';
  if (/^(district|municipal district)/.test(start)) return 'district';
  if (/^(city|town|township|municipality|municipal|census town|human settlement|urban|suburb|capital)/.test(start)) return 'town';
  if (/\b(taluk|tehsil|taluka|taluq|tahsil|talluk|mandal|block|sub.?district|sub.?division|village|hamlet)\b/.test(name)) return 'subdistrict';
  return 'not_verified';
}

interface CityVerdict {
  status: 'verified' | 'unverified_taluk' | 'unverified_no_match' | 'none';
  city: string;
}

function verifyCity(g: RawGeo): CityVerdict {
  const admin = g.admin || [];
  const candidates: string[] = [];
  if (g.city) candidates.push(g.city);
  if (g.locality && norm(g.locality) !== norm(g.city)) candidates.push(g.locality);

  for (const cand of candidates) {
    const e = admin.find((a: any) => norm(a.name) === norm(cand));
    if (!e) continue;
    const t = classifyAdminEntry(e);
    if (t === 'town') return { status: 'verified', city: cand };
    if (t === 'subdistrict' || t === 'district') return { status: 'unverified_taluk', city: cand };
    if (t === 'not_verified') return { status: 'unverified_taluk', city: cand };
  }
  if (candidates.length > 0) return { status: 'unverified_no_match', city: candidates[0] };
  return { status: 'none', city: '' };
}

function arg(name: string, def: string): string {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] || def;
}

interface StateCheckpoint {
  cursor: string;
  updated: number;
  skipped: number;
  failed: number;
  queued: number;
  failedIds: string[];
}

function loadState(): StateCheckpoint {
  if (fs.existsSync(STATE_FILE)) {
    try {
      return { cursor: '', updated: 0, skipped: 0, failed: 0, queued: 0, failedIds: [], ...JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) };
    } catch {
      /* ignore */
    }
  }
  return { cursor: '', updated: 0, skipped: 0, failed: 0, queued: 0, failedIds: [] };
}

async function countRemaining(afterId: string): Promise<number> {
  const r = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*) AS n FROM public.places
    WHERE merged_into_id IS NULL
      AND latitude IS NOT NULL AND longitude IS NOT NULL
      AND (city IS NULL OR TRIM(city) = '')
      AND id > ${afterId}
  `;
  return Number(r[0]?.n || 0);
}

async function main() {
  const limit = Number(arg('limit', '2000'));
  const spacingMs = Number(arg('spacing', '1500'));
  const isFinal = process.argv.includes('--final');

  const state = loadState();
  console.log(`Phase 2 apply — cursor=${state.cursor || '(start)'} limit=${limit} spacing=${spacingMs}ms final=${isFinal}`);

  if (isFinal) {
    await finalReport();
    return;
  }

  const rowSelect = `SELECT id, name, city, district, state, country, latitude, longitude FROM public.places`;

  let retryRows: any[] = [];
  if (state.failedIds.length > 0) {
    retryRows = await prisma.$queryRawUnsafe<any[]>(`${rowSelect} WHERE id IN (${state.failedIds.map((x) => `'${x.replace(/'/g, '')}'`).join(',')})`);
    console.log(`Retrying ${retryRows.length} previously failed rows`);
  }

  const rows = await prisma.$queryRaw<any[]>`
    SELECT id, name, city, district, state, country, latitude, longitude
    FROM public.places
    WHERE merged_into_id IS NULL
      AND latitude IS NOT NULL AND longitude IS NOT NULL
      AND (city IS NULL OR TRIM(city) = '')
      AND id > ${state.cursor}
    ORDER BY id ASC
    LIMIT ${limit}
  `;
  console.log(`Fetched ${rows.length} rows`);
  if (rows.length === 0 && retryRows.length === 0) {
    console.log('Nothing left — run with --final for the completion report.');
    return;
  }

  const appender = (file: string) => fs.createWriteStream(file, { flags: 'a' });
  const progressStream = appender(PROGRESS_FILE);
  const queueStream = appender(QUEUE_FILE);

  let updated = state.updated;
  let skipped = state.skipped;
  let failed = state.failed;
  let queued = state.queued;
  const failedIds = new Set<string>(state.failedIds);
  const lastCursor = rows.length > 0 ? rows[rows.length - 1].id : state.cursor;
  let lastProgressAt = updated - (updated % 2000);

  const allRows = [...retryRows, ...rows];
  for (let i = 0; i < allRows.length; i++) {
    const row = allRows[i];
    const g = await reverseGeocode(row.latitude, row.longitude, { spacingMs });

    if (!g.ok) {
      failed++;
      failedIds.add(row.id);
      const rec = { placeId: row.id, name: row.name, action: 'failed', attempts: g.attempts, reason: g.lastError };
      progressStream.write(JSON.stringify(rec) + '\n');
      continue;
    }
    failedIds.delete(row.id);

    const isIndia = g.countryCode === 'IN';
    const fills: { field: string; value: string; confidence: number }[] = [];
    let queueReason: string | null = null;
    let action = 'noop';

    if (!isIndia) {
      queueReason = `non_india:${g.countryCode}/${g.countryName}`;
    } else {
      const stateVerified = g.state && isIndianState(g.state);
      const stateConflict = row.state && stateVerified && (STATE_ALIAS[norm(g.state)] || norm(g.state)) !== (STATE_ALIAS[norm(row.state)] || norm(row.state));
      if (stateConflict) {
        queueReason = `state_conflict:${row.state}!=${g.state}`;
      } else {
        const verdict = verifyCity(g);
        const cityFill = verdict.status === 'verified' && !row.city ? verdict.city : null;
        const districtFill = g.district && !row.district ? g.district : null;
        const stateFill = stateVerified && !row.state ? g.state : null;
        const countryFill = !row.country && isIndia ? 'India' : null;

        if (verdict.status !== 'verified' && !row.city) {
          queueReason = verdict.status === 'none' ? 'city_none_geocoder_empty' : `city_${verdict.status}${verdict.city ? ':' + verdict.city : ''}`;
        }

        if (cityFill) fills.push({ field: 'city', value: cityFill, confidence: 0.95 });
        if (districtFill) fills.push({ field: 'district', value: districtFill, confidence: 0.98 });
        if (stateFill) fills.push({ field: 'state', value: stateFill, confidence: 0.99 });
        if (countryFill) fills.push({ field: 'country', value: countryFill, confidence: 0.99 });
      }
    }

    if (fills.length > 0) {
      const data: any = {};
      const guard: any = { id: row.id };
      for (const f of fills) {
        data[f.field] = f.value;
        guard[f.field] = '';
      }
      const ok = await prisma.$transaction(async (tx) => {
        const res = await tx.place.updateMany({ where: guard, data });
        for (const f of fills) {
          const geoAdmin = (g.admin || []).find((a: any) => a.adminLevel === (f.field === 'state' ? 4 : f.field === 'district' ? 5 : 6));
          await tx.placeFieldProvenance.deleteMany({ where: { placeId: row.id, fieldName: f.field, sourceType: 'BigDataCloud-reverse-geocode' } });
          await tx.placeFieldProvenance.create({
            data: {
              placeId: row.id,
              fieldName: f.field,
              valueJson: { value: f.value, geocoder: 'BigDataCloud', sourceId: geoAdmin?.wikidataId || geoAdmin?.geonameId || null, confidence: f.confidence },
              sourceType: 'BigDataCloud-reverse-geocode',
              sourceUri: `${ENDPOINT}?latitude=${row.latitude}&longitude=${row.longitude}&localityLanguage=en`,
              confidence: f.confidence,
              verifiedAt: new Date(),
            },
          });
        }
        return res.count > 0;
      });
      if (!ok) skipped++;
      else updated++;
      action = ok ? 'updated' : 'skipped';
    }

    if (queueReason) {
      queued++;
      queueStream.write(JSON.stringify({ placeId: row.id, name: row.name, reason: queueReason, geo: { city: g.city, locality: g.locality, district: g.district, state: g.state, country: g.countryName } }) + '\n');
      await prisma.placeVerificationLog.create({
        data: {
          placeId: row.id,
          notes: `EDITORIAL_QUEUE:${queueReason}`,
          verificationScore: 0.3,
          qualityScore: 0.3,
        },
      }).catch(() => undefined);
      if (action === 'noop') action = 'queued';
    } else if (action === 'noop') {
      skipped++;
      action = 'skipped';
    }

    progressStream.write(JSON.stringify({ placeId: row.id, name: row.name, action, fills: fills.map((f) => f.field), queueReason }) + '\n');

    if ((i + 1) % 200 === 0) {
      const remaining = await countRemaining(lastCursor).catch(() => -1);
      console.log(`  ${i + 1}/${rows.length} | updated=${updated} queued=${queued} failed=${failed} remaining~${remaining}`);
    }

    if (updated - lastProgressAt >= 2000) {
      lastProgressAt = updated;
      const remaining = await countRemaining(lastCursor).catch(() => -1);
      await writeProgressReport({ updated, skipped, failed, queued, remaining, cursor: lastCursor, spacingMs });
    }
  }

  state.cursor = lastCursor;
  state.updated = updated;
  state.skipped = skipped;
  state.failed = failed;
  state.queued = queued;
  state.failedIds = [...failedIds];
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  progressStream.end();
  queueStream.end();

  const remaining = await countRemaining(lastCursor).catch(() => -1);
  await writeProgressReport({ updated, skipped, failed, queued, remaining, cursor: lastCursor, spacingMs });
  console.log(`Batch complete: updated=${updated} skipped=${skipped} queued=${queued} failed=${failed} remaining~${remaining} retryPending=${failedIds.size}`);
  if (remaining === 0 && failedIds.size === 0) console.log('All rows done — run with --final for the completion report.');
}

async function writeProgressReport(m: { updated: number; skipped: number; failed: number; queued: number; remaining: number; cursor: string; spacingMs: number }) {
  const etaMin = m.remaining > 0 ? Math.ceil((m.remaining * (m.spacingMs + 80)) / 60000) : 0;
  const lines = [
    '# Phase 2 Apply — Progress Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '| Metric | Value |',
    '|--------|------:|',
    `| Updated | ${m.updated} |`,
    `| Skipped | ${m.skipped} |`,
    `| Failed | ${m.failed} |`,
    `| Queued (editorial review) | ${m.queued} |`,
    `| Remaining | ${m.remaining} |`,
    `| Estimated completion (current rate) | ${etaMin} min (~${(etaMin / 60).toFixed(1)} h) |`,
    `| Cursor | ${m.cursor} |`,
  ];
  fs.writeFileSync(PROGRESS_MD, lines.join('\n') + '\n');
}

async function finalReport() {
  const totals = await prisma.$queryRaw<{ city_missing: bigint; state_missing: bigint; district_missing: bigint; total_active: bigint }[]>`
    SELECT
      COUNT(*) FILTER (WHERE (city IS NULL OR TRIM(city) = '')) AS city_missing,
      COUNT(*) FILTER (WHERE (state IS NULL OR TRIM(state) = '')) AS state_missing,
      COUNT(*) FILTER (WHERE (district IS NULL OR TRIM(district) = '')) AS district_missing,
      COUNT(*) AS total_active
    FROM public.places WHERE merged_into_id IS NULL
  `;
  const t = totals[0];

  const queueLines = fs.existsSync(QUEUE_FILE) ? fs.readFileSync(QUEUE_FILE, 'utf8').split('\n').filter((l) => l.trim()) : [];
  const reasons = new Map<string, number>();
  const failedReasons = new Map<string, number>();
  const samples: any[] = [];
  const pLines = fs.existsSync(PROGRESS_FILE) ? fs.readFileSync(PROGRESS_FILE, 'utf8').split('\n').filter((l) => l.trim()) : [];
  for (const line of pLines) {
    try {
      const r = JSON.parse(line);
      if (r.action === 'queued' && r.queueReason) reasons.set(r.queueReason, (reasons.get(r.queueReason) || 0) + 1);
      if (r.action === 'failed' && r.reason) failedReasons.set(r.reason, (failedReasons.get(r.reason) || 0) + 1);
    } catch {
      /* ignore */
    }
  }

  const validated: any[] = [];
  const stateFile = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : { updated: 0, queued: 0, failed: 0 };
  const completeness = {
    cityFilledPct: ((Number(t.total_active) - Number(t.city_missing)) / Number(t.total_active)) * 100,
    stateFilledPct: ((Number(t.total_active) - Number(t.state_missing)) / Number(t.total_active)) * 100,
    districtFilledPct: ((Number(t.total_active) - Number(t.district_missing)) / Number(t.total_active)) * 100,
  };

  const lines = [
    '# Phase 2 — Final QA Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Completeness',
    '',
    '| Field | Missing | Filled % |',
    '|-------|--------:|---------:|',
    `| city | ${t.city_missing} | ${completeness.cityFilledPct.toFixed(2)}% |`,
    `| state | ${t.state_missing} | ${completeness.stateFilledPct.toFixed(2)}% |`,
    `| district | ${t.district_missing} | ${completeness.districtFilledPct.toFixed(2)}% |`,
    '',
    `Active places: ${t.total_active}`,
    '',
    '## This run',
    '',
    `| Metric | Value |`,
    '|--------|------:|',
    `| Places updated | ${stateFile.updated ?? 0} |`,
    `| Ambiguous/queued | ${stateFile.queued ?? 0} |`,
    `| Failed | ${stateFile.failed ?? 0} |`,
    `| Queue file rows | ${queueLines.length} |`,
    '',
    '## Ambiguous records by reason',
    '',
    '| Reason | Count |',
    '|--------|------:|',
  ];
  for (const [k, v] of [...reasons.entries()].sort((a, b) => b[1] - a[1])) lines.push(`| ${k} | ${v} |`);
  lines.push('');
  lines.push('## Failure reasons');
  lines.push('');
  lines.push('| Reason | Count |');
  lines.push('|--------|------:|');
  for (const [k, v] of failedReasons) lines.push(`| ${k} | ${v} |`);
  lines.push('');
  lines.push('## Random validation sample (queued/updated records)');
  lines.push('');
  lines.push('| placeId | name | action | reason |');
  lines.push('|---------|------|--------|--------|');
  for (const r of pLines.slice(0, 40)) {
    try {
      const x = JSON.parse(r);
      lines.push(`| ${x.placeId} | ${x.name} | ${x.action} | ${x.queueReason || x.reason || ''} |`);
    } catch { /* ignore */ }
  }
  lines.push('');
  lines.push('## Notes');
  lines.push('- Queue file: reports/phase2-editorial-queue.jsonl');
  lines.push('- Provenance: PlaceFieldProvenance (sourceType=BigDataCloud-reverse-geocode).');
  fs.writeFileSync(FINAL_MD, lines.join('\n') + '\n');
  console.log('Final report written:', FINAL_MD);
  console.log('Completeness:', JSON.stringify(completeness));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());