/**
 * Quick read-only audit of dev/test/demo data in the database.
 * Usage: npx ts-node scripts/audit-dev-data.ts
 */
import { prisma } from '../src/config/database';
import { CANONICAL_KEEP_EMAILS } from '../src/config/db-seed';

const DEMO_CREATOR_EMAILS = [
  'rahul@palsafar.com',
  'explore@palsafar.com',
  'wander@palsafar.com',
  'hunter@palsafar.com',
  'mpexp@palsafar.com',
  'bharat@palsafar.com',
  'aman@palsafar.com',
  'discover@palsafar.com',
  'roadtrip@palsafar.com',
  'official@palsafar.com',
  'tourist@palsafar.com',
];

async function main() {
  const protectedSet = new Set<string>(CANONICAL_KEEP_EMAILS);

  const demoUsers = await prisma.user.findMany({
    where: {
      OR: [
        { email: { in: DEMO_CREATOR_EMAILS } },
        { email: { startsWith: 'vendor_user_' } },
        { email: { startsWith: 'testvendor' } },
        { email: { startsWith: 'qa_user_' } },
        { email: { endsWith: '@example.test' } },
        { email: { startsWith: 'test@' } },
        { email: { startsWith: 'demo@' } },
        { email: { startsWith: 'dummy@' } },
        { email: { startsWith: 'sample@' } },
        { email: { startsWith: 'fake@' } },
        { email: { startsWith: 'temp@' } },
        { email: { contains: '@example.com' } },
      ],
      NOT: { email: { in: [...protectedSet] } },
    },
    select: { id: true, email: true, name: true, permission: true },
  });

  const bulkPlaces = await prisma.place.count({
    where: {
      OR: [
        { slug: { startsWith: 'bulk-place' } },
        { name: { startsWith: 'Bulk Place', mode: 'insensitive' } },
      ],
    },
  });

  const testPlaces = await prisma.place.count({
    where: {
      OR: [
        { name: { startsWith: 'Test Place', mode: 'insensitive' } },
        { name: { startsWith: 'Test Red Fort', mode: 'insensitive' } },
        { name: { startsWith: 'Test Hawa Mahal', mode: 'insensitive' } },
        { name: { startsWith: 'Test Marble Rocks', mode: 'insensitive' } },
        { slug: { startsWith: 'test-' } },
      ],
    },
  });

  const junkRows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count
    FROM places
    WHERE merged_into_id IS NULL
      AND (
        LOWER(TRIM(name)) IN (
          'sample', 'test', 'dummy', 'placeholder', 'foobar',
          'test place', 'dummy place', 'fake', 'lorem ipsum'
        )
        OR slug ILIKE 'bulk-place%'
      )
  `;

  const zeroCoordPlaces = await prisma.place.count({
    where: { latitude: 0, longitude: 0 },
  });

  const totalUsers = await prisma.user.count();
  const totalPlaces = await prisma.place.count();

  console.log(
    JSON.stringify(
      {
        totalUsers,
        totalPlaces,
        demoUserCount: demoUsers.length,
        demoUsers: demoUsers.slice(0, 30),
        bulkPlaces,
        testPlaces,
        junkPlaces: Number(junkRows[0]?.count ?? 0),
        zeroCoordPlaces,
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
