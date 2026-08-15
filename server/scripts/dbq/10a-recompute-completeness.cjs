/**
 * Recompute quality_score (completeness %) for all canonical places.
 *
 * Faithful port of server/scripts/lib/place-completeness.ts (computeCompletenessScore)
 * and server/scripts/jobs/recalculate-completeness-scores.ts, but using bulk SQL
 * (single aggregate pass + batched UPDATE ... FROM VALUES) instead of per-record
 * Prisma updates, so a full 97k-place recalc takes minutes, not hours.
 *
 * Usage:
 *   node scripts/dbq/10a-recompute-completeness.cjs [--dry-run]
 */
process.env.DOTENV_CONFIG_PATH = __dirname + '/../../.env';
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH });

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const DRY_RUN = process.argv.includes('--dry-run');
const OUT_DIR = path.resolve(__dirname, '../../reports/dbq');
fs.mkdirSync(OUT_DIR, { recursive: true });

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });

// ── Weights (mirror of place-completeness.ts) ──────────────────
const WEIGHTS = {
  identity: 7, coordinates: 8, boundaryValidated: 4, state: 3, district: 3,
  city: 3, address: 3, description: 8, history: 4, aliases: 4, translations: 2,
  searchKeywords: 3, category: 4, website: 3, openingHours: 3, entryFee: 3,
  heritage: 3, nearby: 3, accessibility: 2, parking: 2, washroom: 1,
  provenance: 3, verifiedImage: 3, tags: 2, elevation: 1, visitorInfo: 4,
  tourismContent: 3, travelAccess: 3, activities: 3,
};

function hasText(v) {
  return v != null && String(v).trim().length > 0;
}

function computeScore(p) {
  let score = 0;
  if (hasText(p.name)) score += WEIGHTS.identity;
  if (p.latitude != null && p.longitude != null) score += WEIGHTS.coordinates;
  if (p.boundaryValidated) score += WEIGHTS.boundaryValidated;
  if (hasText(p.state)) score += WEIGHTS.state;
  if (hasText(p.district)) score += WEIGHTS.district;
  if (hasText(p.city)) score += WEIGHTS.city;
  if (hasText(p.fullAddress) || hasText(p.village)) score += WEIGHTS.address;
  if (hasText(p.description) && p.description.trim().length >= 40) score += WEIGHTS.description;
  if (hasText(p.history)) score += WEIGHTS.history;
  if (p.aliasCount > 0) score += WEIGHTS.aliases;
  if (p.translationCount > 0) score += WEIGHTS.translations;
  if (p.searchKeywordCount >= 2) score += WEIGHTS.searchKeywords;
  if (hasText(p.category)) score += WEIGHTS.category;
  if (hasText(p.website)) score += WEIGHTS.website;
  if (p.openingHours != null) score += WEIGHTS.openingHours;
  if (p.ticketPrice != null) score += WEIGHTS.entryFee;
  if (hasText(p.heritageStatus) || hasText(p.unescoStatus)) score += WEIGHTS.heritage;
  if (p.nearbyCount > 0) score += WEIGHTS.nearby;
  if (p.isAccessible || hasText(p.accessibilityDetails)) score += WEIGHTS.accessibility;
  if (p.hasParking || hasText(p.parkingDetails)) score += WEIGHTS.parking;
  if (p.hasWashroom) score += WEIGHTS.washroom;
  if (p.provenanceCount > 0) score += WEIGHTS.provenance;
  if (p.hasVerifiedImage) score += WEIGHTS.verifiedImage;
  if (p.tagCount > 0) score += WEIGHTS.tags;
  if (p.elevationMeters != null) score += WEIGHTS.elevation;
  if (p.highlights && p.highlights.visitorInfo != null) score += WEIGHTS.visitorInfo;
  if (p.highlights && p.highlights.tourismContent != null) score += WEIGHTS.tourismContent;
  if (p.highlights && p.highlights.travelAccess != null) score += WEIGHTS.travelAccess;
  if (Array.isArray(p.highlights?.officialActivities) && p.highlights.officialActivities.length > 0) score += WEIGHTS.activities;
  return Math.min(100, Math.round(score));
}

function esc(val) {
  if (val == null) return 'NULL';
  if (typeof val === 'number') return String(val);
  return "'" + String(val).replace(/'/g, "''") + "'";
}

async function q(sql) { return prisma.$queryRawUnsafe(sql); }

async function withDb(fn) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const msg = String(e?.message || '').toLowerCase();
      const isConn = msg.includes('closed the connection') || msg.includes('connection') ||
                     msg.includes('pool') || msg.includes('timed out') || msg.includes('socket') ||
                     msg.includes('ended') || msg.includes('terminated');
      if (!isConn || attempt === 2) throw e;
      console.error(`[recompute] db connection issue (${e.message}); reconnecting...`);
      try { await prisma.$disconnect(); } catch { /* ignore */ }
      await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
    }
  }
  throw new Error('unreachable');
}

async function main() {
  const t0 = Date.now();
  console.log(`[recompute] mode=${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);

  const rows = await withDb(() => q(`SELECT id, name, latitude::float8 AS latitude, longitude::float8 AS longitude,
              state, district, city, village, full_address AS "fullAddress", description, history,
              category, website, opening_hours AS "openingHours", ticket_price AS "ticketPrice",
              heritage_status AS "heritageStatus", unesco_status AS "unescoStatus",
              search_keywords, tags, has_parking AS "hasParking", parking_details AS "parkingDetails",
              is_accessible AS "isAccessible", accessibility_details AS "accessibilityDetails",
              has_washroom AS "hasWashroom", elevation_meters AS "elevationMeters", highlights
       FROM places WHERE merged_into_id IS NULL`));

  const aliases = await withDb(() => q(`SELECT place_id, COUNT(*)::int AS n FROM place_aliases GROUP BY place_id`));
  const translations = await withDb(() => q(`SELECT place_id, COUNT(*)::int AS n FROM place_translations GROUP BY place_id`));
  const provenance = await withDb(() => q(`SELECT place_id, COUNT(*)::int AS n FROM place_field_provenance GROUP BY place_id`));
  const nearby = await withDb(() => q(`SELECT from_place_id AS place_id, COUNT(*)::int AS n FROM place_relationships WHERE relationship_type = 'NEARBY' GROUP BY from_place_id`));
  const boundary = await withDb(() => q(`SELECT place_id, COUNT(*)::int AS n FROM place_boundary_validation WHERE within_india = true GROUP BY place_id`));
  const images = await withDb(() => q(`SELECT place_id, COUNT(*)::int AS n FROM place_images WHERE verification_status = 'LICENSE_VERIFIED' GROUP BY place_id`));

  const mapCount = (arr) => {
    const m = new Map();
    for (const r of arr) m.set(r.place_id, Number(r.n));
    return m;
  };
  const aMap = mapCount(aliases);
  const tMap = mapCount(translations);
  const pMap = mapCount(provenance);
  const nMap = mapCount(nearby);
  const bMap = mapCount(boundary);
  const iMap = mapCount(images);

  console.log(`[recompute] loaded ${rows.length} places, aliases=${aliases.length} translations=${translations.length} prov=${provenance.length} nearby=${nearby.length} boundary=${boundary.length} verifiedImages=${images.length}`);

  const scores = [];
  for (const r of rows) {
    let hl = r.highlights;
    if (hl != null && typeof hl === 'string') { try { hl = JSON.parse(hl); } catch { hl = {}; } }
    if (hl == null || typeof hl !== 'object' || Array.isArray(hl)) hl = {};

    const s = computeScore({
      name: r.name,
      latitude: r.latitude,
      longitude: r.longitude,
      state: r.state,
      district: r.district,
      city: r.city,
      village: r.village,
      fullAddress: r.fullAddress,
      description: r.description,
      history: r.history,
      category: r.category,
      website: r.website,
      openingHours: r.openingHours,
      ticketPrice: r.ticketPrice,
      heritageStatus: r.heritageStatus,
      unescoStatus: r.unescoStatus,
      searchKeywordCount: r.search_keywords ? r.search_keywords.length : 0,
      tagCount: r.tags ? r.tags.length : 0,
      aliasCount: aMap.get(r.id) || 0,
      translationCount: tMap.get(r.id) || 0,
      nearbyCount: nMap.get(r.id) || 0,
      provenanceCount: pMap.get(r.id) || 0,
      hasVerifiedImage: (iMap.get(r.id) || 0) > 0,
      boundaryValidated: (bMap.get(r.id) || 0) > 0,
      hasParking: r.hasParking,
      parkingDetails: r.parkingDetails,
      isAccessible: r.isAccessible,
      accessibilityDetails: r.accessibilityDetails,
      hasWashroom: r.hasWashroom,
      elevationMeters: r.elevationMeters,
      highlights: hl,
    });
    scores.push({ id: r.id, score: s });
  }

  const dist = {};
  for (const s of scores) {
    const band = s.score >= 80 ? 'high(80+)' : s.score >= 50 ? 'medium(50-79)' : s.score >= 25 ? 'low(25-49)' : 'minimal(<25)';
    dist[band] = (dist[band] || 0) + 1;
  }
  const avg = scores.reduce((a, b) => a + b.score, 0) / (scores.length || 1);
  console.log(`[recompute] computed ${scores.length} scores | avg=${avg.toFixed(2)}`);
  console.log(JSON.stringify(dist, null, 2));

  if (!DRY_RUN) {
    const BATCH = 2000;
    let applied = 0;
    for (let i = 0; i < scores.length; i += BATCH) {
      const chunk = scores.slice(i, i + BATCH);
      const tuples = chunk.map((s) => `(${esc(s.id)}, ${esc(s.score)})`).join(',');
      await withDb(() => prisma.$executeRawUnsafe(`
        UPDATE places SET quality_score = v.val, updated_at = NOW()
        FROM (VALUES ${tuples}) AS v(id, val)
        WHERE places.id = v.id::text`));
      applied += chunk.length;
      console.log(`[recompute] updated ${applied}/${scores.length}`);
    }
    console.log(`[recompute] ALL UPDATED (${applied})`);
  } else {
    console.log('[recompute] DRY-RUN: no writes');
  }

  const summary = {
    mode: DRY_RUN ? 'dry-run' : 'applied',
    places: scores.length,
    avg_score: Number(avg.toFixed(2)),
    distribution: dist,
    elapsed_seconds: ((Date.now() - t0) / 1000).toFixed(1),
  };
  fs.writeFileSync(path.join(OUT_DIR, 'completeness-recompute-summary.json'), JSON.stringify(summary, null, 2));
  console.log(`[recompute] done in ${summary.elapsed_seconds}s`);
}

main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); }).finally(() => prisma.$disconnect());
