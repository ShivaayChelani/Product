import { prisma } from '../src/config/database';

async function count(sql: string) {
  const rows = await prisma.$queryRawUnsafe<{ c: bigint }[]>(sql);
  return Number(rows[0]?.c ?? 0);
}

async function main() {
  const checks: Record<string, number | unknown> = {};

  checks.plans_total = await count('SELECT COUNT(*)::bigint AS c FROM subscription_plans');
  checks.test_plans = await count(`
    SELECT COUNT(*)::bigint AS c FROM subscription_plans
    WHERE name IN ('Test VENDOR Plan', 'Test CREATOR Plan')
       OR slug ILIKE 'test-vendor%' OR slug ILIKE 'test-creator%'
       OR slug ILIKE 'demo%' OR slug ILIKE 'sample%' OR slug ILIKE 'qa%' OR slug ILIKE 'mock%'
  `);

  checks.itintest_places = await count(`SELECT COUNT(*)::bigint AS c FROM places WHERE name ILIKE 'ItinTest%'`);
  checks.test_slug_places = await count(`SELECT COUNT(*)::bigint AS c FROM places WHERE slug LIKE 'test-%'`);
  checks.teststate_places = await count(`SELECT COUNT(*)::bigint AS c FROM places WHERE city IN ('TestState','TestCity','TestVille','ItinTestVille') OR state IN ('TestState','TestCity')`);
  checks.demo_name_places = await count(`SELECT COUNT(*)::bigint AS c FROM places WHERE name ILIKE 'Demo%' OR name ILIKE 'Sample%' OR name ILIKE 'Mock%' OR name ILIKE 'QA %'`);
  checks.test_name_places = await count(`SELECT COUNT(*)::bigint AS c FROM places WHERE name ILIKE 'Test Place%' OR name ILIKE 'Test Red Fort%' OR name ILIKE 'Bulk Place%'`);

  checks.test_users = await count(`
    SELECT COUNT(*)::bigint AS c FROM users
    WHERE email LIKE '%@example.test'
       OR email ILIKE 'test%' OR email ILIKE 'demo%' OR email ILIKE 'mock%' OR email ILIKE 'qa%'
  `);

  checks.itintest_trips = await count(`SELECT COUNT(*)::bigint AS c FROM trip_plans WHERE destination ILIKE '%ItinTest%'`);
  checks.test_subs = await count(`
    SELECT COUNT(*)::bigint AS c FROM user_subscriptions us
    JOIN subscription_plans sp ON sp.id = us.plan_id
    WHERE sp.slug ILIKE 'test-%' OR sp.slug ILIKE 'demo%' OR sp.slug ILIKE 'sample%' OR sp.slug ILIKE 'qa%' OR sp.slug ILIKE 'mock%'
       OR sp.name ILIKE 'Test %Plan%'
  `);
  checks.test_invoices = await count(`
    SELECT COUNT(*)::bigint AS c FROM invoices i
    JOIN payment_transactions pt ON pt.id = i.transaction_id
    WHERE pt.description ILIKE '%test%' OR pt.description ILIKE '%demo%' OR pt.provider_order_id ILIKE 'order_test%'
  `);
  checks.test_tx = await count(`
    SELECT COUNT(*)::bigint AS c FROM payment_transactions
    WHERE description ILIKE '%test%' OR description ILIKE '%demo%' OR provider_order_id ILIKE 'order_test%'
  `);
  checks.test_notifs = await count(`
    SELECT COUNT(*)::bigint AS c FROM in_app_notifications
    WHERE title ILIKE '%test%' OR title ILIKE '%demo%' OR title ILIKE '%qa%'
  `);
  checks.test_coupons = await count(`
    SELECT COUNT(*)::bigint AS c FROM coupons
    WHERE code ILIKE 'test%' OR code ILIKE 'demo%' OR code ILIKE 'qa%' OR code ILIKE 'mock%'
  `);

  checks.users_total = await count('SELECT COUNT(*)::bigint AS c FROM users');
  checks.places_total = await count('SELECT COUNT(*)::bigint AS c FROM places');

  const planList = await prisma.$queryRawUnsafe<{ name: string; slug: string }[]>(`
    SELECT name, slug FROM subscription_plans ORDER BY slug
  `);
  checks.all_plans = planList;

  console.log(JSON.stringify(checks, null, 2));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
