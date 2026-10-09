import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../src/config/database', () => ({
  prisma: { reel: { findUnique: vi.fn(), update: vi.fn() } },
}));

vi.mock('../../src/modules/social/social.service', () => ({
  socialService: { getApprovedCreatorProfile: vi.fn(async () => ({ id: 'creator-1' })) },
}));

import { prisma } from '../../src/config/database';
import { creatorService } from '../../src/modules/creator/creator.service';

const APPROVED = 'APPROVED';
const ARCHIVED = 'ARCHIVED';
const DRAFT = 'DRAFT';

describe('creatorService.setReelArchived — archived reels leave the public feed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('archives an approved reel by setting status ARCHIVED', async () => {
    (prisma.reel.findUnique as any).mockResolvedValue({ id: 'r1', creatorId: 'creator-1', status: APPROVED });
    (prisma.reel.update as any).mockResolvedValue({ id: 'r1', creatorId: 'creator-1', status: ARCHIVED });

    const res = await creatorService.setReelArchived('user-1', 'r1', true);

    expect(prisma.reel.update).toHaveBeenCalledWith({ where: { id: 'r1' }, data: { status: ARCHIVED } });
    expect(res.status).toBe(ARCHIVED);
  });

  it('unarchives an archived reel back to APPROVED', async () => {
    (prisma.reel.findUnique as any).mockResolvedValue({ id: 'r1', creatorId: 'creator-1', status: ARCHIVED });
    (prisma.reel.update as any).mockResolvedValue({ id: 'r1', creatorId: 'creator-1', status: APPROVED });

    const res = await creatorService.setReelArchived('user-1', 'r1', false);

    expect(prisma.reel.update).toHaveBeenCalledWith({ where: { id: 'r1' }, data: { status: APPROVED } });
    expect(res.status).toBe(APPROVED);
  });

  it('is idempotent: archiving an already-archived reel is a no-op', async () => {
    (prisma.reel.findUnique as any).mockResolvedValue({ id: 'r1', creatorId: 'creator-1', status: ARCHIVED });

    const res = await creatorService.setReelArchived('user-1', 'r1', true);

    expect(prisma.reel.update).not.toHaveBeenCalled();
    expect(res.status).toBe(ARCHIVED);
  });

  it('never archives a draft (no moderation bypass)', async () => {
    (prisma.reel.findUnique as any).mockResolvedValue({ id: 'r1', creatorId: 'creator-1', status: DRAFT });

    const res = await creatorService.setReelArchived('user-1', 'r1', true);

    expect(prisma.reel.update).not.toHaveBeenCalled();
    expect(res.status).toBe(DRAFT);
  });

  it('rejects a reel the creator does not own', async () => {
    (prisma.reel.findUnique as any).mockResolvedValue({ id: 'r1', creatorId: 'someone-else', status: APPROVED });

    await expect(creatorService.setReelArchived('user-1', 'r1', true)).rejects.toThrow();
    expect(prisma.reel.update).not.toHaveBeenCalled();
  });
});
