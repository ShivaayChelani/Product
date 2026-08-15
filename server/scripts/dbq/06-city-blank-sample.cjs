/**
 * Generate a random sample of 100 city_blank candidates for manual review.
 * Includes: placeId, name, current city, state, district, reason, source.
 */
process.env.DOTENV_CONFIG_PATH = __dirname + '/../../.env';
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH });

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL } },
});

const STATE_NAMES = new Set([
  'andhra pradesh','arunachal pradesh','assam','bihar','chhattisgarh','goa','gujarat','haryana',
  'himachal pradesh','jammu and kashmir','jharkhand','karnataka','kerala','ladakh','madhya pradesh',
  'maharashtra','manipur','meghalaya','mizoram','nagaland','odisha','punjab','rajasthan','sikkim',
  'tamil nadu','telangana','tripura','uttar pradesh','uttarakhand','west bengal',
  'andaman and nicobar islands','andaman and nicobar','daman and diu',
  'dadra and nagar haveli and daman and diu','lakshadweep','odissa','orissa','uttranchal',
]);
const CITY_OK_UT = new Set(['delhi', 'chandigarh', 'puducherry', 'pondicherry']);
const STATE_FRAGMENTS = new Set(['pradesh','nadu','bengal','khand','garh','desh']);
const ADMIN_UNIT_RE = /(tehsil|subdistrict|sub-district|block|taluk|taluka|mandal|zilla|jila|district|panchayat)$/i;

function classifyCity(city) {
  const c = String(city).trim();
  const lower = c.toLowerCase().replace(/\s+/g, ' ');

  let checkCity = lower;
  if (c.includes(',')) {
    const parts = c.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length === 2) {
      const second = parts[1].toLowerCase();
      if (STATE_NAMES.has(second)) checkCity = parts[0].toLowerCase();
    }
  }

  if (STATE_NAMES.has(checkCity) && !CITY_OK_UT.has(checkCity)) return 'city_is_state';
  if (STATE_FRAGMENTS.has(checkCity)) return 'city_is_fragment';
  if (ADMIN_UNIT_RE.test(c)) return 'admin_unit_as_city';
  return null;
}

async function main() {
  // Get all cities that need blanking
  const cityRows = await prisma.$queryRawUnsafe(`
    SELECT id, name, city, state, district, source
    FROM places
    WHERE merged_into_id IS NULL AND city IS NOT NULL AND city <> ''`);

  const candidates = [];
  for (const r of cityRows) {
    const reason = classifyCity(r.city);
    if (reason) {
      candidates.push({
        placeId: r.id,
        name: r.name,
        city: r.city,
        state: r.state,
        district: r.district,
        source: r.source,
        reason,
      });
    }
  }

  console.error(`Total city_blank candidates: ${candidates.length}`);

  // Stratified random sample: proportional from each reason category
  const byReason = {};
  for (const c of candidates) {
    if (!byReason[c.reason]) byReason[c.reason] = [];
    byReason[c.reason].push(c);
  }

  const SAMPLE_SIZE = 100;
  const sample = [];
  for (const [reason, items] of Object.entries(byReason)) {
    const proportion = items.length / candidates.length;
    const count = Math.max(1, Math.round(SAMPLE_SIZE * proportion));
    // Shuffle and pick
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    sample.push(...items.slice(0, count));
  }

  // Trim or pad to exactly 100
  while (sample.length > SAMPLE_SIZE) sample.pop();
  // If under 100, add more from largest category
  if (sample.length < SAMPLE_SIZE) {
    const largest = Object.values(byReason).sort((a, b) => b.length - a.length)[0];
    const existing = new Set(sample.map(s => s.placeId));
    for (const item of largest) {
      if (sample.length >= SAMPLE_SIZE) break;
      if (!existing.has(item.placeId)) sample.push(item);
    }
  }

  // Shuffle final sample
  for (let i = sample.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [sample[i], sample[j]] = [sample[j], sample[i]];
  }

  console.log(JSON.stringify(sample.slice(0, SAMPLE_SIZE), null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
