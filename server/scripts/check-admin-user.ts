import dotenv from 'dotenv';
import path from 'path';
import { prisma } from '../src/config/database';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function main() {
  const emails = ['shivaay.chelani@gmail.com', 'shivaay@palsafar.com'];
  for (const email of emails) {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, permission: true, createdAt: true },
    });
    console.log(email, user ? user : 'NOT FOUND');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
