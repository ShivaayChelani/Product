/**
 * Read-only validation of test/demo/QA artifacts in production DB.
 */
import { prisma } from '../src/config/database';

async function main() {
  const plans = await prisma.subscriptionPlan.findMany({
    select: { id: true, name: true, slug: true, audience: true },
  });

  const testPlans = plans.filter(
    (p) =>
      /^(Test VENDOR Plan|Test CREATOR Plan)$/i.test(p.name) ||
      /^(test-vendor|test-creator|demo|sample|qa|mock)/i.test(p.slug) ||
      /^(demo|sample|qa|mock|test)/i.test(p.name),
  );

  const itinPlaces = await prisma.place.findMany({
    where: {
      OR: [
        { name: { startsWith: 'ItinTest', mode: 'insensitive' } },
        { name: { startsWith: 'Test', mode: 'insensitive' } },
        { name: { startsWith: 'Demo', mode: 'insensitive' } },
        { name: { startsWith: 'Sample', mode: 'insensitive' } },
        { name: { startsWith: 'QA', mode: 'insensitive' } },
        { name: { startsWith: 'Mock', mode: 'insensitive' } },
        { slug: { startsWith: 'test-' } },
      ],
    },
    take: 100,
    select: { id: true, name: true, slug: true, city: true, state: true },
  });

  const testCities = await prisma.$queryRaw<{ city: string | null; state: string | null; cnt: bigint }[]>`
    SELECT city, state, COUNT(*)::bigint AS cnt
    FROM places
    WHERE city ILIKE 'Test%' OR city ILIKE 'Demo%' OR city ILIKE 'Sample%'
       OR state ILIKE 'Test%' OR state ILIKE 'Demo%'
       OR city IN ('TestState', 'TestCity', 'TestVille', 'ItinTestVille')
    GROUP BY city, state
    ORDER BY cnt DESC
    LIMIT 30
  `;

  const testUsers = await prisma.user.findMany({
    where: {
      OR: [
        { email: { endsWith: '@example.test' } },
        { email: { startsWith: 'test' } },
        { email: { startsWith: 'demo' } },
        { email: { startsWith: 'mock' } },
        { email: { startsWith: 'qa' } },
      ],
    },
    select: { id: true, email: true, name: true },
  });

  const itinTrips = await prisma.tripPlan.count({
    where: { destination: { contains: 'ItinTest', mode: 'insensitive' } },
  });

  const subs = await prisma.userSubscription.findMany({
    include: { plan: { select: { name: true, slug: true } } },
  });
  const testSubs = subs.filter(
    (s) =>
      /^(test-vendor|test-creator|demo|sample|qa|mock)/i.test(s.plan.slug) ||
      /test|demo|sample|qa|mock/i.test(s.plan.name),
  );

  const tx = await prisma.paymentTransaction.findMany({
    where: {
      OR: [
        { description: { contains: 'test', mode: 'insensitive' } },
        { description: { contains: 'demo', mode: 'insensitive' } },
        { providerOrderId: { startsWith: 'order_test' } },
      ],
    },
    take: 50,
    select: { id: true, description: true, providerOrderId: true, status: true },
  });

  const notifs = await prisma.inAppNotification.count({
    where: {
      OR: [
        { title: { contains: 'test', mode: 'insensitive' } },
        { title: { contains: 'demo', mode: 'insensitive' } },
        { title: { contains: 'qa', mode: 'insensitive' } },
      ],
    },
  });

  const announcements = await prisma.announcement?.count
    ? await (prisma as any).announcement.count({
        where: {
          OR: [
            { title: { contains: 'test', mode: 'insensitive' } },
            { title: { contains: 'demo', mode: 'insensitive' } },
          ],
        },
      })
    : 0;

  console.log(
    JSON.stringify(
      {
        totals: {
          plans: plans.length,
          places: await prisma.place.count(),
          users: await prisma.user.count(),
          subscriptions: subs.length,
          invoices: await prisma.invoice.count(),
          transactions: await prisma.paymentTransaction.count(),
        },
        testPlans,
        itinPlacesCount: itinPlaces.length,
        itinPlacesSample: itinPlaces.slice(0, 20),
        testCities,
        testUsers,
        itinTrips,
        testSubs: testSubs.map((s) => ({ id: s.id, plan: s.plan.name, status: s.status })),
        testTransactions: tx,
        testNotifications: notifs,
        testAnnouncements: announcements,
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
