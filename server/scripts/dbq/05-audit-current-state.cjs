/**
 * Re-audit the current DB state to compare with original baseline.
 * Answers: what changed since the original audit? What's still needed?
 */
process.env.DOTENV_CONFIG_PATH = __dirname + '/../../.env';
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH });

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL } },
});

async function main() {
  console.log('=== CURRENT DB STATE vs ORIGINAL BASELINE ===\n');

  // 1) Missing city — original was 61,484
  const cityMissing = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int AS cnt FROM places
    WHERE merged_into_id IS NULL AND (city IS NULL OR city = '')`);
  console.log(`Missing city: ${cityMissing[0].cnt} (original baseline: 61,484)`);

  // 2) Geohash NULL — original was 5,641
  const ghNull = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int AS cnt FROM places
    WHERE merged_into_id IS NULL AND geohash IS NULL
      AND latitude IS NOT NULL AND longitude IS NOT NULL`);
  console.log(`Missing geohash (nullable coords): ${ghNull[0].cnt} (original dry-run: 5,641)`);

  // 3) State normalization needed — original was 89
  const stateFix = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int AS cnt FROM places
    WHERE merged_into_id IS NULL AND state IS NOT NULL AND state <> '' AND (
      LOWER(TRIM(state)) IN ('andaman and nicobar', 'daman and diu')
      OR state <> CASE LOWER(TRIM(state))
        WHEN 'andaman and nicobar' THEN 'Andaman and Nicobar Islands'
        WHEN 'daman and diu' THEN 'Dadra and Nagar Haveli and Daman and Diu'
      END
    )`);
  console.log(`State normalization needed: ${stateFix[0].cnt} (original: 89)`);

  // 4) Category 'trekking' → 'trek' — original was 1,911
  const catFix = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int AS cnt FROM places
    WHERE merged_into_id IS NULL AND LOWER(category) = 'trekking'`);
  console.log(`Category trekking→trek needed: ${catFix[0].cnt} (original: 1,911)`);

  // 5) Cities that are state names (not Delhi/Chandigarh/Puducherry)
  const STATE_NAMES = new Set([
    'andhra pradesh','arunachal pradesh','assam','bihar','chhattisgarh','goa','gujarat','haryana',
    'himachal pradesh','jammu and kashmir','jharkhand','karnataka','kerala','ladakh','madhya pradesh',
    'maharashtra','manipur','meghalaya','mizoram','nagaland','odisha','punjab','rajasthan','sikkim',
    'tamil nadu','telangana','tripura','uttar pradesh','uttarakhand','west bengal',
    'andaman and nicobar islands','andaman and nicobar','daman and diu',
    'dadra and nagar haveli and daman and diu','lakshadweep','odissa','orissa','uttranchal',
  ]);
  const CITY_OK_UT = new Set(['delhi', 'chandigarh', 'puducherry', 'pondicherry']);
  const stateFragments = new Set(['pradesh','nadu','bengal','khand','garh','desh']);
  const ADMIN_UNIT_RE = /(tehsil|subdistrict|sub-district|block|taluk|taluka|mandal|zilla|jila|district|panchayat)$/i;

  const cityRows = await prisma.$queryRawUnsafe(`
    SELECT id, name, city, state FROM places
    WHERE merged_into_id IS NULL AND city IS NOT NULL AND city <> ''`);
  console.log(`\nTotal non-empty cities: ${cityRows.length}`);

  let cityBlankCount = 0, cityTehsilCount = 0, cityRetitleCount = 0;
  let cityStateCount = 0, cityFragmentCount = 0, cityAdminCount = 0;
  const blankReasons = {};
  for (const r of cityRows) {
    const c = String(r.city).trim();
    const lower = c.toLowerCase().replace(/\s+/g, ' ');

    // Skip compound cities (handled by split logic)
    let checkCity = lower;
    if (c.includes(',')) {
      const parts = c.split(',').map(s => s.trim()).filter(Boolean);
      if (parts.length === 2) {
        const second = parts[1].toLowerCase();
        if (STATE_NAMES.has(second)) { checkCity = parts[0].toLowerCase(); }
      }
    }

    if (STATE_NAMES.has(checkCity) && !CITY_OK_UT.has(checkCity)) { cityBlankCount++; cityStateCount++; }
    else if (stateFragments.has(checkCity)) { cityBlankCount++; cityFragmentCount++; }
    else if (ADMIN_UNIT_RE.test(c)) { cityTehsilCount++; cityAdminCount++; }
  }
  console.log(`City is state: ${cityStateCount}`);
  console.log(`City is fragment: ${cityFragmentCount}`);
  console.log(`City is admin unit: ${cityAdminCount}`);
  console.log(`Total city needs fix: ${cityBlankCount + cityTehsilCount}`);

  // 6) Check for partial application: any state values already normalized?
  const stateAlreadyFixed = await prisma.$queryRawUnsafe(`
    SELECT state, COUNT(*)::int AS cnt FROM places
    WHERE merged_into_id IS NULL AND state IS NOT NULL
    GROUP BY state HAVING LOWER(TRIM(state)) IN ('andaman and nicobar islands', 'dadra and nagar haveli and daman and diu')
    ORDER BY cnt DESC`);
  console.log('\nState values that look like already-normalized:');
  for (const r of stateAlreadyFixed) console.log(`  "${r.state}": ${r.cnt}`);

  // 7) Check if any categories already 'trek' (how many trek vs trekking)
  const catCounts = await prisma.$queryRawUnsafe(`
    SELECT category, COUNT(*)::int AS cnt FROM places
    WHERE merged_into_id IS NULL AND LOWER(category) IN ('trek','trekking')
    GROUP BY category ORDER BY cnt DESC`);
  console.log('\nCategory trek/trekking distribution:');
  for (const r of catCounts) console.log(`  "${r.category}": ${r.cnt}`);

  // 8) Check geohash precision distribution
  const ghPrecision = await prisma.$queryRawUnsafe(`
    SELECT LENGTH(geohash) AS prec, COUNT(*)::int AS cnt FROM places
    WHERE merged_into_id IS NULL AND geohash IS NOT NULL
    GROUP BY LENGTH(geohash) ORDER BY prec`);
  console.log('\nGeohash precision distribution:');
  for (const r of ghPrecision) console.log(`  precision ${r.prec}: ${r.cnt}`);

  // 9) City field stats
  const cityBlankTotal = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int AS cnt FROM places
    WHERE merged_into_id IS NULL AND (city IS NULL OR city = '')`);
  console.log(`\nCity is NULL or empty: ${cityBlankTotal[0].cnt}`);

  // 10) Are there places with city = '' (empty string) vs NULL?
  const cityEmptyVsNull = await prisma.$queryRawUnsafe(`
    SELECT
      COUNT(*) FILTER (WHERE city IS NULL) AS null_count,
      COUNT(*) FILTER (WHERE city = '') AS empty_count,
      COUNT(*) FILTER (WHERE city IS NOT NULL AND city <> '') AS has_city
    FROM places WHERE merged_into_id IS NULL`);
  const cvr = cityEmptyVsNull[0];
  console.log(`  NULL: ${cvr.null_count} | empty string: ${cvr.empty_count} | has city: ${cvr.has_city}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
