import { describe, it, expect, vi, beforeEach } from 'vitest';
import { socialService } from '../modules/social/social.service';
import { prisma } from '../config/database';
import { ApiError } from '../shared/utils/ApiError';

vi.mock('../shared/services/roleTransition.service', () => ({
  roleTransitionService: {
    applyVerificationOutcome: vi.fn(),
  },
}));

vi.mock('../modules/notifications/notification.service', () => ({
  notificationService: {
    sendToUser: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../config/database', () => ({
  prisma: {
    creatorProfile: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

describe('Creator privilege escalation prevention (C-01)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('TEST A: Traveler PATCH profile without profile → rejected, no create', async () => {
    (prisma.creatorProfile.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      socialService.updateProfile('traveler-1', { bio: 'hello world' }),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(prisma.creatorProfile.create).not.toHaveBeenCalled();
  });

  it('TEST B: Cannot set status=APPROVED via updateProfile', async () => {
    (prisma.creatorProfile.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'p1',
      userId: 'user-1',
      username: 'creator1',
      status: 'APPROVED',
    });
    (prisma.creatorProfile.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'p1',
      status: 'APPROVED',
      bio: 'updated',
    });

    await socialService.updateProfile('user-1', {
      bio: 'updated',
      status: 'APPROVED',
    } as Parameters<typeof socialService.updateProfile>[1] & { status: string });

    const updateCall = (prisma.creatorProfile.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(updateCall.data.status).toBeUndefined();
  });

  it('TEST C: Cannot set role=CONTENT_CREATOR via updateProfile', async () => {
    (prisma.creatorProfile.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'p1',
      userId: 'user-1',
      username: 'creator1',
      status: 'APPROVED',
    });
    (prisma.creatorProfile.update as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'p1' });

    await socialService.updateProfile('user-1', {
      bio: 'ok',
      role: 'CONTENT_CREATOR',
    } as Parameters<typeof socialService.updateProfile>[1] & { role: string });

    const updateCall = (prisma.creatorProfile.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(updateCall.data.role).toBeUndefined();
  });

  it('TEST E: Rejected creator cannot self-approve via updateProfile', async () => {
    (prisma.creatorProfile.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'p1',
      userId: 'user-1',
      username: 'creator1',
      status: 'REJECTED',
    });

    await expect(
      socialService.updateProfile('user-1', { bio: 'please approve' }),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(prisma.creatorProfile.update).not.toHaveBeenCalled();
  });

  it('TEST F: getApprovedCreatorProfile rejects PENDING — no silent upgrade', async () => {
    (prisma.creatorProfile.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'p1',
      userId: 'user-1',
      status: 'PENDING',
    });

    await expect(socialService.getApprovedCreatorProfile('user-1')).rejects.toBeInstanceOf(ApiError);
    expect(prisma.creatorProfile.update).not.toHaveBeenCalled();
    expect(prisma.creatorProfile.create).not.toHaveBeenCalled();
  });

  it('TEST G: Approved creator profile update succeeds', async () => {
    (prisma.creatorProfile.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'p1',
      userId: 'user-1',
      username: 'approved_creator',
      status: 'APPROVED',
    });
    (prisma.creatorProfile.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.creatorProfile.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'p1',
      username: 'approved_creator',
      bio: 'New bio',
      status: 'APPROVED',
    });

    const result = await socialService.updateProfile('user-1', { bio: 'New bio' });
    expect(result.bio).toBe('New bio');
    expect(result.status).toBe('APPROVED');
  });

  it('TEST D: Admin verifyCreator transitions PENDING → APPROVED', async () => {
    const txUpdate = vi.fn().mockResolvedValue({
      id: 'p1',
      userId: 'user-1',
      status: 'APPROVED',
      verified: true,
    });
    (prisma.creatorProfile.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'p1',
      userId: 'user-1',
      status: 'PENDING',
    });
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn) =>
      fn({ creatorProfile: { update: txUpdate } }),
    );

    const result = await socialService.verifyCreator('p1', 'APPROVED', undefined, 'admin-1');
    expect(result.status).toBe('APPROVED');
    expect(txUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'APPROVED', verified: true }),
      }),
    );
  });
});
