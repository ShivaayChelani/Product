/**
 * Automatically fill all missing images and thumbnails for all 26,000+ places
 * in the database with beautiful, category-specific high-definition Unsplash fallback images.
 *
 * Run: node scripts/fill-empty-images-with-hd.cjs
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Curated Category to HD Unsplash Image mapping (all direct, high-quality, high-res photos)
const CATEGORY_IMAGES = {
  temple: 'https://images.unsplash.com/photo-1602631985686-2bb0f30109bb?w=1200&q=80',
  fort: 'https://images.unsplash.com/photo-1609137144814-5d51d8b67198?w=1200&q=80',
  palace: 'https://images.unsplash.com/photo-1599661046289-e31897846e41?w=1200&q=80',
  heritage: 'https://images.unsplash.com/photo-1582510003544-4d00b7f74220?w=1200&q=80',
  lake: 'https://images.unsplash.com/photo-1615959189202-9812903762ac?w=1200&q=80',
  waterfall: 'https://images.unsplash.com/photo-1432406186174-2b24f4860367?w=1200&q=80',
  park: 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=1200&q=80',
  wildlife: 'https://images.unsplash.com/photo-1602491453979-02654b52720e?w=1200&q=80',
  nature: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1200&q=80',
  garden: 'https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?w=1200&q=80',
  museum: 'https://images.unsplash.com/photo-1566121318484-63d0012e524d?w=1200&q=80',
  church: 'https://images.unsplash.com/photo-1438032005730-c779502df39b?w=1200&q=80',
  adventure: 'https://images.unsplash.com/photo-1502680390469-be75c86b636f?w=1200&q=80',
  cultural: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1200&q=80',
  spiritual: 'https://images.unsplash.com/photo-1545128485-c400e7702796?w=1200&q=80',
  river: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1200&q=80',
  viewpoint: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1200&q=80',
  ghat: 'https://images.unsplash.com/photo-1561361513-2d000a50f0db?w=1200&q=80',
  default: 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=1200&q=80', // travel guide book background
};

async function run() {
  console.log('=== Database Empty Image Filler ===');
  console.log('Connecting to database...');

  try {
    // Retrieve only places with missing images or thumbnails
    console.log('Fetching place records requiring image assignment...');
    const places = await prisma.place.findMany({
      where: {
        OR: [
          { thumbnail: null },
          { thumbnail: '' },
          { images: { equals: [] } },
          { images: { equals: null } }
        ]
      },
      select: {
        id: true,
        category: true,
        thumbnail: true,
        images: true,
      }
    });

    console.log(`Found ${places.length} places needing images. Starting assignment...`);

    const updates = [];

    for (const place of places) {
      const cat = place.category ? place.category.toLowerCase() : 'default';
      const fallbackUrl = CATEGORY_IMAGES[cat] || CATEGORY_IMAGES.default;

      const data = {};
      let needsUpdate = false;

      if (!place.thumbnail || place.thumbnail === '') {
        data.thumbnail = fallbackUrl;
        needsUpdate = true;
      }

      if (!place.images || !Array.isArray(place.images) || place.images.length === 0) {
        data.images = [fallbackUrl];
        needsUpdate = true;
      }

      if (needsUpdate) {
        updates.push({
          id: place.id,
          data,
        });
      }
    }

    console.log(`Prepared ${updates.length} updates. Running sequential execution...`);

    let count = 0;
    for (const up of updates) {
      try {
        await prisma.place.update({
          where: { id: up.id },
          data: up.data,
        });
      } catch (err) {
        // Log warning and continue
        console.warn(`[Warning] Failed to update place ID: ${up.id}. Error: ${err.message}. Skipping...`);
      }
      count++;
      if (count % 1000 === 0 || count === updates.length) {
        console.log(`  [✓] Processed ${count} / ${updates.length} places...`);
      }
    }

    console.log('\n=== Fill Operations Completed Successfully ===');
    console.log(`Assigned high-definition category fallbacks to ${updates.length} places!`);
  } catch (err) {
    console.error('[Error] Execution failed:', err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
