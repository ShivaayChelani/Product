/**
 * READ-ONLY inventory probe for the itinerary quality audit.
 * Lists places the engine can select around a destination and their metadata gaps.
 * Usage: npx ts-node scripts/audit-place-inventory.ts [cityQuery]
 */
import { prisma } from '../src/config/database';

async function main() {
  const city = process.argv[2] || 'Jabalpur';

  const byCity = await prisma.place.groupBy({
    by: ['city'],
    _count: { _all: true },
    where: { mergedIntoId: null, city: { contains: 'jabalpur', mode: 'insensitive' } },
  });
  console.log('== city counts (jabalpur-like) ==');
  console.log(JSON.stringify(byCity, null, 2));

  const places = await prisma.place.findMany({
    where: {
      mergedIntoId: null,
      status: 'APPROVED',
      OR: [
        { city: { contains: city, mode: 'insensitive' } },
        { district: { contains: city, mode: 'insensitive' } },
        { name: { contains: city, mode: 'insensitive' } },
      ],
    },
    select: {
      id: true, name: true, category: true, subcategory: true, tags: true,
      city: true, district: true, latitude: true, longitude: true,
      rating: true, reviewCount: true, openingHours: true, ticketPrice: true,
      estimatedDurationMinutes: true, recommendedDuration: true,
      popularityScore: true, hiddenGemScore: true, dataQuality: true, status: true, source: true,
    },
    orderBy: [{ popularityScore: 'desc' }, { rating: 'desc' }],
    take: 200,
  });

  console.log(`== ${places.length} candidate places ==`);
  let missingCoords = 0, missingHours = 0, missingFee = 0, missingDuration = 0;
  for (const p of places) {
    if (p.latitude == null || p.longitude == null) missingCoords++;
    if (!p.openingHours || Object.keys(p.openingHours as object).length === 0) missingHours++;
    if (!p.ticketPrice || Object.keys(p.ticketPrice as object).length === 0) missingFee++;
    if (p.estimatedDurationMinutes == null && !p.recommendedDuration) missingDuration++;
    console.log(
      [
        p.name.slice(0, 42).padEnd(42),
        (p.category || '').slice(0, 14).padEnd(14),
        `q:${p.dataQuality}`,
        `s:${p.status}`,
        `${p.latitude != null ? Number(p.latitude).toFixed(4) : 'NULL'},${p.longitude != null ? Number(p.longitude).toFixed(4) : 'NULL'}`,
        `r:${p.rating ?? '-'}`,
        `fee:${p.ticketPrice ? JSON.stringify(p.ticketPrice).slice(0, 40) : 'NULL'}`,
        `hrs:${p.openingHours ? JSON.stringify(p.openingHours).slice(0, 30) : 'NULL'}`,
        `dur:${p.estimatedDurationMinutes ?? p.recommendedDuration ?? 'NULL'}`,
      ].join(' | '),
    );
  }
  console.log(JSON.stringify({ total: places.length, missingCoords, missingHours, missingFee, missingDuration }, null, 2));
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
