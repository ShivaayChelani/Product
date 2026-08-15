/**
 * Production dev/test/demo/QA data cleanup (release freeze).
 *
 * Removes HIGH-CONFIDENCE test/demo records only. Real beta users and tourism places preserved.
 *
 * Usage:
 *   npx ts-node scripts/production-dev-data-cleanup.ts --dry-run
 *   npx ts-node scripts/production-dev-data-cleanup.ts --apply --confirm=I_UNDERSTAND_PRODUCTION
 */
import { prisma } from '../src/config/database';
import { CANONICAL_KEEP_EMAILS } from '../src/config/db-seed';
import fs from 'fs';
import path from 'path';

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

const TEST_CITIES = ['TestState', 'TestCity', 'TestVille', 'ItinTestVille'] as const;

type RowCounts = {
  users: number;
  places: number;
  subscriptionPlans: number;
  userSubscriptions: number;
  planPrices: number;
  paymentTransactions: number;
  invoices: number;
  refunds: number;
  coupons: number;
  inAppNotifications: number;
  announcements: number;
  tripPlans: number;
};

type TableRemovals = Record<string, number>;

type CleanupReport = {
  mode: 'dry-run' | 'apply';
  timestamp: string;
  before: RowCounts;
  after: RowCounts;
  removed: TableRemovals;
  matched: {
    users: string[];
    places: Array<{ id: string; name: string; slug: string }>;
    plans: Array<{ id: string; name: string; slug: string }>;
    subscriptions: number;
    tripPlans: number;
    notifications: number;
    announcements: number;
    payments: number;
    coupons: number;
  };
  validation: Record<string, { pass: boolean; count: number }>;
  manualReview: string[];
  preserved: string[];
  rollback: { backupJson: string; rollbackSql: string };
};

function parseArgs() {
  const dryRun = !process.argv.includes('--apply');
  const confirm = process.argv.find((a) => a.startsWith('--confirm='))?.split('=')[1];
  return { dryRun, confirm };
}

function isDemoUserEmail(email: string): boolean {
  const protectedSet = new Set<string>(CANONICAL_KEEP_EMAILS);
  if (protectedSet.has(email)) return false;

  if (DEMO_CREATOR_EMAILS.includes(email)) return true;
  if (email.endsWith('@example.test')) return true;
  if (/^vendor_user_\d+@palsafar\.com$/.test(email)) return true;
  if (/^testvendor\d+@palsafar\.com$/.test(email)) return true;
  if (/^qa_user_\d+@palsafar\.com$/.test(email)) return true;
  if (/^(test|demo|dummy|sample|fake|temp|mock|qa)@/i.test(email)) return true;
  if (/^test[^@]*@/i.test(email) && !email.includes('@palsafar.com')) return true;
  if (/^demo[^@]*@/i.test(email) && !email.includes('@palsafar.com')) return true;
  if (/^mock[^@]*@/i.test(email)) return true;
  if (/^qa[^@]*@/i.test(email) && !email.includes('@palsafar.com')) return true;

  return false;
}

function isTestPlan(name: string, slug: string): boolean {
  if (/^(Test VENDOR Plan|Test CREATOR Plan)$/i.test(name)) return true;
  if (/^(test-vendor|test-creator|demo|sample|qa|mock)/i.test(slug)) return true;
  if (/^(demo|sample|qa|mock)\b/i.test(name) && !/^(vendor|creator|user)-/i.test(slug)) return true;
  return false;
}

async function countRows(): Promise<RowCounts> {
  const [
    users,
    places,
    subscriptionPlans,
    userSubscriptions,
    planPrices,
    paymentTransactions,
    invoices,
    refunds,
    coupons,
    inAppNotifications,
    announcements,
    tripPlans,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.place.count(),
    prisma.subscriptionPlan.count(),
    prisma.userSubscription.count(),
    prisma.planPrice.count(),
    prisma.paymentTransaction.count(),
    prisma.invoice.count(),
    prisma.refund.count(),
    prisma.coupon.count(),
    prisma.inAppNotification.count(),
    prisma.announcement.count(),
    prisma.tripPlan.count(),
  ]);

  return {
    users,
    places,
    subscriptionPlans,
    userSubscriptions,
    planPrices,
    paymentTransactions,
    invoices,
    refunds,
    coupons,
    inAppNotifications,
    announcements,
    tripPlans,
  };
}

async function findDemoUsers() {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true },
  });
  return users.filter((u) => isDemoUserEmail(u.email));
}

async function findTestPlans() {
  const plans = await prisma.subscriptionPlan.findMany({
    select: { id: true, name: true, slug: true },
  });
  return plans.filter((p) => isTestPlan(p.name, p.slug));
}

async function findTestPlaces() {
  const byPattern = await prisma.place.findMany({
    where: {
      OR: [
        { name: { startsWith: 'ItinTest', mode: 'insensitive' } },
        { slug: { startsWith: 'bulk-place' } },
        { name: { startsWith: 'Bulk Place', mode: 'insensitive' } },
        { name: { startsWith: 'Test Place', mode: 'insensitive' } },
        { name: { startsWith: 'Test Red Fort', mode: 'insensitive' } },
        { name: { startsWith: 'Test Hawa Mahal', mode: 'insensitive' } },
        { name: { startsWith: 'Test Marble Rocks', mode: 'insensitive' } },
        { name: { startsWith: 'Demo ', mode: 'insensitive' } },
        { name: { startsWith: 'Sample ', mode: 'insensitive' } },
        { name: { startsWith: 'Mock ', mode: 'insensitive' } },
        { name: { startsWith: 'QA ', mode: 'insensitive' } },
        { slug: { startsWith: 'test-' } },
        { city: { in: [...TEST_CITIES] } },
        { state: { in: ['TestState', 'TestCity'] } },
        { latitude: 0, longitude: 0 },
      ],
    },
    select: { id: true, name: true, slug: true },
  });

  const junkRows = await prisma.$queryRaw<{ id: string; name: string; slug: string }[]>`
    SELECT id, name, slug
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

  const seen = new Set<string>();
  return [...byPattern, ...junkRows].filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
}

async function findTestTripPlanIds(): Promise<string[]> {
  const trips = await prisma.tripPlan.findMany({
    where: {
      OR: [
        { destination: { contains: 'ItinTest', mode: 'insensitive' } },
        { destination: { in: [...TEST_CITIES] } },
        { title: { startsWith: 'ItinTest', mode: 'insensitive' } },
      ],
    },
    select: { id: true },
  });
  return trips.map((t) => t.id);
}

async function findTestNotifications() {
  return prisma.inAppNotification.findMany({
    where: {
      OR: [
        { title: { contains: 'test', mode: 'insensitive' } },
        { title: { contains: 'demo', mode: 'insensitive' } },
        { title: { contains: 'qa', mode: 'insensitive' } },
        { body: { contains: 'test fixture', mode: 'insensitive' } },
      ],
    },
    select: { id: true },
  });
}

async function findTestAnnouncements() {
  return prisma.announcement.findMany({
    where: {
      OR: [
        { title: { contains: 'test', mode: 'insensitive' } },
        { title: { contains: 'demo', mode: 'insensitive' } },
        { title: { contains: 'qa', mode: 'insensitive' } },
        { title: { contains: 'mock', mode: 'insensitive' } },
      ],
    },
    select: { id: true },
  });
}

async function findTestCoupons() {
  return prisma.coupon.findMany({
    where: {
      OR: [
        { code: { startsWith: 'test', mode: 'insensitive' } },
        { code: { startsWith: 'demo', mode: 'insensitive' } },
        { code: { startsWith: 'qa', mode: 'insensitive' } },
        { code: { startsWith: 'mock', mode: 'insensitive' } },
      ],
    },
    select: { id: true, code: true },
  });
}

async function findTestPaymentTransactionIds(planIds: string[]): Promise<string[]> {
  const rows = await prisma.paymentTransaction.findMany({
    where: {
      OR: [
        { subscription: { planId: { in: planIds } } },
        { description: { contains: 'test', mode: 'insensitive' } },
        { description: { contains: 'demo', mode: 'insensitive' } },
        { providerOrderId: { startsWith: 'order_test' } },
      ],
    },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

async function findManualReviewItems(): Promise<string[]> {
  const items: string[] = [];

  const suspiciousUsers = await prisma.user.findMany({
    where: {
      email: { notIn: [...CANONICAL_KEEP_EMAILS] },
      OR: [
        { name: { contains: 'Test', mode: 'insensitive' } },
        { name: { contains: 'Demo', mode: 'insensitive' } },
        { name: { equals: 'Creator Account' } },
      ],
      NOT: { email: { endsWith: '@example.test' } },
    },
    select: { email: true, name: true },
  });

  for (const u of suspiciousUsers) {
    if (!isDemoUserEmail(u.email)) {
      items.push(`User "${u.name}" <${u.email}> — suspicious name; verify before delete`);
    }
  }

  const disposableDomains = ['luckfeed.com', 'mailinator.com', 'yopmail.com', 'tempmail.com'];
  for (const domain of disposableDomains) {
    const rows = await prisma.user.findMany({
      where: { email: { endsWith: `@${domain}` } },
      select: { email: true, name: true },
    });
    for (const u of rows) {
      items.push(`User "${u.name}" <${u.email}> — disposable email domain; manual review`);
    }
  }

  return items;
}

async function exportRollbackBackup(
  planIds: string[],
  placeIds: string[],
  userIds: string[],
  tripIds: string[],
  ts: string,
): Promise<string> {
  const backupDir = path.resolve(process.cwd(), 'reports/ops');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `cleanup-rollback-backup-${ts}.json`);

  const [plans, places, users, subscriptions, prices] = await Promise.all([
    planIds.length
      ? prisma.subscriptionPlan.findMany({ where: { id: { in: planIds } } })
      : [],
    placeIds.length ? prisma.place.findMany({ where: { id: { in: placeIds } } }) : [],
    userIds.length ? prisma.user.findMany({ where: { id: { in: userIds } } }) : [],
    planIds.length
      ? prisma.userSubscription.findMany({ where: { planId: { in: planIds } } })
      : [],
    planIds.length ? prisma.planPrice.findMany({ where: { planId: { in: planIds } } }) : [],
  ]);

  fs.writeFileSync(
    backupPath,
    JSON.stringify({ timestamp: ts, plans, places, users, subscriptions, prices, tripIds }, null, 2),
  );
  return backupPath;
}

function generateRollbackSql(
  backupPath: string,
  planIds: string[],
  placeIds: string[],
  userIds: string[],
  tripIds: string[],
  ts: string,
): string {
  const lines = [
    '-- PalSafar production cleanup rollback reference',
    `-- Generated: ${ts}`,
    `-- Full row backup: ${backupPath}`,
    '-- Restore: use backup JSON with a controlled restore script; do not run blindly on production.',
    '',
    '-- Deleted subscription plan IDs:',
    ...planIds.map((id) => `--   ${id}`),
    '',
    '-- Deleted place IDs:',
    ...placeIds.map((id) => `--   ${id}`),
    '',
    '-- Deleted user IDs:',
    ...userIds.map((id) => `--   ${id}`),
    '',
    '-- Deleted trip plan IDs:',
    ...tripIds.map((id) => `--   ${id}`),
    '',
  ];
  return lines.join('\n');
}

/** Delete users and dependent rows (mirrors pruneExtraUsers FK order). */
async function deleteUsers(userIds: string[]): Promise<number> {
  if (userIds.length === 0) return 0;

  const vendors = await prisma.vendor.findMany({
    where: { userId: { in: userIds } },
    select: { id: true },
  });
  const vendorIds = vendors.map((v) => v.id);

  const offers = vendorIds.length
    ? await prisma.vendorOffer.findMany({
        where: { vendorId: { in: vendorIds } },
        select: { id: true },
      })
    : [];
  const offerIds = offers.map((o) => o.id);

  const creatorProfiles = await prisma.creatorProfile.findMany({
    where: { userId: { in: userIds } },
    select: { id: true },
  });
  const creatorProfileIds = creatorProfiles.map((c) => c.id);

  const reelIds = creatorProfileIds.length
    ? (
        await prisma.reel.findMany({
          where: { creatorId: { in: creatorProfileIds } },
          select: { id: true },
        })
      ).map((r) => r.id)
    : [];

  if (reelIds.length) {
    await prisma.reelLike.deleteMany({ where: { reelId: { in: reelIds } } });
    await prisma.reelComment.deleteMany({ where: { reelId: { in: reelIds } } });
    await prisma.reelSave.deleteMany({ where: { reelId: { in: reelIds } } });
    await prisma.reelReport.deleteMany({ where: { reelId: { in: reelIds } } });
    await prisma.reel.deleteMany({ where: { id: { in: reelIds } } });
  }

  if (creatorProfileIds.length) {
    await prisma.reel.deleteMany({ where: { creatorId: { in: creatorProfileIds } } });
  }
  await prisma.creatorProfile.deleteMany({ where: { userId: { in: userIds } } });

  if (offerIds.length || vendorIds.length || userIds.length) {
    await prisma.redemption.deleteMany({
      where: {
        OR: [
          ...(offerIds.length ? [{ offerId: { in: offerIds } }] : []),
          ...(vendorIds.length ? [{ vendorId: { in: vendorIds } }] : []),
          { userId: { in: userIds } },
          { verifiedById: { in: userIds } },
          { refundedById: { in: userIds } },
        ],
      },
    });
  }

  if (offerIds.length) {
    await prisma.vendorOffer.deleteMany({ where: { id: { in: offerIds } } });
  }
  if (vendorIds.length) {
    await prisma.vendorReel.deleteMany({ where: { vendorId: { in: vendorIds } } });
    await prisma.vendorReview.deleteMany({ where: { vendorId: { in: vendorIds } } });
    await prisma.vendor.deleteMany({ where: { id: { in: vendorIds } } });
  }

  await prisma.review.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.checkIn.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.follow.deleteMany({
    where: { OR: [{ followerId: { in: userIds } }, { followingId: { in: userIds } }] },
  });
  await prisma.rewardClaim.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.pointTransaction.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.walletTransaction.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.deviceToken.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.inAppNotification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });

  await prisma.place.updateMany({
    where: { submittedById: { in: userIds } },
    data: { submittedById: null },
  });
  await prisma.place.updateMany({
    where: { approvedById: { in: userIds } },
    data: { approvedById: null },
  });
  await prisma.vendor.updateMany({
    where: { reviewedById: { in: userIds } },
    data: { reviewedById: null },
  });
  await prisma.user.updateMany({
    where: { verifiedById: { in: userIds } },
    data: { verifiedById: null },
  });
  await prisma.vendorOffer.updateMany({
    where: { OR: [{ approvedById: { in: userIds } }, { rejectedById: { in: userIds } }] },
    data: { approvedById: null, rejectedById: null },
  });
  await prisma.auditLog.updateMany({
    where: { actorId: { in: userIds } },
    data: { actorId: null },
  });

  const result = await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  return result.count;
}

async function deletePlaces(placeIds: string[]): Promise<number> {
  if (placeIds.length === 0) return 0;

  for (const placeId of placeIds) {
    await prisma.tripPlanStop.deleteMany({ where: { placeId } });
    await prisma.collectionPlace.deleteMany({ where: { placeId } });
    await prisma.placeStat.deleteMany({ where: { placeId } });
    await prisma.checkIn.deleteMany({ where: { placeId } });
    await prisma.review.deleteMany({ where: { placeId } });
    await prisma.placeImage.deleteMany({ where: { placeId } });
    await prisma.placeVideo.deleteMany({ where: { placeId } });
    await prisma.placeOffer.deleteMany({ where: { placeId } });
    await prisma.placeEvent.deleteMany({ where: { placeId } });
    await prisma.userPlaceImage.deleteMany({ where: { placeId } });
    await prisma.placeDuplicateCandidate.deleteMany({
      where: { OR: [{ placeAId: placeId }, { placeBId: placeId }] },
    });
    await prisma.reel.updateMany({ where: { placeId }, data: { placeId: null } });
    await prisma.placeRelationship.deleteMany({
      where: { OR: [{ fromPlaceId: placeId }, { toPlaceId: placeId }] },
    });
    await prisma.placeAlias.deleteMany({ where: { placeId } });
    await prisma.auditLog.updateMany({ where: { placeId }, data: { placeId: null } });
    await prisma.place.updateMany({ where: { mergedIntoId: placeId }, data: { mergedIntoId: null } });
    await prisma.place.delete({ where: { id: placeId } });
  }

  return placeIds.length;
}

async function deleteTripPlans(tripIds: string[]): Promise<number> {
  if (tripIds.length === 0) return 0;
  await prisma.tripPlanStop.deleteMany({ where: { tripPlanDay: { tripPlanId: { in: tripIds } } } });
  await prisma.tripPlanDay.deleteMany({ where: { tripPlanId: { in: tripIds } } });
  const result = await prisma.tripPlan.deleteMany({ where: { id: { in: tripIds } } });
  return result.count;
}

async function deleteTestPlansAndDependents(planIds: string[]): Promise<TableRemovals> {
  const removed: TableRemovals = {};
  if (planIds.length === 0) return removed;

  const subscriptions = await prisma.userSubscription.findMany({
    where: { planId: { in: planIds } },
    select: { id: true },
  });
  const subIds = subscriptions.map((s) => s.id);

  const txIds = await findTestPaymentTransactionIds(planIds);

  if (txIds.length) {
    removed.refunds = (
      await prisma.refund.deleteMany({ where: { transactionId: { in: txIds } } })
    ).count;
    removed.invoices = (
      await prisma.invoice.deleteMany({ where: { transactionId: { in: txIds } } })
    ).count;
    removed.paymentTransactions = (
      await prisma.paymentTransaction.deleteMany({ where: { id: { in: txIds } } })
    ).count;
  }

  if (subIds.length) {
    removed.userSubscriptions = (
      await prisma.userSubscription.deleteMany({ where: { id: { in: subIds } } })
    ).count;
  }

  removed.creatorProfilesUnlinked = (
    await prisma.creatorProfile.updateMany({
      where: { membershipPlanId: { in: planIds } },
      data: { membershipPlanId: null },
    })
  ).count;

  removed.subscriptionAuditLogs = (
    await prisma.subscriptionAuditLog.deleteMany({
      where: {
        OR: [
          { entityType: 'SubscriptionPlan', entityId: { in: planIds } },
          { entityType: 'UserSubscription', entityId: { in: subIds } },
        ],
      },
    })
  ).count;

  removed.planPrices = (
    await prisma.planPrice.deleteMany({ where: { planId: { in: planIds } } })
  ).count;

  removed.subscriptionPlans = (
    await prisma.subscriptionPlan.deleteMany({ where: { id: { in: planIds } } })
  ).count;

  return removed;
}

async function runValidation(): Promise<Record<string, { pass: boolean; count: number }>> {
  const q = async (sql: string) => {
    const rows = await prisma.$queryRawUnsafe<{ c: bigint }[]>(sql);
    return Number(rows[0]?.c ?? 0);
  };

  const checks: Record<string, number> = {
    testVendorPlan: await q(`
      SELECT COUNT(*)::bigint AS c FROM subscription_plans WHERE name = 'Test VENDOR Plan'
    `),
    testCreatorPlan: await q(`
      SELECT COUNT(*)::bigint AS c FROM subscription_plans WHERE name = 'Test CREATOR Plan'
    `),
    itinTestPlaces: await q(`SELECT COUNT(*)::bigint AS c FROM places WHERE name ILIKE 'ItinTest%'`),
    testStatePlaces: await q(`
      SELECT COUNT(*)::bigint AS c FROM places
      WHERE city IN ('TestState','TestCity','TestVille','ItinTestVille') OR state IN ('TestState','TestCity')
    `),
    testSlugPlaces: await q(`SELECT COUNT(*)::bigint AS c FROM places WHERE slug LIKE 'test-%'`),
    demoSubscriptions: await q(`
      SELECT COUNT(*)::bigint AS c FROM user_subscriptions us
      JOIN subscription_plans sp ON sp.id = us.plan_id
      WHERE sp.slug ILIKE 'demo%' OR sp.slug ILIKE 'test-%'
    `),
    demoInvoices: await q(`
      SELECT COUNT(*)::bigint AS c FROM invoices i
      JOIN payment_transactions pt ON pt.id = i.transaction_id
      WHERE pt.description ILIKE '%demo%' OR pt.description ILIKE '%test%'
    `),
    demoPayments: await q(`
      SELECT COUNT(*)::bigint AS c FROM payment_transactions
      WHERE description ILIKE '%demo%' OR provider_order_id ILIKE 'order_test%'
    `),
    demoUsers: await q(`
      SELECT COUNT(*)::bigint AS c FROM users
      WHERE email LIKE '%@example.test' OR email ILIKE 'demo%' OR email ILIKE 'mock%' OR email ILIKE 'qa%'
    `),
    qaRecords: await q(`
      SELECT COUNT(*)::bigint AS c FROM (
        SELECT id FROM subscription_plans WHERE slug ILIKE 'qa%'
        UNION ALL SELECT id FROM coupons WHERE code ILIKE 'qa%'
        UNION ALL SELECT id FROM in_app_notifications WHERE title ILIKE '%qa%'
      ) t
    `),
  };

  const validation: Record<string, { pass: boolean; count: number }> = {};
  for (const [key, count] of Object.entries(checks)) {
    validation[key] = { pass: count === 0, count };
  }
  return validation;
}

async function main() {
  const { dryRun, confirm } = parseArgs();

  if (!dryRun && confirm !== 'I_UNDERSTAND_PRODUCTION') {
    console.error(
      'Refusing --apply without --confirm=I_UNDERSTAND_PRODUCTION (safety gate for production DB).',
    );
    process.exit(1);
  }

  const ts = Date.now().toString();
  const before = await countRows();

  const demoUsers = await findDemoUsers();
  const testPlaces = await findTestPlaces();
  const testPlans = await findTestPlans();
  const tripIds = await findTestTripPlanIds();
  const testNotifications = await findTestNotifications();
  const testAnnouncements = await findTestAnnouncements();
  const testCoupons = await findTestCoupons();
  const testPaymentIds = await findTestPaymentTransactionIds(testPlans.map((p) => p.id));
  const manualReview = await findManualReviewItems();

  const testSubCount = testPlans.length
    ? await prisma.userSubscription.count({ where: { planId: { in: testPlans.map((p) => p.id) } } })
    : 0;

  const backupPath = path.resolve(
    process.cwd(),
    `reports/ops/cleanup-rollback-backup-${ts}.json`,
  );
  const rollbackSqlPath = path.resolve(
    process.cwd(),
    `reports/ops/cleanup-rollback-${ts}.sql`,
  );

  if (!dryRun) {
    await exportRollbackBackup(
      testPlans.map((p) => p.id),
      testPlaces.map((p) => p.id),
      demoUsers.map((u) => u.id),
      tripIds,
      ts,
    );
  }

  const removed: TableRemovals = {};

  if (dryRun) {
    removed.users = demoUsers.length;
    removed.places = testPlaces.length;
    removed.subscriptionPlans = testPlans.length;
    removed.userSubscriptions = testSubCount;
    removed.planPrices = testPlans.length
      ? await prisma.planPrice.count({ where: { planId: { in: testPlans.map((p) => p.id) } } })
      : 0;
    removed.tripPlans = tripIds.length;
    removed.inAppNotifications = testNotifications.length;
    removed.announcements = testAnnouncements.length;
    removed.coupons = testCoupons.length;
    removed.paymentTransactions = testPaymentIds.length;
  } else {
    // Interactive transactions default to 5s — place/plan cleanup can exceed that on remote Postgres.
    await prisma.$transaction(
      async () => {
        if (tripIds.length) {
          removed.tripPlans = await deleteTripPlans(tripIds);
        }

        if (testPlaces.length) {
          removed.places = await deletePlaces(testPlaces.map((p) => p.id));
        }

        const planRemovals = await deleteTestPlansAndDependents(testPlans.map((p) => p.id));
        Object.assign(removed, planRemovals);

        if (testPaymentIds.length) {
          removed.refunds = (
            await prisma.refund.deleteMany({ where: { transactionId: { in: testPaymentIds } } })
          ).count;
          removed.invoices = (
            await prisma.invoice.deleteMany({ where: { transactionId: { in: testPaymentIds } } })
          ).count;
          removed.paymentTransactions = (
            await prisma.paymentTransaction.deleteMany({ where: { id: { in: testPaymentIds } } })
          ).count;
        }

        if (testCoupons.length) {
          await prisma.couponRedemption.deleteMany({
            where: { couponId: { in: testCoupons.map((c) => c.id) } },
          });
          removed.coupons = (
            await prisma.coupon.deleteMany({ where: { id: { in: testCoupons.map((c) => c.id) } } })
          ).count;
        }

        if (testNotifications.length) {
          removed.inAppNotifications = (
            await prisma.inAppNotification.deleteMany({
              where: { id: { in: testNotifications.map((n) => n.id) } },
            })
          ).count;
        }

        if (testAnnouncements.length) {
          removed.announcements = (
            await prisma.announcement.deleteMany({
              where: { id: { in: testAnnouncements.map((a) => a.id) } },
            })
          ).count;
        }

        if (demoUsers.length) {
          removed.users = await deleteUsers(demoUsers.map((u) => u.id));
        }
      },
      { maxWait: 30_000, timeout: 120_000 },
    );
  }

  const after = dryRun ? before : await countRows();
  const validation = await runValidation();

  const rollbackSql = generateRollbackSql(
    backupPath,
    testPlans.map((p) => p.id),
    testPlaces.map((p) => p.id),
    demoUsers.map((u) => u.id),
    tripIds,
    new Date().toISOString(),
  );
  fs.mkdirSync(path.dirname(rollbackSqlPath), { recursive: true });
  fs.writeFileSync(rollbackSqlPath, rollbackSql);

  const report: CleanupReport = {
    mode: dryRun ? 'dry-run' : 'apply',
    timestamp: new Date().toISOString(),
    before,
    after,
    removed,
    matched: {
      users: demoUsers.map((u) => u.email),
      places: testPlaces,
      plans: testPlans,
      subscriptions: testSubCount,
      tripPlans: tripIds.length,
      notifications: testNotifications.length,
      announcements: testAnnouncements.length,
      payments: testPaymentIds.length,
      coupons: testCoupons.length,
    },
    validation,
    manualReview,
    preserved: [...CANONICAL_KEEP_EMAILS],
    rollback: { backupJson: dryRun ? '(created on apply)' : backupPath, rollbackSql: rollbackSqlPath },
  };

  const reportPath = path.resolve(
    process.cwd(),
    `reports/ops/release-freeze-cleanup-${dryRun ? 'dry-run' : 'applied'}-${ts}.json`,
  );
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(JSON.stringify(report, null, 2));
  console.log(`Report written: ${reportPath}`);

  const allPass = Object.values(validation).every((v) => v.pass);
  if (!dryRun && !allPass) {
    console.error('Validation failed after cleanup — review report.');
    process.exit(1);
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
