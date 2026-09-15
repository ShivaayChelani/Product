import { describe, expect, it } from 'vitest';
import type { Request } from 'express';
import { rateLimitClientIp } from '../config/rateLimit';

describe('rateLimitClientIp', () => {
  it('uses the request IP instead of a shared anonymous bucket', () => {
    expect(rateLimitClientIp({ ip: '203.0.113.10' } as Request)).toBe('203.0.113.10');
    expect(rateLimitClientIp({ ip: '198.51.100.9' } as Request)).toBe('198.51.100.9');
    expect(rateLimitClientIp({ ip: '' } as Request)).toBe('unknown');
  });
});
