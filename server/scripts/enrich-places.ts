/**
 * @deprecated DO NOT USE — generates fabricated descriptions and guessed seasons.
 * Use scripts/jobs/run-factual-enrichment.ts (Wikidata/OSM/Nominatim only).
 */
import fs from 'fs';
import path from 'path';

const dataPath = path.join(__dirname, '../prisma/seed-data/places-curated.json');

function getSeason(state: string, category: string): { from: string, to: string, label: string } {
  // Rough geographic season mapping
  const lowerState = state.toLowerCase();
  if (['himachal pradesh', 'uttarakhand', 'jammu', 'kashmir', 'sikkim', 'arunachal'].some(s => lowerState.includes(s))) {
    if (category === 'hill_station') return { from: 'March', to: 'June', label: 'Summer' };
    return { from: 'September', to: 'November', label: 'Autumn' };
  }
  if (['rajasthan', 'gujarat', 'madhya pradesh', 'uttar pradesh', 'delhi'].some(s => lowerState.includes(s))) {
    return { from: 'October', to: 'March', label: 'Winter' };
  }
  if (['kerala', 'goa', 'karnataka', 'tamil nadu', 'andaman'].some(s => lowerState.includes(s))) {
    return { from: 'November', to: 'February', label: 'Winter' };
  }
  if (['maharashtra'].some(s => lowerState.includes(s))) {
    if (category === 'hill_station') return { from: 'June', to: 'September', label: 'Monsoon' };
    return { from: 'October', to: 'February', label: 'Winter' };
  }
  return { from: 'October', to: 'March', label: 'Winter' };
}

function generateDescription(name: string, city: string, state: string, category: string): string {
  return `${name} is one of the most remarkable and prominent destinations located in ${city}, ${state}. As a highly rated ${category.replace('_', ' ')}, it attracts numerous visitors looking for a unique and memorable experience. The rich cultural heritage and beautiful surroundings make it a must-visit spot on any travel itinerary. Plan your trip properly and enjoy the incredible vibes of ${name}.`;
}

function enrich() {
  const rawData = fs.readFileSync(dataPath, 'utf8');
  const places = JSON.parse(rawData);

  let updatedCount = 0;

  for (const place of places) {
    let modified = false;

    // 1. Enrich tags
    if (!place.tags || place.tags.length === 0) {
      const stateTag = (place.state || '').toLowerCase().replace(/\s+/g, '-');
      const catTag = (place.category || '').toLowerCase().replace(/\s+/g, '-');
      place.tags = [stateTag, catTag, 'india'];
      if (place.mustVisit) place.tags.push('popular');
      if (place.isHiddenGem) place.tags.push('hidden-gem');
      modified = true;
    }

    // 2. Enrich description
    if (!place.description || place.description.length < 50) {
      place.description = generateDescription(place.name, place.city, place.state, place.category);
      place.shortDescription = place.description.substring(0, 150) + '...';
      modified = true;
    }

    // 3. Enrich best time to visit
    if (!place.bestTimeFrom || !place.bestTimeTo) {
      const season = getSeason(place.state || '', place.category || '');
      place.bestTimeFrom = season.from;
      place.bestTimeTo = season.to;
      place.bestTime = season.label;
      modified = true;
    }

    if (modified) {
      updatedCount++;
    }
  }

  fs.writeFileSync(dataPath, JSON.stringify(places, null, 2), 'utf8');
  console.log(`Enriched ${updatedCount} places successfully.`);
}

enrich();
