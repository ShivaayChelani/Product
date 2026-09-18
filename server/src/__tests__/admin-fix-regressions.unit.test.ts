import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  createCampaignSchema,
  updateCampaignSchema,
  updateClaimStatusSchema,
} from '../modules/campaigns/campaigns.validation';
import { cuidSchema, isCuid } from '../shared/utils/cuidSchema';
import { sendToRoleSchema } from '../modules/notifications/notification.validation';
import {
  resolveNotificationTargetRole,
  NOTIFICATION_ROLE_ALIASES,
  NOTIFICATION_TARGET_ROLES,
} from '../shared/utils/notificationTargets';
import { pointsToRupees, rupeesToPoints, POINTS_PER_RUPEE } from '../shared/utils/palPoints';

const validCampaign = {
  name: 'Summer Giveaway',
  description: 'Win a free weekend trip to Manali.',
  pointsRequired: '500',
  totalWinnerSlots: '10',
  maxClaimsPerUser: '1',
  startDate: '2026-08-01T00:00:00.000Z',
  endDate: '2026-09-01T00:00:00.000Z',
  status: 'DRAFT',
};

describe('cuidSchema', () => {
  it('accepts Prisma cuid ids (c + 24 lowercase base36)', () => {
    expect(cuidSchema.parse('cabcdefghijklmnopqrstuvwx')).toBe('cabcdefghijklmnopqrstuvwx');
  });

  it('accepts legacy uppercase ids (case-insensitive, per the documented caveat)', () => {
    expect(() => cuidSchema.parse('CABCDEFGHIJKLMNOPQRSTUVWX')).not.toThrow();
  });

  it('rejects UUIDs (admin previously sent uuid.v4())', () => {
    expect(isCuid('3f8f24e8-9b9c-4f58-9b8e-1e0f1c2d3e4f')).toBe(false);
    expect(() => cuidSchema.parse('3f8f24e8-9b9c-4f58-9b8e-1e0f1c2d3e4f')).toThrow();
  });

  it('rejects empty strings and mismatched lengths', () => {
    expect(isCuid('')).toBe(false);
    expect(isCuid('short')).toBe(false);
    expect(() => cuidSchema.parse('')).toThrow();
  });
});

describe('palPoints canonical conversion', () => {
  it('converts 10 PP = ₹1 with floor semantics', () => {
    expect(POINTS_PER_RUPEE).toBe(10);
    expect(pointsToRupees(100)).toBe(10);
    expect(pointsToRupees(99)).toBe(9);
    expect(pointsToRupees(9)).toBe(0);
    expect(rupeesToPoints(1)).toBe(10);
    expect(rupeesToPoints(2.5)).toBe(25);
  });

  it('never rounds partial rupees up', () => {
    expect(pointsToRupees(15)).toBe(1);
  });
});

describe('notification role mapping', () => {
  it('normalizes legacy admin labels to real Role values', () => {
    expect(NOTIFICATION_ROLE_ALIASES.TOURIST).toBe('VENDOR');
    expect(NOTIFICATION_ROLE_ALIASES.PARTNER).toBe('CONTENT_CREATOR');
    expect(NOTIFICATION_ROLE_ALIASES.CREATOR).toBe('CONTENT_CREATOR');
    expect(resolveNotificationTargetRole('tourist')).toBe('VENDOR');
    expect(resolveNotificationTargetRole('partner')).toBe('CONTENT_CREATOR');
    expect(resolveNotificationTargetRole('creator')).toBe('CONTENT_CREATOR');
    expect(resolveNotificationTargetRole('USER')).toBe('USER');
    expect(resolveNotificationTargetRole('vendor')).toBe('VENDOR');
  });

  it('keeps unknown labels unchanged so the service can reject them with 400', () => {
    expect(resolveNotificationTargetRole('ADMINISTRATOR')).toBe('ADMINISTRATOR');
    expect(NOTIFICATION_TARGET_ROLES).not.toContain('ADMINISTRATOR');
  });

  it('covers ALL with every distributable role', () => {
    expect(NOTIFICATION_TARGET_ROLES).toContain('ALL');
    expect(NOTIFICATION_TARGET_ROLES).toContain('SUPER_ADMIN');
  });
});

describe('sendToRoleSchema', () => {
  it('accepts the documented dashboard role labels', () => {
    for (const role of ['USER', 'TOURIST', 'PARTNER', 'CREATOR', 'ADMIN', 'ALL']) {
      expect(sendToRoleSchema.parse({ role, title: 'Test' }).role).toBe(role);
    }
  });

  it('rejects roles that are not in the enum', () => {
    const result = sendToRoleSchema.safeParse({ role: 'VENDOR_MANAGER', title: 'Test' });
    expect(result.success).toBe(false);
  });
});

describe('campaign validation hardening', () => {
  it('accepts numeric-string slots/points via coerce', () => {
    const parsed = createCampaignSchema.parse(validCampaign);
    expect(parsed.pointsRequired).toBe(500);
    expect(parsed.totalWinnerSlots).toBe(10);
  });

  it('rejects endDate earlier than or equal to startDate (create)', () => {
    const bad = createCampaignSchema.safeParse({
      ...validCampaign,
      endDate: '2026-07-01T00:00:00.000Z',
    });
    expect(bad.success).toBe(false);
    const equal = createCampaignSchema.safeParse({
      ...validCampaign,
      endDate: '2026-08-01T00:00:00.000Z',
    });
    expect(equal.success).toBe(false);
  });

  it('requires totalWinnerSlots (no more silent 999999 default)', () => {
    const { totalWinnerSlots: _omitted, ...withoutSlots } = validCampaign;
    expect(createCampaignSchema.safeParse(withoutSlots).success).toBe(false);
  });

  it('rejects NaN / non-positive numbers', () => {
    expect(createCampaignSchema.safeParse({ ...validCampaign, pointsRequired: '0' }).success).toBe(false);
    expect(createCampaignSchema.safeParse({ ...validCampaign, pointsRequired: 'abc' }).success).toBe(false);
  });

  it('update schema is fully partial but re-checks date ordering when both dates sent', () => {
    const ok = updateCampaignSchema.safeParse({ name: 'Renamed only' });
    expect(ok.success).toBe(true);
    const bad = updateCampaignSchema.safeParse({
      startDate: '2026-08-01T00:00:00.000Z',
      endDate: '2026-07-01T00:00:00.000Z',
    });
    expect(bad.success).toBe(false);
  });

  it('allows explicit remainingWinnerSlots but never negative', () => {
    expect(updateCampaignSchema.safeParse({ remainingWinnerSlots: 5 }).success).toBe(true);
    expect(updateCampaignSchema.safeParse({ remainingWinnerSlots: -1 }).success).toBe(false);
  });

  it('claim status updates only accept the five enum values', () => {
    expect(updateClaimStatusSchema.parse({ status: 'APPROVED' })).toEqual({ status: 'APPROVED' });
    expect(updateClaimStatusSchema.safeParse({ status: 'CANCELLED' }).success).toBe(false);
  });

  it('types stay inferable (UpdateCampaignInput remains partial-of-creatable fields)', () => {
    const input: z.infer<typeof updateCampaignSchema> = { remainingWinnerSlots: 3 };
    expect(input.remainingWinnerSlots).toBe(3);
  });
});