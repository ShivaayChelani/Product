/**
 * Fetch authoritative place candidates from Wikidata (coordinates required).
 * Does NOT invent data — only stores Wikidata labels/descriptions and P625 coords.
 *
 * Usage: ts-node scripts/wikidata-coverage-fetch.ts --out=prisma/seed-data/wikidata-coverage-pending.json
 */
import fs from 'fs';
import path from 'path';
import { isJunkPlaceName } from '../src/shared/utils/placeNameQuality';

type CoverageRow = {
  wikidataId: string;
  name: string;
  description: string | null;
  latitude: number;
  longitude: number;
  category: string;
  tags: string[];
  sourceUri: string;
};

const QUERIES: { category: string; tags: string[]; sparql: string }[] = [
  {
    category: 'heritage',
    tags: ['unesco', 'world_heritage'],
    sparql: `
SELECT ?item ?itemLabel ?itemDescription ?coord WHERE {
  ?item wdt:P1435 wd:Q9259 .
  ?item wdt:P17 wd:Q668 .
  ?item wdt:P625 ?coord .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,hi". }
}
LIMIT 500`,
  },
  {
    category: 'national_park',
    tags: ['national_park', 'wildlife'],
    sparql: `
SELECT ?item ?itemLabel ?itemDescription ?coord WHERE {
  ?item wdt:P31/wdt:P279* wd:Q46169 .
  ?item wdt:P17 wd:Q668 .
  ?item wdt:P625 ?coord .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT 800`,
  },
  {
    category: 'fort',
    tags: ['fort', 'heritage'],
    sparql: `
SELECT ?item ?itemLabel ?itemDescription ?coord WHERE {
  ?item wdt:P31/wdt:P279* wd:Q57821 .
  ?item wdt:P17 wd:Q668 .
  ?item wdt:P625 ?coord .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT 800`,
  },
  {
    category: 'temple',
    tags: ['temple', 'pilgrimage'],
    sparql: `
SELECT ?item ?itemLabel ?itemDescription ?coord WHERE {
  ?item wdt:P31/wdt:P279* wd:Q44539 .
  ?item wdt:P17 wd:Q668 .
  ?item wdt:P625 ?coord .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,hi". }
}
LIMIT 2000`,
  },
  {
    category: 'palace',
    tags: ['palace', 'heritage'],
    sparql: `
SELECT ?item ?itemLabel ?itemDescription ?coord WHERE {
  ?item wdt:P31/wdt:P279* wd:Q16560 .
  ?item wdt:P17 wd:Q668 .
  ?item wdt:P625 ?coord .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT 600`,
  },
  {
    category: 'museum',
    tags: ['museum', 'heritage'],
    sparql: `
SELECT ?item ?itemLabel ?itemDescription ?coord WHERE {
  ?item wdt:P31/wdt:P279* wd:Q33506 .
  ?item wdt:P17 wd:Q668 .
  ?item wdt:P625 ?coord .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT 800`,
  },
  {
    category: 'waterfall',
    tags: ['waterfall', 'nature'],
    sparql: `
SELECT ?item ?itemLabel ?itemDescription ?coord WHERE {
  ?item wdt:P31/wdt:P279* wd:Q34038 .
  ?item wdt:P17 wd:Q668 .
  ?item wdt:P625 ?coord .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT 500`,
  },
  {
    category: 'beach',
    tags: ['beach', 'nature'],
    sparql: `
SELECT ?item ?itemLabel ?itemDescription ?coord WHERE {
  ?item wdt:P31/wdt:P279* wd:Q40080 .
  ?item wdt:P17 wd:Q668 .
  ?item wdt:P625 ?coord .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT 600`,
  },
  {
    category: 'lake',
    tags: ['lake', 'nature'],
    sparql: `
SELECT ?item ?itemLabel ?itemDescription ?coord WHERE {
  ?item wdt:P31/wdt:P279* wd:Q23397 .
  ?item wdt:P17 wd:Q668 .
  ?item wdt:P625 ?coord .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT 800`,
  },
  {
    category: 'cave',
    tags: ['cave', 'heritage'],
    sparql: `
SELECT ?item ?itemLabel ?itemDescription ?coord WHERE {
  ?item wdt:P31/wdt:P279* wd:Q35509 .
  ?item wdt:P17 wd:Q668 .
  ?item wdt:P625 ?coord .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT 400`,
  },
  {
    category: 'monument',
    tags: ['monument', 'heritage'],
    sparql: `
SELECT ?item ?itemLabel ?itemDescription ?coord WHERE {
  ?item wdt:P31/wdt:P279* wd:Q4989906 .
  ?item wdt:P17 wd:Q668 .
  ?item wdt:P625 ?coord .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT 1000`,
  },
  {
    category: 'viewpoint',
    tags: ['viewpoint', 'trek'],
    sparql: `
SELECT ?item ?itemLabel ?itemDescription ?coord WHERE {
  ?item wdt:P31/wdt:P279* wd:Q618123 .
  ?item wdt:P17 wd:Q668 .
  ?item wdt:P625 ?coord .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT 200`,
  },
];

function parseCoord(raw: string): { lat: number; lng: number } | null {
  const m = raw.match(/Point\(([-0-9.]+)\s+([-0-9.]+)\)/i);
  if (!m) return null;
  const lng = parseFloat(m[1]);
  const lat = parseFloat(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

async function runSparql(sparql: string): Promise<any[]> {
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'PalSafar-CoverageBot/1.0 (canonical tourism; contact: admin@palsafar.local)' },
      });
      if (res.ok) {
        const json = (await res.json()) as { results?: { bindings: any[] } };
        return json.results?.bindings ?? [];
      }
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 4000 * (attempt + 1)));
        continue;
      }
      throw new Error(`Wikidata query failed: ${res.status}`);
    } catch (err) {
      if (attempt >= 2) throw err;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  return [];
}

async function main() {
  const outArg = process.argv.find((a) => a.startsWith('--out='));
  const outPath = path.resolve(outArg?.split('=')[1] || 'prisma/seed-data/wikidata-coverage-pending.json');

  const byId = new Map<string, CoverageRow>();

  for (const q of QUERIES) {
    try {
      const bindings = await runSparql(q.sparql);
      for (const b of bindings) {
        const item = String(b.item?.value || '');
        const qid = item.split('/').pop() || '';
        if (!qid.startsWith('Q')) continue;
        const coord = parseCoord(String(b.coord?.value || ''));
        if (!coord) continue;

        const name = String(b.itemLabel?.value || '').trim();
        if (!name || isJunkPlaceName(name)) continue;

        const description = b.itemDescription?.value
          ? String(b.itemDescription.value).trim()
          : null;

        const externalId = `wikidata:${qid}`;
        if (!byId.has(externalId)) {
          byId.set(externalId, {
            wikidataId: qid,
            name,
            description: description && description.length >= 40 ? description : null,
            latitude: coord.lat,
            longitude: coord.lng,
            category: q.category,
            tags: q.tags,
            sourceUri: `https://www.wikidata.org/wiki/${qid}`,
          });
        }
      }
      console.log(`Fetched batch ${q.category}: total unique ${byId.size}`);
    } catch (err) {
      console.warn(`Batch ${q.category} failed (continuing):`, (err as Error).message);
    }
  }

  const rows = [...byId.values()];
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({ fetchedAt: new Date().toISOString(), rows }, null, 2));
  console.log(`Wrote ${rows.length} sourced rows to ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
