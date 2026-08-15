import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

function generateUniqueSlugs(places: {id: string, name: string}[]) {
  const map = new Map<string, string>();
  const seen = new Set<string>();
  for (const p of places) {
    const baseSlug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    let slug = baseSlug;
    let count = 1;
    while (seen.has(slug)) {
      slug = `${baseSlug}-${count}`;
      count++;
    }
    seen.add(slug);
    map.set(p.id, slug);
  }
  return map;
}

function mapCategory(cat: string) {
  const c = cat.toUpperCase();
  const valid = ['FORT', 'HERITAGE', 'MUSEUM', 'MONUMENT', 'PARK', 'WILDLIFE', 'NATURE', 'WATERFALL', 'BEACH', 'CAVE', 'SPIRITUAL', 'SHOPPING'];
  return valid.includes(c) ? c as any : 'HERITAGE';
}

export async function seedPlaces(prisma: PrismaClient, adminId: string, touristId: string) {
  console.log('--- Seeding 03_places.ts ---');
  const startTime = Date.now();

  const dataPath = path.join(__dirname, '..', 'seed-data', 'places-wikidata.json');
  if (!fs.existsSync(dataPath)) {
    console.error('Error: places-wikidata.json not found. Run fetch-wikidata-places script first.');
    return [];
  }
  
  const raw = fs.readFileSync(dataPath, 'utf-8');
  const rawPlaces = JSON.parse(raw);
  console.log(`Loaded ${rawPlaces.length} premium places from Wikidata JSON.`);

  const slugMap = generateUniqueSlugs(
    rawPlaces.map((p: any) => ({ id: p.id, name: p.name })),
  );

  const transformed = rawPlaces.map((p: any) => {
    const slug = slugMap.get(p.id)!;
    const category = mapCategory(p.category);
    const tags = [];
    if (p.state) tags.push(p.state.toLowerCase().replace(/\s+/g, '-'));
    tags.push(category.toLowerCase());
    if (p.mustVisit) tags.push('must-visit');
    if (p.isHiddenGem) tags.push('hidden-gem');

    return {
      name: p.name,
      slug,
      description: p.description || p.name,
      shortDescription: p.description ? (p.description.slice(0, 120) + (p.description.length > 120 ? '...' : '')) : p.name,
      latitude: p.latitude,
      longitude: p.longitude,
      category,
      tags: [...new Set(tags)],
      images: [],
      city: p.city || 'India',
      state: p.state || 'India',
      country: p.country || 'India',
      rating: p.rating || 4.5,
      bestTimeToVisit: (p.bestTimeFrom && p.bestTimeTo) ? { from: p.bestTimeFrom, to: p.bestTimeTo } : undefined,
      bestTimeReason: p.bestTimeReason || 'Favorable weather and full access to the site.',
      hiddenGemScore: p.isHiddenGem ? 5 : 0,
      popularityScore: p.mustVisit ? 50 : 30,
      verificationLevel: 2,
      status: 'APPROVED',
      source: 'WIKIMEDIA' as any, 
      externalId: `wikidata:${p.id}`,
      submittedById: touristId,
      approvedById: adminId,
      reviewedAt: new Date(),
    };
  });

  console.log(`Skipping place seeding as per user request.`);
  console.log(`Finished in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

  return await prisma.place.findMany({
    where: { source: 'WIKIMEDIA', status: 'APPROVED' }
  });
}
