import { Server } from 'http';
import app from './app';
import { env } from './config/env';
import { prisma } from './config/database';
import { logger } from './config/logger';
import { initFirebase } from './config/firebase';
import { ensureDbExtensions } from './config/db-extensions';
import { ensureSeedData } from './config/db-seed';
import { analyticsService } from './modules/analytics/analytics.service';
import { isSmtpConfigured, verifySmtpConnection } from './shared/email/email.service';


let server: Server;

async function start() {
  try {
    await prisma.$connect();
    logger.info('Connected to PostgreSQL database');

    await ensureDbExtensions();
    await ensureSeedData();

    initFirebase();

    if (!env.cloudinary.cloudName || !env.cloudinary.apiKey || !env.cloudinary.apiSecret) {
      logger.warn('Cloudinary credentials not configured. Image uploads will fail.');
    }

    if (isSmtpConfigured()) {
      if (!process.env.SMTP_FROM_EMAIL?.trim()) {
        logger.warn(
          'SMTP_FROM_EMAIL is unset — set a verified Brevo sender or emails may be rejected.',
        );
      }
      setImmediate(() => {
        verifySmtpConnection().catch((err) =>
          logger.warn({ err }, 'Email startup verification failed'),
        );
      });
    } else {
      logger.warn(
        'Email not configured — set BREVO_API_KEY + SMTP_FROM_EMAIL (Render) or SMTP_HOST/USER/PASS',
      );
    }

    server = app.listen(env.port, () => {
      logger.info({ port: env.port, mode: env.nodeEnv }, 'Server started');
      setImmediate(() => {
        analyticsService.getDashboard().catch((err) =>
          logger.warn({ err }, 'Analytics dashboard pre-warm failed')
        );
      });
    });

    server.timeout = 120000;
    server.keepAliveTimeout = 65000;
    server.headersTimeout = 70000;
  } catch (error) {
    logger.fatal({ err: error }, 'Failed to start server');
    process.exit(1);
  }
}

async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutdown signal received. Closing gracefully...');
  if (server) {
    server.close(async () => {
      await prisma.$disconnect();
      logger.info('Server closed and DB disconnected');
      process.exit(0);
    });
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  } else {
    await prisma.$disconnect();
    process.exit(0);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason: Error | any) => {
  logger.fatal({ err: reason, type: 'unhandledRejection' }, 'Unhandled Promise rejection');
  shutdown('unhandledRejection');
});

process.on('uncaughtException', (error: Error) => {
  logger.fatal({ err: error, type: 'uncaughtException' }, 'Uncaught exception');
  shutdown('uncaughtException');
});

start();
