import { describe, expect, it } from 'vitest';
import { adminReelReportsQuerySchema } from '../modules/social/social.validation';

describe('admin reel report query validation', () => {
  it('normalizes allowed statuses and keeps pagination inputs', () => {
    expect(adminReelReportsQuerySchema.parse({ status: 'pending', page: '2', limit: '10' })).toEqual({
      status: 'PENDING',
      page: '2',
      limit: '10',
    });
  });

  it('rejects unsupported statuses rather than passing them to Prisma', () => {
    expect(adminReelReportsQuerySchema.safeParse({ status: 'open' }).success).toBe(false);
  });
});
