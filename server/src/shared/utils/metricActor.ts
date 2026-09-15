import type { Request } from 'express';
import { rateLimitClientIp } from '../../config/rateLimit';

export function metricActorKey(req: { user?: { id?: string } } & Partial<Request>): string {
  if (req.user?.id) return `user:${req.user.id}`;
  return `ip:${rateLimitClientIp(req as Request)}`;
}
