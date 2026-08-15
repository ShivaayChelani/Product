/**
 * READ-ONLY report: lists accounts that hold BOTH professional roles (VENDOR and
 * CONTENT_CREATOR) in a non-relinquished state. These predate the exclusivity rule
 * ("one account = USER + at most one professional role") and must be resolved manually
 * by an admin (retire one of the two roles from the admin dashboard).
 *
 * Usage: node scripts/report-dual-role-accounts.cjs
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const HELD_STATUSES = ['ACTIVE', 'PENDING', 'APPROVED', 'SUSPENDED', 'PAUSED'];

async function main() {
  const users = await prisma.user.findMany({
    where: {
      AND: [
        { userRoles: { some: { role: 'VENDOR', status: { in: HELD_STATUSES } } } },
        { userRoles: { some: { role: 'CONTENT_CREATOR', status: { in: HELD_STATUSES } } } },
      ],
    },
    select: {
      id: true,
      email: true,
      name: true,
      permission: true,
      activeMode: true,
      userRoles: {
        where: { role: { in: ['VENDOR', 'CONTENT_CREATOR'] } },
        select: { role: true, status: true, approvedAt: true },
      },
      vendor: { select: { id: true, businessName: true, status: true } },
      creatorProfile: { select: { id: true, username: true, status: true } },
    },
  });

  if (users.length === 0) {
    console.log('OK: no accounts hold both professional roles.');
    return;
  }

  console.log(`Found ${users.length} account(s) holding BOTH professional roles — manual admin review required:\n`);
  for (const user of users) {
    console.log(`- ${user.email} (${user.name || 'unnamed'}) [${user.id}]`);
    console.log(`  permission=${user.permission} activeMode=${user.activeMode}`);
    for (const roleRow of user.userRoles) {
      console.log(`  role=${roleRow.role} status=${roleRow.status} approvedAt=${roleRow.approvedAt?.toISOString() ?? '-'}`);
    }
    if (user.vendor) console.log(`  vendor: "${user.vendor.businessName}" (${user.vendor.status})`);
    if (user.creatorProfile) console.log(`  creator: @${user.creatorProfile.username} (${user.creatorProfile.status})`);
    console.log('');
  }
  console.log('Resolve each account by retiring one role via the Admin Dashboard (Users page or Vendors/Creators pages).');
  process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error('Report failed:', err.message);
    process.exitCode = 2;
  })
  .finally(() => prisma.$disconnect());
