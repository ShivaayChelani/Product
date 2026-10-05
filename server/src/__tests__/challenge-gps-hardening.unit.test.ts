import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  challengesService,
  MAX_GPS_ACCURACY_METERS,
} from '../modules/challenges/challenges.service';
import { prisma } from '../config/database';
import { walletService } from '../modules/wallet/wallet.service';
import { ChallengeStatus, ChallengeDifficulty, ChallengeProofType } from '@prisma/client';

/**
 * Transaction handle handed to the service callback. The service must do all of
 * its writes through this object so a partial failure cannot leave a completion
 * without its reward.
 */
const mockTx = {
  challengeCompletion: { create: vi.fn() },
  challenge: { update: vi.fn() },
};

vi.mock('../config/database', () => ({
  prisma: {
    challenge: { findUnique: vi.fn(), count: vi.fn(), update: vi.fn() },
    challengeCompletion: { findUnique: vi.fn(), create: vi.fn(), count: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('../modules/wallet/wallet.service', () => ({
  walletService: { earn: vi.fn() },
}));

const JABALPUR = { latitude: 23.1815, longitude: 79.9864 };

function mockChallenge(overrides: Record<string, any> = {}) {
  (prisma.challenge.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: 'c1',
    status: ChallengeStatus.APPROVED,
    difficulty: ChallengeDifficulty.HARD,
    proofRequired: ChallengeProofType.GPS,
    title: 'Dumna Cycling Trail',
    // creatorId null keeps badge/milestone fan-out out of these unit tests.
    creatorId: null,
    ...overrides,
  });
}

/** Wire the happy path: no prior completion, transaction commits. */
function mockHappyTransaction(completionsCount = 1) {
  (prisma.challengeCompletion.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  mockTx.challengeCompletion.create.mockResolvedValue({ id: 'comp-1' });
  mockTx.challenge.update.mockResolvedValue({ id: 'c1', completionsCount });
  (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: any) =>
    fn(mockTx),
  );
}

describe('Challenge GPS reward hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('valid completion', () => {
    it('awards the server-derived HARD reward and completes inside one transaction', async () => {
      mockChallenge();
      mockHappyTransaction();

      const res = await challengesService.complete('c1', 'user-1', undefined, { ...JABALPUR });

      expect(res.pointsAwarded).toBe(75);
      expect(res.completion).toEqual({ id: 'comp-1' });
      expect(mockTx.challengeCompletion.create).toHaveBeenCalledTimes(1);
      expect(mockTx.challenge.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { completionsCount: { increment: 1 } },
      });
    });

    it('passes the transaction handle to walletService.earn so payout is atomic', async () => {
      mockChallenge();
      mockHappyTransaction();

      await challengesService.complete('c1', 'user-1', undefined, { ...JABALPUR });

      expect(walletService.earn).toHaveBeenCalledTimes(1);
      const args = (walletService.earn as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(args[0]).toBe('user-1');
      expect(args[1]).toBe(75);
      expect(args[2]).toBe('Completed challenge: Dumna Cycling Trail');
      // idempotency key + the transaction client in the 7th position
      expect(args[3]).toBe('c1');
      expect(args[4]).toBe('challenge_completed');
      expect(args[6]).toBe(mockTx);
    });

    it('accepts a fix whose accuracy is within the allowed limit', async () => {
      mockChallenge();
      mockHappyTransaction();

      const res = await challengesService.complete('c1', 'user-1', undefined, {
        ...JABALPUR,
        accuracyM: 12,
        isFromMockProvider: false,
      });

      expect(res.pointsAwarded).toBe(75);
    });

    it('still completes a non-GPS PHOTO challenge with no coordinates (flow unbroken)', async () => {
      mockChallenge({ proofRequired: ChallengeProofType.PHOTO, difficulty: ChallengeDifficulty.EASY });
      mockHappyTransaction();

      const res = await challengesService.complete(
        'c1',
        'user-1',
        'https://res.cloudinary.com/dhu4at0jh/image/upload/v1234/proof.jpg',
      );

      expect(res.pointsAwarded).toBe(20);
    });
  });

  describe('invalid coordinates are rejected server-side', () => {
    const cases: Array<[string, any]> = [
      ['missing coordinates', undefined],
      ['latitude only', { latitude: JABALPUR.latitude }],
      ['longitude only', { longitude: JABALPUR.longitude }],
      ['NaN latitude', { latitude: NaN, longitude: JABALPUR.longitude }],
      ['Infinity longitude', { latitude: JABALPUR.latitude, longitude: Infinity }],
      ['latitude out of range', { latitude: 91, longitude: JABALPUR.longitude }],
      ['longitude out of range', { latitude: JABALPUR.latitude, longitude: 181 }],
      ['Null Island (0,0)', { latitude: 0, longitude: 0 }],
      ['swapped axes', { latitude: JABALPUR.longitude, longitude: JABALPUR.latitude }],
      ['outside India', { latitude: 40.7128, longitude: -74.006 }],
    ];

    it.each(cases)('rejects %s', async (_label, proofMeta) => {
      mockChallenge();
      (prisma.challengeCompletion.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(
        challengesService.complete('c1', 'user-1', undefined, proofMeta),
      ).rejects.toMatchObject({ statusCode: 400 });

      // No completion, no counter bump, no payout on a rejected fix.
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(walletService.earn).not.toHaveBeenCalled();
    });
  });

  describe('GPS spoof signals are rejected', () => {
    it('rejects an OS-flagged mock location', async () => {
      mockChallenge();
      (prisma.challengeCompletion.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(
        challengesService.complete('c1', 'user-1', undefined, {
          ...JABALPUR,
          isFromMockProvider: true,
        }),
      ).rejects.toMatchObject({ statusCode: 400 });

      expect(walletService.earn).not.toHaveBeenCalled();
    });

    it(`rejects an accuracy coarser than ${MAX_GPS_ACCURACY_METERS}m`, async () => {
      mockChallenge();
      (prisma.challengeCompletion.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(
        challengesService.complete('c1', 'user-1', undefined, {
          ...JABALPUR,
          accuracyM: MAX_GPS_ACCURACY_METERS + 1,
        }),
      ).rejects.toMatchObject({ statusCode: 400 });

      expect(walletService.earn).not.toHaveBeenCalled();
    });

    it('rejects a negative or non-finite accuracy', async () => {
      mockChallenge();
      (prisma.challengeCompletion.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(
        challengesService.complete('c1', 'user-1', undefined, { ...JABALPUR, accuracyM: -5 }),
      ).rejects.toMatchObject({ statusCode: 400 });

      await expect(
        challengesService.complete('c1', 'user-1', undefined, { ...JABALPUR, accuracyM: NaN }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('idempotency and concurrency', () => {
    it('rejects a duplicate completion before opening a transaction', async () => {
      mockChallenge();
      (prisma.challengeCompletion.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'comp-existing',
      });

      await expect(
        challengesService.complete('c1', 'user-1', undefined, { ...JABALPUR }),
      ).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('already completed') });

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(walletService.earn).not.toHaveBeenCalled();
    });

    it('converts a unique-index violation into a clean 400 and never double-pays', async () => {
      mockChallenge();
      // Both concurrent requests pass the pre-check (no row yet), then the
      // loser's insert trips the unique (challenge_id, user_id) index.
      (prisma.challengeCompletion.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (prisma.$transaction as ReturnType<typeof vi.fn>).mockRejectedValue(
        Object.assign(new Error('Unique constraint failed on challenge_completions'), {
          code: 'P2002',
        }),
      );

      await expect(
        challengesService.complete('c1', 'user-1', undefined, { ...JABALPUR }),
      ).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('already completed') });

      expect(walletService.earn).not.toHaveBeenCalled();
    });

    it('pays exactly once across two concurrent completions', async () => {
      mockChallenge();
      (prisma.challengeCompletion.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      let created = false;
      mockTx.challengeCompletion.create.mockImplementation(async () => {
        if (created) {
          throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        }
        created = true;
        return { id: 'comp-1' };
      });
      mockTx.challenge.update.mockResolvedValue({ id: 'c1', completionsCount: 1 });
      (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: any) =>
        fn(mockTx),
      );

      const results = await Promise.allSettled([
        challengesService.complete('c1', 'user-1', undefined, { ...JABALPUR }),
        challengesService.complete('c1', 'user-1', undefined, { ...JABALPUR }),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
      expect(walletService.earn).toHaveBeenCalledTimes(1);
      expect(mockTx.challenge.update).toHaveBeenCalledTimes(1);
    });
  });

  describe('reward amount integrity', () => {
    const expectations: Array<[ChallengeDifficulty, number]> = [
      [ChallengeDifficulty.EASY, 20],
      [ChallengeDifficulty.MEDIUM, 40],
      [ChallengeDifficulty.HARD, 75],
    ];

    it.each(expectations)('pays %s -> %i points', async (difficulty, points) => {
      mockChallenge({ difficulty });
      mockHappyTransaction();

      const res = await challengesService.complete('c1', 'user-1', undefined, { ...JABALPUR });

      expect(res.pointsAwarded).toBe(points);
      expect((walletService.earn as ReturnType<typeof vi.fn>).mock.calls[0][1]).toBe(points);
    });

    it('ignores any client-supplied point value', async () => {
      mockChallenge({ difficulty: ChallengeDifficulty.EASY });
      mockHappyTransaction();

      const res = await challengesService.complete('c1', 'user-1', undefined, {
        ...JABALPUR,
        // A hostile client tries to inflate its own payout.
        points: 100000,
        amount: 100000,
      } as any);

      expect(res.pointsAwarded).toBe(20);
    });
  });
});
