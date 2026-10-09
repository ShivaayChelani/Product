import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../config/database', () => ({
  prisma: {
    reel: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    place: { findFirst: vi.fn() },
  },
}));

vi.mock('../modules/social/social.service', () => ({
  socialService: {
    getApprovedCreatorProfile: vi.fn(async () => ({ id: 'creator-1' })),
    awardDailyReelUploadReward: vi.fn(async () => ({
      rewardPoints: 50,
      dailyRewardClaimed: true,
      dailyRewardDate: '2026-10-10',
    })),
  },
}));

import { prisma } from '../config/database';
import { creatorService } from '../modules/creator/creator.service';
import { socialService } from '../modules/social/social.service';

const VIDEO = 'https://cdn.example/reel.mp4';

describe('creatorService draft / publish lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.place.findFirst as any).mockResolvedValue(null);
  });

  it('creates a genuine DRAFT and does not mark it APPROVED', async () => {
    (prisma.reel.findFirst as any).mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    (prisma.reel.create as any).mockResolvedValue({
      id: 'draft_1',
      creatorId: 'creator-1',
      videoUrl: VIDEO,
      status: 'DRAFT',
    });

    const res = await creatorService.createDraft('user-1', { videoUrl: VIDEO, title: 'Taj' });

    expect(prisma.reel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          creatorId: 'creator-1',
          videoUrl: VIDEO,
          status: 'DRAFT',
        }),
      }),
    );
    expect(res.status).toBe('DRAFT');
  });

  it('retries of the same draft video update the existing DRAFT instead of duplicating', async () => {
    (prisma.reel.findFirst as any)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'draft_1',
        creatorId: 'creator-1',
        videoUrl: VIDEO,
        status: 'DRAFT',
        thumbnail: null,
        title: 'Old',
        description: null,
        tags: [],
        placeId: null,
        vendorId: null,
      });
    (prisma.reel.update as any).mockResolvedValue({
      id: 'draft_1',
      status: 'DRAFT',
      title: 'New',
    });

    const res = await creatorService.createDraft('user-1', { videoUrl: VIDEO, title: 'New' });

    expect(prisma.reel.create).not.toHaveBeenCalled();
    expect(prisma.reel.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'draft_1' },
        data: expect.objectContaining({ status: 'DRAFT', title: 'New' }),
      }),
    );
    expect(res.id).toBe('draft_1');
  });

  it('refuses to clone an already-published reel into Drafts', async () => {
    (prisma.reel.findFirst as any).mockResolvedValueOnce({
      id: 'live_1',
      creatorId: 'creator-1',
      videoUrl: VIDEO,
      status: 'APPROVED',
    });

    await expect(
      creatorService.createDraft('user-1', { videoUrl: VIDEO, title: 'Clone' }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(prisma.reel.create).not.toHaveBeenCalled();
  });

  it('posts an existing draft onto the same reel as APPROVED', async () => {
    (prisma.reel.findUnique as any).mockResolvedValue({
      id: 'draft_1',
      creatorId: 'creator-1',
      status: 'DRAFT',
      videoUrl: VIDEO,
    });
    (prisma.reel.update as any).mockResolvedValue({
      id: 'draft_1',
      creatorId: 'creator-1',
      status: 'APPROVED',
    });

    const res = await creatorService.publishDraft('user-1', 'draft_1');

    expect(prisma.reel.update).toHaveBeenCalledWith({
      where: { id: 'draft_1' },
      data: { status: 'APPROVED' },
    });
    expect(res.status).toBe('APPROVED');
    expect(res.id).toBe('draft_1');
  });

  it('does not publish a live reel through the draft publish endpoint', async () => {
    (prisma.reel.findUnique as any).mockResolvedValue({
      id: 'live_1',
      creatorId: 'creator-1',
      videoUrl: VIDEO,
      status: 'APPROVED',
    });

    const res = await creatorService.publishDraft('user-1', 'live_1');

    expect(res.id).toBe('live_1');
    expect(res.status).toBe('APPROVED');
    expect(prisma.reel.update).not.toHaveBeenCalled();
    expect(socialService.awardDailyReelUploadReward).not.toHaveBeenCalled();
  });

  it('refuses to publish a draft whose media upload is not a remote URL', async () => {
    (prisma.reel.findUnique as any).mockResolvedValue({
      id: 'draft_1',
      creatorId: 'creator-1',
      status: 'DRAFT',
      videoUrl: 'file:///data/incomplete.mp4',
    });

    await expect(creatorService.publishDraft('user-1', 'draft_1')).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(prisma.reel.update).not.toHaveBeenCalled();
  });

  it('failed publish leaves the original DRAFT intact', async () => {
    (prisma.reel.findUnique as any).mockResolvedValue({
      id: 'draft_1',
      creatorId: 'creator-1',
      status: 'DRAFT',
      videoUrl: VIDEO,
    });
    (prisma.reel.update as any).mockRejectedValue(new Error('db down'));

    await expect(creatorService.publishDraft('user-1', 'draft_1')).rejects.toThrow('db down');
    expect(socialService.awardDailyReelUploadReward).not.toHaveBeenCalled();
  });

  it('rejects publishing a reel the creator does not own', async () => {
    (prisma.reel.findUnique as any).mockResolvedValue({
      id: 'draft_1',
      creatorId: 'someone-else',
      status: 'DRAFT',
    });

    await expect(creatorService.publishDraft('user-1', 'draft_1')).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(prisma.reel.update).not.toHaveBeenCalled();
  });
});
