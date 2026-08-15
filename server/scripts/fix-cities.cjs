const { PrismaClient } = require('@prisma/client');
const cities = require('all-the-cities');
const prisma = new PrismaClient();

const indianCities = cities.filter(city => city.country === 'IN');

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c;
}

function findNearestCity(lat, lon) {
  let minDistance = Infinity;
  let nearestCity = null;
  for (const city of indianCities) {
    const dist = getDistance(lat, lon, city.loc.coordinates[1], city.loc.coordinates[0]);
    if (dist < minDistance) {
      minDistance = dist;
      nearestCity = city;
    }
  }
  return nearestCity;
}

async function main() {
  console.log(`Loaded ${indianCities.length} Indian cities for reference.`);
  
  const places = await prisma.place.findMany({
    where: { city: '' },
    select: { id: true, name: true, latitude: true, longitude: true }
  });

  console.log(`Found ${places.length} places missing city information.`);

  let sql = `UPDATE "places" SET "city" = CASE "id" \n`;
  const ids = [];

  for (const p of places) {
    const nearest = findNearestCity(p.latitude, p.longitude);
    if (nearest) {
      const safeCity = nearest.name.replace(/'/g, "''");
      sql += `  WHEN '${p.id}' THEN '${safeCity}'\n`;
      ids.push(`'${p.id}'`);
    }
  }
  
  if (ids.length === 0) {
    console.log("Nothing to update.");
    return;
  }

  sql += `END WHERE "id" IN (${ids.join(',')});`;

  console.log(`Executing raw SQL query for ${ids.length} rows...`);
  await prisma.$executeRawUnsafe(sql);
  console.log("Done!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
