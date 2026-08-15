import { describe, it, expect, vi, beforeEach } from 'vitest';
import { challengesService } from '../modules/challenges/challenges.service';
import { prisma } from '../config/database';
import { ChallengeStatus, ChallengeDifficulty } from '@prisma/client';

vi.mock('../config/database', () => ({
  prisma: {
    challenge: { findUnique: vi.fn(), update: vi.fn() },
    challengeCompletion: { findUnique: vi.fn(), create: vi.fn() },
  },
}));

vi.mock('../modules/wallet/wallet.service', () => ({
  walletService: {
    earn: vi.fn(),
  },
}));

describe('Challenge proof enforcement (H-06)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseChallenge = {
    id: 'c1',
    status: ChallengeStatus.APPROVED,
    difficulty: ChallengeDifficulty.EASY,
    title: 'Test',
    creatorId: null,
  };

  it('rejects PHOTO challenge without proofUrl', async () => {
    (prisma.challenge.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...baseChallenge,
      proofRequired: 'PHOTO',
    });

    await expect(
      challengesService.complete('c1', 'user-1'),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects QR challenge without qrCode', async () => {
    (prisma.challenge.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...baseChallenge,
      proofRequired: 'QR',
    });

    await expect(
      challengesService.complete('c1', 'user-1', undefined, { qrCode: '' }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects GPS challenge without coordinates', async () => {
    (prisma.challenge.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...baseChallenge,
      proofRequired: 'GPS',
    });

    await expect(
      challengesService.complete('c1', 'user-1'),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
