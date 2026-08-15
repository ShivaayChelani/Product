process.env.DOTENV_CONFIG_PATH = __dirname + '/../../.env';
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH });
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });

async function main() {
  const r = await p.$queryRawUnsafe(`
    SELECT id, name, latitude::double precision as lat, longitude::double precision as lng
    FROM places WHERE merged_into_id IS NULL AND source = 'WIKIMEDIA'
      AND (state IS NULL OR state = '') AND latitude IS NOT NULL AND longitude IS NOT NULL
    ORDER BY id LIMIT 5`);
  for (const place of r) {
    const params = new URLSearchParams({
      lat: String(place.lat), lon: String(place.lng),
      format: 'jsonv2', addressdetails: '1', zoom: '10',
    });
    const url = 'https://nominatim.openstreetmap.org/reverse?' + params;
    const res = await fetch(url, { headers: { 'User-Agent': 'PalSafar-Test/1.0' } });
    const json = await res.json();
    const country = json.address?.country || '';
    const state = json.address?.state || '';
    const codes = [...country].map(c => 'U+' + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0'));
    console.log(`${place.name} | country=${country} [${codes.join(',')}] | state=${state}`);
    await new Promise(r => setTimeout(r, 1200));
  }
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => p.$disconnect());
