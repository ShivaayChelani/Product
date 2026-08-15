import { PrismaClient, PlaceCategory, PlaceStatus, PlaceSource, Role, VendorStatus } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const NUM_PLACES = 100000;
const NUM_VENDORS = 100000;
const BATCH_SIZE = 5000;

// Helper to generate random coordinates within India bounds
// Lat: ~8.4 to ~37.6
// Lon: ~68.7 to ~97.2
function randomIndiaCoords() {
  const lat = 8.4 + Math.random() * (37.6 - 8.4);
  const lon = 68.7 + Math.random() * (97.2 - 68.7);
  return { lat, lon };
}

const CATEGORIES = [
  PlaceCategory.TEMPLE, PlaceCategory.MONUMENT, PlaceCategory.FORT,
  PlaceCategory.LAKE, PlaceCategory.WATERFALL, PlaceCategory.PARK,
  PlaceCategory.PALACE, PlaceCategory.MUSEUM, PlaceCategory.BEACH,
  PlaceCategory.TREKKING, PlaceCategory.WILDLIFE, PlaceCategory.SHOPPING,
  PlaceCategory.RESTAURANT, PlaceCategory.HOTEL, PlaceCategory.GHAT,
  PlaceCategory.OTHER
];

async function main() {
  console.log(`Starting bulk data generation: ${NUM_PLACES} Places, ${NUM_VENDORS} Vendors`);
  
  // 1. Generate Vendors
  console.log(`\n--- Generating ${NUM_VENDORS} Vendors ---`);
  const rawPw = process.env.SEED_VENDOR_PASSWORD;
  if (!rawPw) {
    console.error('FATAL: Missing SEED_VENDOR_PASSWORD environment variable. Aborting.');
    process.exit(1);
  }
  const defaultPassword = await bcrypt.hash(rawPw, 12);
  
  for (let i = 0; i < NUM_VENDORS; i += BATCH_SIZE) {
    const userBatch = [];
    const vendorBatch = [];
    
    for (let j = 0; j < Math.min(BATCH_SIZE, NUM_VENDORS - i); j++) {
      const idx = i + j;
      const userId = uuidv4();
      const vendorId = uuidv4();
      
      userBatch.push({
        id: userId,
        email: `testvendor${idx}@palsafar.com`,
        password: defaultPassword,
        name: `Test Vendor ${idx}`,
        permission: Role.VENDOR,
        activeMode: Role.VENDOR,
      });

      vendorBatch.push({
        id: vendorId,
        userId: userId,
        businessName: `Bulk Business ${idx}`,
        businessType: 'Restaurant',
        phone: '9999999999',
        address: `Test Address ${idx}`,
        city: 'Delhi',
        state: 'Delhi',
        status: VendorStatus.APPROVED,
        showOnMap: true,
      });
    }

    // Insert users
    await prisma.user.createMany({
      data: userBatch,
      skipDuplicates: true,
    });
    
    // Insert vendors
    await prisma.vendor.createMany({
      data: vendorBatch,
      skipDuplicates: true,
    });

    console.log(`Inserted ${Math.min(i + BATCH_SIZE, NUM_VENDORS)} / ${NUM_VENDORS} vendors`);
  }

  // 2. Generate Places
  console.log(`\n--- Generating ${NUM_PLACES} Places ---`);
  
  for (let i = 0; i < NUM_PLACES; i += BATCH_SIZE) {
    const placeBatch = [];
    
    for (let j = 0; j < Math.min(BATCH_SIZE, NUM_PLACES - i); j++) {
      const idx = i + j;
      const coords = randomIndiaCoords();
      const cat = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
      
      placeBatch.push({
        id: uuidv4(),
        name: `Bulk Place ${idx}`,
        slug: `bulk-place-${idx}-${uuidv4().substring(0, 8)}`,
        description: `This is a randomly generated place for load testing. Index ${idx}`,
        latitude: coords.lat,
        longitude: coords.lon,
        category: cat,
        city: 'Test City',
        state: 'Test State',
        country: 'India',
        status: PlaceStatus.APPROVED,
        source: PlaceSource.ADMIN,
        reviewCount: 0,
        popularityScore: Math.random() * 100,
        hiddenGemScore: Math.random() * 100,
        rating: 3 + Math.random() * 2,
      });
    }

    // Insert places
    await prisma.place.createMany({
      data: placeBatch as any,
      skipDuplicates: true,
    });

    console.log(`Inserted ${Math.min(i + BATCH_SIZE, NUM_PLACES)} / ${NUM_PLACES} places`);
  }
  
  console.log(`\n--- Bulk data generation complete! ---`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
