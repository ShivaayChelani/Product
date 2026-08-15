import app from '../src/app';
import { initFirebase } from '../src/config/firebase';
import { prisma } from '../src/config/database';
import { logger } from '../src/config/logger';

initFirebase();

prisma.$connect().catch((err) => {
  logger.error({ err }, 'Failed to connect to database');
});

export default app;
