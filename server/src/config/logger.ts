import pino from 'pino';
import pinoHttp from 'pino-http';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { env } from './env';

export const logger = pino({
  level: env.isProduction ? 'info' : 'debug',
  transport: env.isProduction
    ? undefined
    : {
        target: 'pino/file',
        options: { destination: 1, colorize: true },
      },
  formatters: {
    level(label) {
      return { level: label.toUpperCase() };
    },
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers.set-cookie',
      'res.headers["set-cookie"]',
      'body.password',
      'body.passwordStr',
      'body.currentPassword',
      'body.newPassword',
      'body.token',
      'body.code',
      'body.otp',
      'body.refreshToken',
      'body.accessToken',
      'body.devCode',
      'body.apiKey',
      'body.apiSecret',
      'body.CLOUDINARY_API_SECRET',
      'body.privateKey',
      'err.config.auth.pass',
      'token',
      'accessToken',
      'refreshToken',
      'password',
      'currentPassword',
      'newPassword',
      'otp',
      'code',
      'SMTP_PASS',
      'SMTP_PASSWORD',
      'BREVO_API_KEY',
      'SENDINBLUE_API_KEY',
      'FIREBASE_PRIVATE_KEY',
      'privateKey',
      '*.password',
      '*.token',
      '*.apiKey',
      '*.apiSecret',
      '*.privateKey',
      '*.pass',
    ],
    censor: '[REDACTED]',
  },
  serializers: {
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
    err: pino.stdSerializers.err,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export const httpLogger = pinoHttp({
  logger,
  customProps: (req) => ({
    correlationId: (req as any).correlationId,
  }),
  autoLogging: {
    ignore: (req) => {
      const url = req.url || '';
      return (
        url.startsWith('/health')
        || url.startsWith('/ready')
        || url.startsWith('/api/v1/health')
      );
    },
  },
  wrapSerializers: false,
});

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      correlationId: string;
    }
  }
}

export function correlationMiddleware(req: Request, _res: Response, next: NextFunction) {
  req.correlationId = (req.headers['x-correlation-id'] as string) || randomUUID();
  _res.setHeader('x-correlation-id', req.correlationId);
  next();
}
