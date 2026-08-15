import { pruneExtraUsers } from '../src/config/db-seed';
import { prisma } from '../src/config/database';

async function main() {
  const result = await pruneExtraUsers();
  console.log(JSON.stringify(result, null, 2));
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
