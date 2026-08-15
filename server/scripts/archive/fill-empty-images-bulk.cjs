/**
 * Bulk fill all missing images and thumbnails for all 26,000+ places
 * using high-performance SQL bulk updates grouped by category.
 *
 * Run: node scripts/fill-empty-images-bulk.cjs
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

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
  default: 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=1200&q=80',
};

async function run() {
  console.log('=== Database High-Performance Bulk Image Filler ===');
  console.log('Connecting to database...');

  try {
    let totalUpdated = 0;

    // 1. Run category-specific bulk updates
    for (const [category, url] of Object.entries(CATEGORY_IMAGES)) {
      if (category === 'default') continue;

      console.log(`Updating category '${category}' with HD image URL...`);

      // Update empty thumbnails
      const updatedThumb = await prisma.$executeRawUnsafe(`
        UPDATE places 
        SET thumbnail = $1
        WHERE LOWER(category) = $2 AND (thumbnail IS NULL OR thumbnail = '');
      `, url, category);

      // Update empty images array
      const updatedImages = await prisma.$executeRawUnsafe(`
        UPDATE places 
        SET images = ARRAY[$1]::text[]
        WHERE LOWER(category) = $2 AND (images IS NULL OR cardinality(images) = 0);
      `, url, category);

      totalUpdated += (updatedThumb + updatedImages);
    }

    // 2. Run fallback default update for any remaining places
    console.log('Applying default fallback for any remaining unmatched categories...');
    const defaultUrl = CATEGORY_IMAGES.default;

    const defaultThumb = await prisma.$executeRawUnsafe(`
      UPDATE places 
      SET thumbnail = $1
      WHERE (thumbnail IS NULL OR thumbnail = '');
    `, defaultUrl);

    const defaultImages = await prisma.$executeRawUnsafe(`
      UPDATE places 
      SET images = ARRAY[$1]::text[]
      WHERE (images IS NULL OR cardinality(images) = 0);
    `, defaultUrl);

    totalUpdated += (defaultThumb + defaultImages);

    console.log('\n=== Bulk Upgrades Completed Successfully ===');
    console.log(`Total database columns populated: ${totalUpdated}`);
  } catch (err) {
    console.error('[Error] Execution failed:', err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
