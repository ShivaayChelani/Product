import type { Express, Request, Response, NextFunction } from 'express';
import { env } from './env';
import { logger } from './logger';

let Sentry: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Sentry = require('@sentry/node');
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@sentry/profiling-node');
  } catch {
    // Profiling optional
  }
} catch {
  // Sentry packages not available
}

export function initSentry() {
  if (!Sentry || !env.sentryDsn) return;

  const integrations: unknown[] = [];
  // @sentry/node v8+ / v10: expressIntegration + setupExpressErrorHandler (Handlers API removed).
  if (typeof Sentry.expressIntegration === 'function') {
    integrations.push(Sentry.expressIntegration());
  }

  Sentry.init({
    dsn: env.sentryDsn,
    environment: env.nodeEnv,
    tracesSampleRate: env.isProduction ? 0.1 : 0,
    profilesSampleRate: env.isProduction ? 0.1 : 0,
    enabled: Boolean(env.sentryDsn),
    integrations,
  });
  logger.info('Sentry initialized');
}

/** Wire Express error capture for @sentry/node v10+. Call before the app errorHandler. */
export function setupSentryErrorHandler(app: Express) {
  if (!Sentry || !env.sentryDsn) return;
  if (typeof Sentry.setupExpressErrorHandler === 'function') {
    Sentry.setupExpressErrorHandler(app);
    return;
  }
  logger.warn('Sentry.setupExpressErrorHandler unavailable — Express errors will not be reported');
}

/** @deprecated Handlers API removed in Sentry Node v8+; kept as no-op for old call sites. */
export function getSentryRequestHandler() {
  return (_req: Request, _res: Response, next: NextFunction) => next();
}

/** @deprecated Use setupSentryErrorHandler(app) instead. */
export function getSentryErrorHandler() {
  return (err: any, _req: Request, _res: Response, next: NextFunction) => next(err);
}
