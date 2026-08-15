import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.PALSAFAR_PIPELINE_WORKER === '1'
      ? ['error']
      : process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production' && process.env.PALSAFAR_PIPELINE_WORKER !== '1') {
  globalForPrisma.prisma = prisma;
}
