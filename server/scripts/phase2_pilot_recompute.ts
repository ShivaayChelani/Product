/**
 * Recompute refined Phase 2 pilot QA from progress JSONL (no API calls).
 * Applies: state/city alias fixes, cross-border & empty-geo handling,
 * cleaned city metric (excludes rows whose DB city is a state name).
 * Usage: ts-node scripts/phase2_pilot_recompute.ts [--out=reports/phase2-pilot-bdc-refined]
 */
import fs from 'fs';
import path from 'path';

function norm(s?: string | null): string {
  return (s || '').trim().toLowerCase().replace(/[-–—]/g, ' ').replace(/\s+/g, ' ');
}

const CITY_ALIAS: Record<string, string> = {
  bangalore: 'bengaluru', 'bangalore urban': 'bengaluru', banglore: 'bengaluru',
  bombay: 'mumbai', calcutta: 'kolkata', madras: 'chennai',
  pondicherry: 'puducherry', mysore: 'mysuru', cochin: 'kochi', trichy: 'tiruchirappalli',
  trivandrum: 'thiruvananthapuram', 'new delhi': 'delhi', 'delhi ncr': 'delhi',
  amaravati: 'amravati',
};

const STATE_ALIAS: Record<string, string> = {
  'uttara kannada': 'karnataka', 'bangalore urban': 'karnataka',
  'andaman & nicobar islands': 'andaman and nicobar islands',
  'andaman and nicobar island': 'andaman and nicobar islands',
  'andaman and nicobar': 'andaman and nicobar islands',
  'dadra and nagar haveli and daman and diu': 'dadra and nagar haveli and daman and diu',
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

const cityAlias = (n: string) => CITY_ALIAS[n] || n;
const stateAlias = (n: string) => STATE_ALIAS[n] || n;
const isIndianState = (n: string) => INDIAN_STATES.has(stateAlias(norm(n)));
const isStateNameCity = (c: string) => isIndianState(c);

function cityScore(db: string, geo: string): 'exact' | 'alias' | 'substring' | 'none' {
  const d = norm(db);
  const g = norm(geo);
  if (!d || !g) return 'none';
  if (d === g) return 'exact';
  if (cityAlias(d) === cityAlias(g)) return 'alias';
  if (d.includes(g) || g.includes(d)) return 'substring';
  return 'none';
}

function districtScore(db: string, geo: string): boolean {
  const d = norm(db);
  const g = norm(geo);
  if (!d || !g) return false;
  return d === g || d.includes(g) || g.includes(d);
}

function arg(name: string, def: string): string {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] || def;
}

async function main() {
  const base = path.resolve(arg('out', 'reports/phase2-pilot-bdc-refined'));
  const progressFile = path.resolve('reports/phase2-pilot-bdc.progress.jsonl');

  const rows: any[] = [];
  for (const line of fs.readFileSync(progressFile, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      /* ignore */
    }
  }

  const val = rows.filter((r) => r.kind === 'val' && r.status !== 'ERROR');
  const geo = rows.filter((r) => r.kind === 'geo' && r.status !== 'ERROR');
  const valErrors = rows.filter((r) => r.kind === 'val' && r.status === 'ERROR').length;
  const geoErrors = rows.filter((r) => r.kind === 'geo' && r.status === 'ERROR').length;

  const classify = (r: any) => {
    const geoState = r.geoState || '';
    const crossBorder = geoState !== '' && !isIndianState(geoState);
    const geoEmpty = geoState === '' || (r.geoCity === '');
    const dbCityIsState = isStateNameCity(r.dbCity);
    return { crossBorder, geoEmpty, dbCityIsState };
  };

  const scored = val.map((r) => ({ r, ...classify(r), city: cityScore(r.dbCity, r.geoCity), state: stateMatchAliased(r.dbState, r.geoState), district: r.dbDistrict ? districtScore(r.dbDistrict, r.geoDistrict || '') : null }));
  const gscored = geo.map((r) => ({ r, crossBorder: (r.proposed?.state || '') !== '' && !isIndianState(r.proposed.state), geoEmpty: !r.proposed?.state && !r.proposed?.city }));

  const vAll = scored;
  const vClean = scored.filter((s) => !s.dbCityIsState && !s.crossBorder && !s.geoEmpty);

  const cnt = (arr: any[], p: (s: any) => boolean) => arr.filter(p).length;
  const pct = (a: number, b: number) => (b ? (a / b) * 100 : null);

  const rawCity = {
    checked: vAll.length, exact: cnt(vAll, (s) => s.city === 'exact'), alias: cnt(vAll, (s) => s.city === 'alias'),
    substring: cnt(vAll, (s) => s.city === 'substring'), none: cnt(vAll, (s) => s.city === 'none'),
  };
  const cleanCity = {
    checked: vClean.length, exact: cnt(vClean, (s) => s.city === 'exact'), alias: cnt(vClean, (s) => s.city === 'alias'),
    substring: cnt(vClean, (s) => s.city === 'substring'), none: cnt(vClean, (s) => s.city === 'none'),
  };
  const stateAgree = cnt(vAll, (s) => s.state === true);
  const stateChecked = cnt(vAll, (s) => !s.crossBorder && !s.geoEmpty);
  const stateAgreeClean = cnt(vAll, (s) => !s.crossBorder && !s.geoEmpty && s.state === true);
  const distChecked = cnt(scored, (s) => s.district !== null && (s.r.geoDistrict || '') !== '');
  const distAgree = cnt(scored, (s) => s.district === true && (s.r.geoDistrict || '') !== '');

  const fills = geo.reduce(
    (acc: any, r) => {
      const cb = (r.proposed?.state || '') !== '' && !isIndianState(r.proposed.state);
      if (!cb && r.wouldFill?.city) acc.city++;
      if (!cb && r.wouldFill?.state) acc.state++;
      if (!cb && r.wouldFill?.district) acc.district++;
      if (!cb && r.wouldFill?.country) acc.country++;
      if (cb) acc.crossBorderBlocked++;
      if (!r.proposed?.state && !r.proposed?.city) acc.empty++;
      return acc;
    },
    { city: 0, state: 0, district: 0, country: 0, crossBorderBlocked: 0, empty: 0 },
  );

  const crossBorderRows = gscored.filter((s) => s.crossBorder).map((s) => ({ name: s.r.name, state: s.r.proposed?.state, country: s.r.proposed?.country }));
  const stateMismatches = vAll.filter((s) => s.state === false).map((s) => ({ name: s.r.name, db: s.r.dbState, geo: s.r.geoState, crossBorder: s.crossBorder, geoEmpty: s.geoEmpty }));
  const cityNoneSamples = vClean.filter((s) => s.city === 'none').slice(0, 25).map((s) => ({ name: s.r.name, db: s.r.dbCity, geo: s.r.geoCity }));

  const summary = {
    generatedAt: new Date().toISOString(),
    source: 'BigDataCloud reverse-geocode-client (OSM-derived) — refined recompute from cached progress',
    cohorts: { geocodeSize: geo.length + geoErrors, validationSize: val.length + valErrors },
    failures: { geocode: geoErrors, validation: valErrors },
    validation: {
      city: {
        raw: { checked: rawCity.checked, exact: rawCity.exact, alias: rawCity.alias, substring: rawCity.substring, none: rawCity.none, exactAliasPct: pct(rawCity.exact + rawCity.alias, rawCity.checked) },
        cleaned: { checked: cleanCity.checked, exact: cleanCity.exact, alias: cleanCity.alias, substring: cleanCity.substring, none: cleanCity.none, exactAliasPct: pct(cleanCity.exact + cleanCity.alias, cleanCity.checked), excludedStateNameCities: vAll.length - vClean.length, note: 'excludes rows whose DB city is a state/UT name, cross-border points, and empty geocoder responses' },
      },
      state: {
        checked: stateChecked, agree: stateAgreeClean, pct: pct(stateAgreeClean, stateChecked),
        excluded: { crossBorder: cnt(vAll, (s) => s.crossBorder), geoEmpty: cnt(vAll, (s) => s.geoEmpty) },
      },
      district: { checked: distChecked, agree: distAgree, pct: pct(distAgree, distChecked) },
    },
    fillsProposed: fills,
    crossBorderRows,
    stateMismatches,
    cityNoneSamples,
    note: 'DRY-RUN — no database writes performed.',
  };

  const outMd = base + '.md';
  const outJson = base + '.json';
  fs.writeFileSync(outMd, buildMarkdown(summary));
  fs.writeFileSync(outJson, JSON.stringify(summary, null, 2));
  console.log('Refined report written:', outMd);
  console.log(JSON.stringify(summary, null, 2));
}

function stateMatchAliased(db: string, geo: string): boolean {
  const d = stateAlias(norm(db));
  const g = stateAlias(norm(geo));
  return !!d && !!g && d === g;
}

function buildMarkdown(s: any): string {
  const L: string[] = [];
  L.push('# Phase 2 — Reverse-Geocode Pilot QA (BigDataCloud) — Refined');
  L.push('');
  L.push(`Generated: ${s.generatedAt}`);
  L.push(`Source: ${s.source}`);
  L.push('');
  L.push('## Failure rate');
  L.push('');
  L.push(`| Cohort | Rows | Errors |`);
  L.push('|--------|-----:|-------:|');
  L.push(`| Geocode set | ${s.cohorts.geocodeSize} | ${s.failures.geocode} |`);
  L.push(`| Validation set | ${s.cohorts.validationSize} | ${s.failures.validation} |`);
  L.push('');
  L.push('## State accuracy (validation set)');
  L.push('');
  const st = s.validation.state;
  L.push(`- Checked: ${st.checked} (excludes cross-border ${st.excluded.crossBorder}, empty-geocoder ${st.excluded.geoEmpty})`);
  L.push(`- Agree: ${st.agree} → **${st.pct?.toFixed(2) ?? 'n/a'}%**`);
  L.push('');
  L.push('### State mismatches');
  L.push('');
  if (s.stateMismatches.length === 0) L.push('None.');
  for (const m of s.stateMismatches) L.push(`- ${m.name}: DB="${m.db}" vs geo="${m.geo}" ${m.crossBorder ? '(cross-border — geocoder correct)' : m.geoEmpty ? '(empty geocoder response)' : ''}`);
  L.push('');
  L.push('## City accuracy (validation set)');
  L.push('');
  const rc = s.validation.city.raw;
  const cc = s.validation.city.cleaned;
  L.push('| Metric | Checked | exact | alias | substring | none | exact+alias % |');
  L.push('|--------|--------:|------:|------:|----------:|-----:|--------------:|');
  L.push(`| Raw (all rows) | ${rc.checked} | ${rc.exact} | ${rc.alias} | ${rc.substring} | ${rc.none} | ${rc.exactAliasPct?.toFixed(2) ?? 'n/a'}% |`);
  L.push(`| Cleaned (${cc.excludedStateNameCities} excluded: DB city is a state name / cross-border / empty geo) | ${cc.checked} | ${cc.exact} | ${cc.alias} | ${cc.substring} | ${cc.none} | ${cc.exactAliasPct?.toFixed(2) ?? 'n/a'}% |`);
  L.push('');
  L.push(`Note: ${cc.excludedStateNameCities} validation rows have a **state/UT name stored in the city column** (DB data pollution), making raw city accuracy a measure of DB quality, not geocoder quality.`);
  L.push('');
  L.push('### City "none" samples after cleaning (for human review)');
  L.push('');
  for (const x of s.cityNoneSamples) L.push(`- ${x.name}: DB="${x.db}" geo="${x.geo}"`);
  L.push('');
  L.push('## District accuracy (validation set)');
  L.push('');
  const dd = s.validation.district;
  L.push(`- Checked: ${dd.checked} (rows with existing DB district AND non-empty geocoder district)`);
  L.push(`- Agree: ${dd.agree} → **${dd.pct?.toFixed(2) ?? 'n/a'}%**`);
  L.push('- Disagreements observed are mostly locality-names stored as districts (e.g. "Old Delhi") or border-ambiguous points (Pin Parvati Pass); empty geo districts occur on islands/coast.');
  L.push('');
  L.push('## Proposed fills (geocode set)');
  L.push('');
  const f = s.fillsProposed;
  L.push('| Field | Would fill |');
  L.push('|-------|-----------:|');
  L.push(`| city | ${f.city} |`);
  L.push(`| state | ${f.state} |`);
  L.push(`| district | ${f.district} |`);
  L.push(`| country | ${f.country} |`);
  L.push(`| cross-border → blocked for review | ${f.crossBorderBlocked} |`);
  L.push(`| empty geocoder response → no fill | ${f.empty} |`);
  L.push('');
  L.push('## Cross-border rows (not Indian — flagged, NOT filled)');
  L.push('');
  for (const x of s.crossBorderRows) L.push(`- ${x.name}: ${x.state} (${x.country})`);
  L.push('');
  L.push('## Notes');
  L.push('- Proposals only fill EMPTY fields; existing verified values are never overwritten.');
  L.push('- Provenance on apply: source=BigDataCloud, sourceType=reverse-geocode.');
  return L.join('\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});