import { describe, expect, it, vi, beforeEach } from 'vitest';
import { socialService } from '../modules/social/social.service';
import { prisma } from '../config/database';

vi.mock('../shared/services/roleTransition.service', () => ({
  roleTransitionService: { applyVerificationOutcome: vi.fn() },
}));

vi.mock('../modules/notifications/notification.service', () => ({
  notificationService: { sendToUser: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../modules/vendors/vendor-tagged-reels', () => ({
  notifyVendorOfTaggedReel: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../config/database', () => ({
  prisma: {
    creatorProfile: { findFirst: vi.fn() },
    reel: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    place: { findFirst: vi.fn() },
    vendor: { findFirst: vi.fn() },
    userRole: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}));

function approvedProfile() {
  (prisma.creatorProfile.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: 'creator-1',
    userId: 'user-1',
    username: 'mona',
    fullName: 'Mona',
    status: 'APPROVED',
  });
}

describe('socialService.updateOwnReel — published status is preserved', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    approvedProfile();
  });

  it('saves caption edits on an APPROVED reel without demoting it to DRAFT', async () => {
    (prisma.reel.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'live_1',
      creatorId: 'creator-1',
      status: 'APPROVED',
      vendorId: null,
    });
    (prisma.reel.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'live_1',
      creatorId: 'creator-1',
      status: 'APPROVED',
      description: 'Updated caption',
    });

    const res = await socialService.updateOwnReel('user-1', 'live_1', {
      description: 'Updated caption',
      status: 'DRAFT',
    } as Parameters<typeof socialService.updateOwnReel>[2] & { status: string });

    const data = (prisma.reel.update as ReturnType<typeof vi.fn>).mock.calls[0][0].data;
    expect(data.status).toBeUndefined();
    expect(data.description).toBe('Updated caption');
    expect(res.status).toBe('APPROVED');
    expect(prisma.reel.create).not.toHaveBeenCalled();
  });

  it('does not create a new reel when editing an existing one', async () => {
    (prisma.reel.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'live_1',
      creatorId: 'creator-1',
      status: 'APPROVED',
    });
    (prisma.reel.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'live_1',
      status: 'APPROVED',
    });

    const res = await socialService.updateOwnReel('user-1', 'live_1', { title: 'Keep me' });
    expect(res.id).toBe('live_1');
    expect(prisma.reel.create).not.toHaveBeenCalled();
  });

  it('failed update leaves the original status untouched', async () => {
    (prisma.reel.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'live_1',
      creatorId: 'creator-1',
      status: 'APPROVED',
      description: 'Original',
    });
    (prisma.reel.update as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('write failed'));

    await expect(
      socialService.updateOwnReel('user-1', 'live_1', { description: 'New' }),
    ).rejects.toThrow('write failed');
    expect(prisma.reel.create).not.toHaveBeenCalled();
  });

  it('rejects edits on a reel the creator does not own', async () => {
    (prisma.reel.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'live_1',
      creatorId: 'someone-else',
      status: 'APPROVED',
    });

    await expect(
      socialService.updateOwnReel('user-1', 'live_1', { title: 'Nope' }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(prisma.reel.update).not.toHaveBeenCalled();
  });

  it('keeps reel status APPROVED when a vendor tag requires listing moderation', async () => {
    (prisma.reel.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'live_1',
      creatorId: 'creator-1',
      status: 'APPROVED',
      vendorId: null,
    });
    (prisma.vendor.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'vendor-1' });
    (prisma.reel.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'live_1',
      status: 'APPROVED',
      vendorId: 'vendor-1',
      vendorListingStatus: 'PENDING',
    });

    const res = await socialService.updateOwnReel('user-1', 'live_1', {
      vendorId: 'vendor-1',
      description: 'Tagged cafe',
    });

    const data = (prisma.reel.update as ReturnType<typeof vi.fn>).mock.calls[0][0].data;
    expect(data.status).toBeUndefined();
    expect(data.vendorListingStatus).toBe('PENDING');
    expect(res.status).toBe('APPROVED');
  });
});
