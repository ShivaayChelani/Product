import { prisma } from '../src/config/database';
import { signSsvCustomData } from '../src/modules/monetization/ads.service';
import { Role } from '@prisma/client';

const NON_TEST_ROLES: Role[] = ['ADMIN', 'SUPER_ADMIN', 'OPS_ADMIN', 'VENDOR_MANAGER'];

async function main() {
  const user = await prisma.user.findFirst({
    where: { permission: { notIn: NON_TEST_ROLES } },
    orderBy: { createdAt: 'asc' },
  });
  if (!user) {
    throw new Error('No test user found in database');
  }
  process.stderr.write(`[ssv-gen] binding token to account role=${user.permission} created_at=${user.createdAt.toISOString()}\n`);
  console.log(signSsvCustomData(user.id));
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
