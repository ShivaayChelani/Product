/**
 * Remove the legacy runtime QA admin account from the database.
 * Usage: node -r dotenv/config scripts/remove-qa-gate-admin.cjs
 */
const { PrismaClient, Role, RoleAssignmentStatus } = require('@prisma/client');

const QA_ADMIN_EMAIL = 'qa-gate-admin@palsafar.test';

const prisma = new PrismaClient();

async function findReplacementAdminId(excludeUserId) {
  const row = await prisma.userRole.findFirst({
    where: {
      role: Role.ADMIN,
      status: RoleAssignmentStatus.APPROVED,
      userId: excludeUserId ? { not: excludeUserId } : undefined,
      user: { email: { not: QA_ADMIN_EMAIL.toLowerCase() } },
    },
    select: { userId: true },
  });
  return row?.userId ?? null;
}

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: QA_ADMIN_EMAIL.toLowerCase() },
    select: { id: true, email: true },
  });
  if (!user) {
    console.log(`No legacy QA admin account found (${QA_ADMIN_EMAIL}).`);
    return;
  }

  const replacementId = await findReplacementAdminId(user.id);

  await prisma.vendor.updateMany({
    where: { reviewedById: user.id },
    data: { reviewedById: replacementId },
  });
  await prisma.vendorOffer.updateMany({
    where: { approvedById: user.id },
    data: { approvedById: replacementId },
  });
  await prisma.place.updateMany({
    where: { approvedById: user.id },
    data: { approvedById: replacementId },
  });
  await prisma.userRole.updateMany({
    where: { approvedById: user.id },
    data: { approvedById: replacementId },
  });

  await prisma.userRole.deleteMany({ where: { userId: user.id } });
  await prisma.wallet.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });

  console.log(`Removed legacy QA admin account: ${user.email}`);
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
