import rateLimit, { Options, type RateLimitRequestHandler } from 'express-rate-limit';
import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from './env';

type PeekAuth = {
  userId?: string;
  permission?: string;
};

function peekAuth(req: Request): PeekAuth {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return {};
    const decoded = jwt.verify(header.slice(7), env.jwt.secret, { algorithms: ['HS256'] }) as {
      userId?: string;
      permission?: string;
      role?: string;
      roles?: string[];
    };
    const permission =
      decoded.permission ||
      decoded.role ||
      (Array.isArray(decoded.roles) && decoded.roles.includes('ADMIN') ? 'ADMIN' : undefined);
    return { userId: decoded.userId, permission };
  } catch {
    return {};
  }
}

const ADMIN_RATE_LIMIT_ROLES = new Set([
  'ADMIN',
  'SUPER_ADMIN',
  'OPS_ADMIN',
  'VENDOR_MANAGER',
  'CONTENT_MODERATOR',
  'FINANCE_MANAGER',
  'SUPPORT_AGENT',
  'MARKETING_ADMIN',
  'ANALYTICS_VIEWER',
]);

function isAdminRequest(req: Request): boolean {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return false;
    const decoded = jwt.verify(header.slice(7), env.jwt.secret, { algorithms: ['HS256'] }) as {
      permission?: string;
      role?: string;
      roles?: string[];
    };
    const roles = [
      decoded.permission,
      decoded.role,
      ...(Array.isArray(decoded.roles) ? decoded.roles : []),
    ].filter(Boolean) as string[];
    return roles.some((role) => ADMIN_RATE_LIMIT_ROLES.has(role));
  } catch {
    return false;
  }
}

const createLimiter = (options: Partial<Options>): RateLimitRequestHandler => {
  const userSkip = options.skip;
  return rateLimit({
    ...options,
    validate: {
      // We intentionally use a custom key (user id) behind a reverse proxy.
      xForwardedForHeader: false,
      default: true,
    },
    skip: (req: Request, res: Response) => {
      if (process.env.NODE_ENV === 'test') return true;
      if (userSkip?.(req, res)) return true;
      return false;
    },
  });
};

export const globalLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  // Authenticated mobile clients (vendor dashboard + map) are chatty; a prior
  // refresh loop could burn a low budget and block offer creation.
  max: 8000,
  standardHeaders: true,
  legacyHeaders: false,
  // Admin dashboard loads many endpoints on each page — never throttle ADMIN JWTs.
  skip: (req) => isAdminRequest(req),
  keyGenerator: (req) => {
    const { userId } = peekAuth(req);
    if (userId) return `uid:${userId}`;
    return `ip:${req.ip || 'anonymous'}`;
  },
  message: { success: false, data: null, message: 'Too many requests. Please try again later.' },
});

export const directionsLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const { userId } = peekAuth(req);
    return userId ? `directions:${userId}` : `ip:${req.ip || 'anonymous'}`;
  },
  message: { success: false, data: null, message: 'Too many directions requests. Please try again later.' },
});

export const placesDiscoveryLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, data: null, message: 'Too many requests. Please try again later.' },
});

export const registerLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, data: null, message: 'Too many accounts created. Try again later.' },
});

export const refreshLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, data: null, message: 'Too many refresh requests. Please try again later.' },
});

export const loginLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (email) return `login:${email}`;
    return `ip:${req.ip || 'anonymous'}`;
  },
  message: { success: false, data: null, message: 'Too many login attempts. Please try again in 15 minutes.' },
});

export const uploadLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, data: null, message: 'Upload limit reached. Try again later.' },
});

export const statsLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, data: null, message: 'Too many requests. Slow down.' },
});

export const createPlaceLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, data: null, message: 'Place creation limit reached (10/hour). Try again later.' },
});

export const createHiddenGemLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, data: null, message: 'Hidden gem submission limit reached (10/hour). Try again later.' },
});

export const videoUploadLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, data: null, message: 'Video upload limit reached (5/hour). Try again later.' },
});

export const forgotPasswordLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, data: null, message: 'Too many password reset requests. Try again later.' },
});

export const resetPasswordLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, data: null, message: 'Too many reset attempts. Try again later.' },
});

export const leaderboardLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, data: null, message: 'Too many leaderboard requests. Slow down.' },
});

export const aiLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, data: null, message: 'Too many AI requests. Please try again later.' },
});

export const adClaimLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const { userId } = peekAuth(req);
    return userId ? `ad-claim:${userId}` : `ip:${req.ip || 'anonymous'}`;
  },
  message: { success: false, data: null, message: 'Too many ad reward claims. Please try again later.' },
});

export const partnerRedeemLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const { userId } = peekAuth(req);
    return userId ? `partner-redeem:${userId}` : `ip:${req.ip || 'anonymous'}`;
  },
  message: { success: false, data: null, message: 'Too many redemption attempts. Please try again later.' },
});

export const challengeCompleteLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const { userId } = peekAuth(req);
    return userId ? `challenge-complete:${userId}` : `ip:${req.ip || 'anonymous'}`;
  },
  message: { success: false, data: null, message: 'Too many challenge completions. Please try again later.' },
});

export const usernameCheckLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const { userId } = peekAuth(req);
    return userId ? `username-check:${userId}` : `ip:${req.ip || 'anonymous'}`;
  },
  message: { success: false, data: null, message: 'Too many username checks. Please try again later.' },
});

export const otpVerifyLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (email) return `otp-verify:${email}`;
    return `ip:${req.ip || 'anonymous'}`;
  },
  message: { success: false, data: null, message: 'Too many verification attempts. Please try again later.' },
});
