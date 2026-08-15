/**
 * Connect directly to the database, scan all Place records (including the 26,000+ places),
 * and automatically convert any low-resolution Wikimedia Commons thumbnail URLs in the
 * 'images' array or 'thumbnail' string to original full-resolution HD image URLs.
 *
 * Run: node scripts/convert-db-images-to-hd.cjs
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function convertToHD(url) {
  if (url && url.includes('upload.wikimedia.org') && url.includes('/thumb/')) {
    const parts = url.split('/');
    const indexThumb = parts.indexOf('thumb');
    if (indexThumb !== -1) {
      parts.splice(indexThumb, 1);
      parts.pop();
      return parts.join('/');
    }
  }
  return url;
}

async function run() {
  console.log('=== Database HD Image Upgrade Script ===');
  console.log('Connecting to database...');

  try {
    // 1. Fetch all places with only required fields to save memory
    console.log('Fetching place records from database...');
    const places = await prisma.place.findMany({
      select: {
        id: true,
        images: true,
        thumbnail: true,
        name: true,
      },
    });

    console.log(`Retrieved ${places.length} total places. Scanning for low-res Wikimedia images...`);

    const updates = [];

    for (const place of places) {
      let updatedImages = null;
      let updatedThumbnail = null;

      // Scan images array
      if (place.images && Array.isArray(place.images)) {
        const converted = place.images.map((img) => convertToHD(img));
        const hasChange = converted.some((img, idx) => img !== place.images[idx]);
        if (hasChange) {
          updatedImages = converted;
        }
      }

      // Scan thumbnail
      if (place.thumbnail) {
        const convertedThumb = convertToHD(place.thumbnail);
        if (convertedThumb !== place.thumbnail) {
          updatedThumbnail = convertedThumb;
        }
      }

      if (updatedImages !== null || updatedThumbnail !== null) {
        updates.push({
          id: place.id,
          name: place.name,
          data: {
            ...(updatedImages !== null && { images: updatedImages }),
            ...(updatedThumbnail !== null && { thumbnail: updatedThumbnail }),
          },
        });
      }
    }

    console.log(`Found ${updates.length} places requiring HD image upgrades.`);

    if (updates.length === 0) {
      console.log('All places are already using HD image URLs! No updates needed.');
      return;
    }

    // 2. Perform sequential updates to respect the connection pool limit of 1
    console.log(`Starting sequential updates for ${updates.length} places...`);
    let count = 0;

    for (const up of updates) {
      await prisma.place.update({
        where: { id: up.id },
        data: up.data,
      });
      count++;
      if (count % 10 === 0 || count === updates.length) {
        console.log(`  [✓] Updated ${count} / ${updates.length} places...`);
      }
    }

    console.log('\n=== Upgrade Complete ===');
    console.log(`Successfully upgraded ${updates.length} places to full HD resolution in the database!`);
  } catch (err) {
    console.error('[Error] Execution failed:', err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
