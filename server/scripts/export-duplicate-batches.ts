/** Export duplicate review batch CSVs (read-only). */
import fs from 'fs';
import path from 'path';
import { prisma } from '../src/config/database';

const OUT = path.resolve('reports/ops/duplicate-batches');

const SQL = `
  SELECT dc.id, dc.confidence_score,
    a.public_place_id AS place_a_public, a.name AS place_a_name, a.source::text AS place_a_source, a.external_id AS place_a_ext,
    b.public_place_id AS place_b_public, b.name AS place_b_name, b.source::text AS place_b_source, b.external_id AS place_b_ext,
    ROUND(ST_Distance(a.location::geography, b.location::geography)::numeric,0) AS distance_m
  FROM place_duplicate_candidates dc
  JOIN places a ON a.id = dc.place_a_id
  JOIN places b ON b.id = dc.place_b_id
  WHERE dc.status = 'OPEN'
`;

async function exportBand(name: string, where: string) {
  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(SQL + where + ' ORDER BY dc.confidence_score DESC');
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const keys = rows[0] ? Object.keys(rows[0]) : [];
  const csv = [keys.join(','), ...rows.map((r) => keys.map((k) => esc(r[k])).join(','))].join('\n');
  fs.writeFileSync(path.join(OUT, `${name}.csv`), csv);
  console.log(`${name}: ${rows.length} rows`);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  await exportBand('batch1_gte_098', ' AND dc.confidence_score >= 0.98');
  await exportBand('batch2_095_098', ' AND dc.confidence_score >= 0.95 AND dc.confidence_score < 0.98');
  await exportBand('batch3_090_095', ' AND dc.confidence_score >= 0.90 AND dc.confidence_score < 0.95');
  await exportBand('batch4_086_090', ' AND dc.confidence_score >= 0.86 AND dc.confidence_score < 0.90');
  await exportBand('manual_review_072_086', ' AND dc.confidence_score >= 0.72 AND dc.confidence_score < 0.86');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
