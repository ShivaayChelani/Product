/**
 * PHASE 1 — Full read-only data audit.
 * No writes. Generates a markdown + JSON report to /reports.
 * Usage: ts-node scripts/phase1_data_audit.ts
 */
import fs from 'fs';
import path from 'path';
import { prisma } from '../src/config/database';

interface SampleRow {
  [k: string]: any;
}

interface Metric {
  count: number;
  sample: SampleRow[];
}

const base = path.resolve('reports/phase1-data-audit');
const outMd = base + '.md';
const outJson = base + '.json';

async function raw<T = any[]>(q: string): Promise<T> {
  return prisma.$queryRawUnsafe(q);
}

async function countWhere(where: string, cols: string): Promise<Metric> {
  const c = await raw<{ count: number }[]>(`SELECT COUNT(*)::int AS count FROM public.places ${where}`);
  const sample = await raw<SampleRow[]>(
    `SELECT ${cols} FROM public.places ${where} ORDER BY created_at DESC LIMIT 8`,
  );
  return { count: Number(c[0].count), sample };
}

async function main() {
  const report: any = {
    generatedAt: new Date().toISOString(),
    scope: 'Read-only audit of public.places (active + merged tracked separately)',
  };

  const totals = await raw<any[]>(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE merged_into_id IS NULL)::int AS active,
      COUNT(*) FILTER (WHERE merged_into_id IS NOT NULL)::int AS merged,
      COUNT(*) FILTER (WHERE status = 'APPROVED')::int AS approved,
      COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending,
      COUNT(*) FILTER (WHERE status = 'REJECTED')::int AS rejected,
      COUNT(*) FILTER (WHERE data_quality = 'VERIFIED')::int AS verified,
      COUNT(*) FILTER (WHERE data_quality = 'DRAFT')::int AS draft,
      COUNT(*) FILTER (WHERE data_quality = 'PENDING_REVIEW')::int AS pending_review,
      COUNT(*) FILTER (WHERE data_quality = 'REJECTED')::int AS quality_rejected,
      COUNT(DISTINCT state)::int AS distinct_state,
      COUNT(DISTINCT city)::int AS distinct_city,
      COUNT(DISTINCT district)::int AS distinct_district,
      COUNT(DISTINCT category)::int AS distinct_category
    FROM public.places
  `);
  report.totals = totals[0];

  const ACTIVE = 'WHERE merged_into_id IS NULL';

  report.missing = {};
  report.missing.city = await countWhere(
    `${ACTIVE} AND (city IS NULL OR TRIM(city) = '')`,
    "id, name, state, category",
  );
  report.missing.state = await countWhere(
    `${ACTIVE} AND (state IS NULL OR TRIM(state) = '')`,
    'id, name, city, category',
  );
  report.missing.district = await countWhere(
    `${ACTIVE} AND (district IS NULL OR TRIM(district) = '')`,
    'id, name, city, state, category',
  );
  report.missing.country = await countWhere(
    `${ACTIVE} AND (country IS NULL OR TRIM(country) = '')`,
    'id, name, city, state',
  );
  report.missing.category = await countWhere(
    `${ACTIVE} AND (category IS NULL OR TRIM(category) = '')`,
    'id, name, city, state',
  );
  report.missing.coordinates = await countWhere(
    `${ACTIVE} AND (latitude IS NULL OR longitude IS NULL)`,
    'id, name, city, state, category',
  );

  const invCoord = await raw<any[]>(`
    SELECT
      COUNT(*) FILTER (WHERE latitude IS NULL OR longitude IS NULL)::int AS null_coords,
      COUNT(*) FILTER (WHERE latitude < -90 OR latitude > 90 OR longitude < -180 OR longitude > 180)::int AS out_of_range,
      COUNT(*) FILTER (WHERE latitude = 0 AND longitude = 0)::int AS zero_zero
    FROM public.places WHERE merged_into_id IS NULL
  `);
  report.invalid_coordinates = invCoord[0];
  report.invalid_coordinates.samples_out_of_range = await raw<SampleRow[]>(`
    SELECT id, name, latitude, longitude, state, category FROM public.places
    WHERE merged_into_id IS NULL AND (latitude < -90 OR latitude > 90 OR longitude < -180 OR longitude > 180)
    LIMIT 8
  `);
  report.invalid_coordinates.samples_zero_zero = await raw<SampleRow[]>(`
    SELECT id, name, latitude, longitude, state, category FROM public.places
    WHERE merged_into_id IS NULL AND latitude = 0 AND longitude = 0 LIMIT 8
  `);

  const dupCoords = await raw<any[]>(`
    SELECT ROUND(latitude::numeric, 6) AS lat, ROUND(longitude::numeric, 6) AS lon, COUNT(*)::int AS places
    FROM public.places
    WHERE merged_into_id IS NULL AND latitude IS NOT NULL AND longitude IS NOT NULL
      AND NOT (latitude = 0 AND longitude = 0)
    GROUP BY 1, 2 HAVING COUNT(*) > 1
    ORDER BY places DESC
  `);
  report.duplicate_coordinates = {
    pairs: dupCoords.length,
    places_involved: dupCoords.reduce((a: number, r: any) => a + Number(r.places), 0),
  };
  report.duplicate_coordinates.top_pairs = dupCoords.slice(0, 10);

  const dupNames = await raw<any[]>(`
    SELECT LOWER(name) AS name, COUNT(*)::int AS places, string_agg(DISTINCT state, ', ') AS states
    FROM public.places WHERE merged_into_id IS NULL
    GROUP BY 1 HAVING COUNT(*) > 1
    ORDER BY places DESC
  `);
  report.duplicate_names = {
    groups: dupNames.length,
    places_involved: dupNames.reduce((a: number, r: any) => a + Number(r.places), 0),
  };
  report.duplicate_names.top = dupNames.slice(0, 10);

  const dupExact = await raw<any[]>(`
    SELECT LOWER(name) AS name, latitude, longitude, COUNT(*)::int places, string_agg(DISTINCT state, ', ') AS states
    FROM public.places
    WHERE merged_into_id IS NULL AND latitude IS NOT NULL AND longitude IS NOT NULL
      AND NOT (latitude = 0 AND longitude = 0)
    GROUP BY 1, 2, 3 HAVING COUNT(*) > 1
    ORDER BY places DESC
  `);
  report.duplicate_name_and_coords = {
    groups: dupExact.length,
    places_involved: dupExact.reduce((a: number, r: any) => a + Number(r.places), 0),
  };
  report.duplicate_name_and_coords.top = dupExact.slice(0, 10);

  const generic = await raw<any[]>(`
    SELECT LOWER(TRIM(name)) AS name, COUNT(*)::int AS places, string_agg(DISTINCT state, ', ') AS states
    FROM public.places
    WHERE merged_into_id IS NULL
      AND (
           LENGTH(TRIM(name)) < 4
        OR LOWER(TRIM(name)) IN (
          'view point','viewpoint','park','garden','lake','temple','beach','waterfall','fort',
          'museum','hotel','restaurant','tourist spot','tourist place','tourist attraction',
          'hill','mountain','valley','river','dam','pass','peak','point','area','village','city',
          'town','ganj','bazar','chowk','square','market','mandir','ghat','falls','falls view',
          'cave','rock','arch','stupa','mandapa','kadamba','bust','statue','follow','open',
          'entry','exit','road','street','lane','margin','transport','lodging','canteen','shiv'
        )
      )
    GROUP BY 1 ORDER BY places DESC
  `);
  report.generic_names = {
    groups: generic.length,
    places_involved: generic.reduce((a: number, r: any) => a + Number(r.places), 0),
  };
  report.generic_names.top = generic.slice(0, 15);

  report.missing_descriptions = await countWhere(
    `${ACTIVE} AND (description IS NULL OR LENGTH(TRIM(description)) = 0)`,
    "id, name, LEFT(COALESCE(description, ''), 40) AS description, city, state",
  );
  report.short_descriptions = await countWhere(
    `${ACTIVE} AND (description IS NOT NULL AND LENGTH(TRIM(description)) < 50)`,
    "id, name, LEFT(COALESCE(description, ''), 40) AS description, city, state",
  );

  report.missing_images = await countWhere(
    `${ACTIVE} AND (COALESCE(cardinality(images), 0) = 0)`,
    'id, name, city, state, category',
  );

  report.missing_geohash = await countWhere(
    `${ACTIVE} AND latitude IS NOT NULL AND longitude IS NOT NULL AND geohash IS NULL`,
    'id, name, latitude, longitude',
  );

  report.category_distribution = await raw<any[]>(`
    SELECT COALESCE(NULLIF(TRIM(category), ''), '(empty)') AS category, COUNT(*)::int AS places
    FROM public.places WHERE merged_into_id IS NULL
    GROUP BY 1 ORDER BY places DESC
  `);

  report.source_distribution = await raw<any[]>(`
    SELECT source, COUNT(*)::int AS places FROM public.places
    WHERE merged_into_id IS NULL GROUP BY 1 ORDER BY places DESC
  `);

  const prov = await raw<any[]>(`
    SELECT COUNT(DISTINCT fp.place_id)::int AS places_with_provenance, COUNT(*)::int AS provenance_rows
    FROM public.place_field_provenance fp
  `);
  report.provenance = prov[0];

  fs.mkdirSync(path.dirname(outMd), { recursive: true });
  fs.writeFileSync(outMd, buildMarkdown(report));
  fs.writeFileSync(outJson, JSON.stringify(report, null, 2));
  console.log('Report written:', outMd);
  console.log(JSON.stringify(report, null, 2));
}

function buildMarkdown(r: any): string {
  const t = r.totals;
  const L: string[] = [];
  L.push('# Phase 1 — Data Audit Report');
  L.push('');
  L.push(`Generated: ${r.generatedAt}`);
  L.push('');
  L.push('## Totals');
  L.push('');
  L.push('| Metric | Count |');
  L.push('|-------:|------:|');
  const pairs: [string, number][] = [
    ['Total places', t.total], ['Active (merged_into_id null)', t.active], ['Merged rows', t.merged],
    ['Approved', t.approved], ['Pending', t.pending], ['Rejected', t.rejected],
    ['DataQuality VERIFIED', t.verified], ['DataQuality DRAFT', t.draft],
    ['DataQuality PENDING_REVIEW', t.pending_review], ['DataQuality REJECTED', t.quality_rejected],
    ['Distinct states', t.distinct_state], ['Distinct cities', t.distinct_city],
    ['Distinct districts', t.distinct_district], ['Distinct categories', t.distinct_category],
  ];
  for (const [k, v] of pairs) L.push(`| ${k} | ${Number(v || 0).toLocaleString()} |`);
  L.push('');

  L.push('## Missing fields (active rows)');
  L.push('');
  L.push('| Field | Places | Sample |');
  L.push('|-------|-------:|--------|');
  for (const key of ['city', 'state', 'district', 'country', 'category', 'coordinates']) {
    const item = r.missing[key];
    const n = Number(item?.count || 0);
    const sample = (item?.sample || []).map((s: any) => s.name + ' (' + s.id + ')').join(', ') || '—';
    L.push(`| ${key} | ${n.toLocaleString()} | ${sample} |`);
  }
  L.push('');

  L.push('## Invalid coordinates (active rows)');
  L.push('');
  L.push(`- null coords: ${r.invalid_coordinates.null_coords}`);
  L.push(`- out-of-range: ${r.invalid_coordinates.out_of_range}`);
  L.push(`- zero/zero: ${r.invalid_coordinates.zero_zero}`);
  L.push('');
  L.push('Sample out-of-range:');
  for (const s of r.invalid_coordinates.samples_out_of_range || []) L.push(`- ${s.name} (${s.id}) ${s.latitude},${s.longitude}`);
  L.push('Sample zero/zero:');
  for (const s of r.invalid_coordinates.samples_zero_zero || []) L.push(`- ${s.name} (${s.id})`);
  L.push('');

  const dc = r.duplicate_coordinates;
  L.push('## Duplicate coordinates (active, non-zero)');
  L.push(`- pairs: ${dc.pairs.toLocaleString()}, places involved: ${dc.places_involved.toLocaleString()}`);
  L.push('');

  const dn = r.duplicate_names;
  L.push('## Duplicate names');
  L.push(`- groups: ${dn.groups.toLocaleString()}, places involved: ${dn.places_involved.toLocaleString()}`);
  for (const s of dn.top) L.push(`- "${s.name}" × ${s.places} (${s.states})`);
  L.push('');

  const g = r.generic_names;
  L.push('## Generic names');
  L.push(`- groups: ${g.groups.toLocaleString()}, places involved: ${g.places_involved.toLocaleString()}`);
  for (const s of g.top) L.push(`- "${s.name}" × ${s.places} (${s.states})`);
  L.push('');

  L.push('## Descriptions');
  L.push(`- empty: ${r.missing_descriptions.count.toLocaleString()}`);
  L.push(`- very short (< 50 chars): ${r.short_descriptions.count.toLocaleString()}`);
  L.push('');

  L.push('## Images');
  L.push(`- active rows with no images: ${r.missing_images.count.toLocaleString()}`);
  L.push('');

  L.push('## Geohash');
  L.push(`- rows with coords but no geohash: ${r.missing_geohash.count.toLocaleString()}`);
  L.push('');

  L.push('## Category distribution (top)');
  L.push('');
  L.push('| Category | Places |');
  L.push('|----------|-------:|');
  for (const c of r.category_distribution) L.push(`| ${c.category} | ${Number(c.places).toLocaleString()} |`);
  L.push('');

  L.push('## Source distribution');
  L.push('');
  L.push('| Source | Places |');
  L.push('|--------|-------:|');
  for (const s of r.source_distribution) L.push(`| ${s.source} | ${Number(s.places).toLocaleString()} |`);
  L.push('');

  L.push('## Provenance');
  L.push(`- places with field provenance: ${r.provenance.places_with_provenance.toLocaleString()}`);
  L.push(`- provenance rows: ${r.provenance.provenance_rows.toLocaleString()}`);
  L.push('');
  L.push('## Notes');
  L.push('- Read-only audit. No data modified.');
  L.push('- Only active rows (merged_into_id IS NULL) are scored for quality; merged rows are historical noise.');
  return L.join('\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());