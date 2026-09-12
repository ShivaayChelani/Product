import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../src/config/database', () => ({
  prisma: {
    treasureHunt: { findUnique: vi.fn() },
    treasureHuntProgress: { findUnique: vi.fn() },
    riddleProgress: { upsert: vi.fn() },
    riddle: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../src/modules/wallet/wallet.service', () => ({
  walletService: {
    earn: vi.fn(async () => ({ palPoints: 10 })),
  },
}));

vi.mock('../../src/shared/utils/reverseGeocode', () => ({
  reverseGeocodeToCity: vi.fn(async () => 'Kolkata'),
}));

import { prisma } from '../../src/config/database';
import { walletService } from '../../src/modules/wallet/wallet.service';
import { reverseGeocodeToCity } from '../../src/shared/utils/reverseGeocode';
import { riddlesService } from '../../src/modules/riddles/riddles.service';
import { TREASURE_HUNT_RIDDLE_REWARD_POINTS } from '../../src/modules/riddles/riddles.constants';
import { submitAnswerSchema } from '../../src/modules/riddles/riddles.validation';
import {
  DAILY_OPEN_REWARD_POINTS,
  DAILY_OPEN_EARN_REASON,
} from '../../src/modules/wallet/dailyOpenReward.service';

const USER = 'user-1';
const LAT = 22.5726;
const LNG = 88.3639;

type RiddleRow = {
  id: string;
  sequence: number;
  rewardCoins: number;
  answerEnglish: string;
  answerHindi: string;
};

type Ctx = {
  rpByRiddle: Map<string, any>;
  thp: any;
  earnCalls: any[];
  hunt: { id: string; city: string; title: string; rewardCoins: number; status: string; riddles: RiddleRow[] };
};

function upsertRiddleProgress(ctx: Ctx, args: any) {
  const riddleId = args.where.userId_riddleId.riddleId;
  const existing = ctx.rpByRiddle.get(riddleId);
  if (existing) {
    const merged: any = {
      ...existing,
      attempts: existing.attempts + (args.update?.attempts?.increment ?? 0),
    };
    if (args.update && args.update.isCorrect !== undefined) {
      merged.isCorrect = args.update.isCorrect;
      merged.coinsEarned = args.update.coinsEarned ?? merged.coinsEarned;
      merged.completedAt = args.update.completedAt ?? merged.completedAt;
    }
    ctx.rpByRiddle.set(riddleId, merged);
    return merged;
  }
  const created = {
    id: `rp-${riddleId}`,
    ...args.create,
    attempts: args.create?.attempts ?? 0,
    isCorrect: args.create?.isCorrect ?? false,
    coinsEarned: args.create?.coinsEarned ?? 0,
  };
  ctx.rpByRiddle.set(riddleId, created);
  return created;
}

/** Builds a fresh hunt + stateful prisma/wallet mocks for a 3-riddle hunt. */
function setupState(riddleRewards: number[] = [9999, 9999, 9999]) {
  const riddles: RiddleRow[] = [
    { id: 'r1', sequence: 1, rewardCoins: riddleRewards[0], answerEnglish: 'Hooghly river', answerHindi: 'हुगली नदी' },
    { id: 'r2', sequence: 2, rewardCoins: riddleRewards[1], answerEnglish: 'Victoria Memorial', answerHindi: 'विक्टोरिया मेमोरियल' },
    { id: 'r3', sequence: 3, rewardCoins: riddleRewards[2], answerEnglish: 'Howrah Bridge', answerHindi: 'हावड़ा ब्रिज' },
  ];
  const ctx: Ctx = {
    rpByRiddle: new Map(),
    thp: null,
    earnCalls: [],
    hunt: {
      id: 'hunt-1',
      city: 'Kolkata',
      title: 'Kolkata Treasure Hunt',
      rewardCoins: 150,
      status: 'ACTIVE',
      riddles,
    },
  };

  (walletService.earn as any).mockImplementation(async (userId: string, amount: number, reason: string, referenceId: string, referenceType: string) => {
    ctx.earnCalls.push({ userId, amount, reason, referenceId, referenceType });
    return { palPoints: amount };
  });
  (reverseGeocodeToCity as any).mockResolvedValue('Kolkata');
  (prisma.treasureHunt.findUnique as any).mockResolvedValue(ctx.hunt);
  (prisma.riddleProgress.upsert as any).mockImplementation(async (args: any) => upsertRiddleProgress(ctx, args));
  (prisma.treasureHuntProgress.findUnique as any).mockImplementation(async () => ctx.thp);

  const tx = {
    riddleProgress: {
      findUnique: async ({ where }: any) => ctx.rpByRiddle.get(where.userId_riddleId.riddleId) ?? null,
      upsert: async (args: any) => upsertRiddleProgress(ctx, args),
    },
    treasureHuntProgress: {
      findUnique: async () => ctx.thp,
      create: async ({ data }: any) => {
        ctx.thp = { id: 'tp-1', ...data, isCompleted: false, coinsEarned: data.coinsEarned ?? 0, startedAt: new Date(), completedAt: null };
        return ctx.thp;
      },
      update: async ({ data }: any) => {
        const base = ctx.thp ?? {};
        const increment = (data.coinsEarned as any)?.increment ?? 0;
        const { coinsEarned: _omit, ...rest } = data as any;
        ctx.thp = { ...base, ...rest, coinsEarned: (base.coinsEarned ?? 0) + increment };
        return ctx.thp;
      },
    },
  };
  (prisma.$transaction as any).mockImplementation(async (fn: any) => fn(tx));

  return ctx;
}

const submit = (huntId: string, riddleId: string, answer: string, language: 'en' | 'hi' | undefined) =>
  riddlesService.submitAnswer(huntId, riddleId, USER, answer, language, LAT, LNG);

describe('Treasure Hunt scoring — canonical riddle reward = 10 points', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('defines the canonical riddle reward as exactly 10, independent of daily-open (5) and completion bonus (150)', async () => {
    expect(TREASURE_HUNT_RIDDLE_REWARD_POINTS).toBe(10);
    expect(DAILY_OPEN_REWARD_POINTS).toBe(5);
    expect(DAILY_OPEN_EARN_REASON).toBe('daily_open');
  });

  it('correct English answer awards exactly 10 and writes the expected ledger + progress', async () => {
    const ctx = setupState();
    const res = await submit('hunt-1', 'r1', 'hooghly river', 'en');

    expect(res.correct).toBe(true);
    expect(res.rewardCoins).toBe(10);
    expect(res.huntCompleteReward).toBe(0);
    expect(ctx.earnCalls).toHaveLength(1);
    expect(ctx.earnCalls[0]).toMatchObject({ userId: USER, amount: 10, reason: 'game_complete', referenceId: 'r1', referenceType: 'RIDDLE' });
    const rp = ctx.rpByRiddle.get('r1');
    expect(rp.isCorrect).toBe(true);
    expect(rp.coinsEarned).toBe(10);
    expect(ctx.thp.coinsEarned).toBe(10);
  });

  it('server is the source of truth: a drifted DB reward column (9999) still awards exactly 10, so a client can never inflate the reward', async () => {
    const ctx = setupState([9999, 9999, 9999]);
    const res = await submit('hunt-1', 'r1', 'hooghly river', 'en');
    expect(res.rewardCoins).toBe(10);
    expect(ctx.earnCalls[0].amount).toBe(10);
  });

  it('Hindi correct answer awards exactly 10 (same reward as English, no language difference)', async () => {
    const ctx = setupState();
    const res = await submit('hunt-1', 'r1', 'हुगली नदी', 'hi');
    expect(res.correct).toBe(true);
    expect(res.rewardCoins).toBe(10);
    expect(ctx.earnCalls[0].amount).toBe(10);
    expect(ctx.earnCalls[0].reason).toBe('game_complete');
    expect(ctx.earnCalls[0].reason).not.toBe('daily_open');
  });

  it('wrong answer awards 0: no wallet credit, no coinsEarned mutation, no reward counter', async () => {
    const ctx = setupState();
    const res = await submit('hunt-1', 'r1', 'wrong answer', 'en');
    expect(res.correct).toBe(false);
    expect(res.rewardCoins).toBe(0);
    expect(res.huntCompleteReward).toBe(0);
    expect(ctx.earnCalls).toHaveLength(0);
    expect(ctx.thp).toBeNull();
    const rp = ctx.rpByRiddle.get('r1');
    expect(rp.isCorrect).toBe(false);
    expect(rp.coinsEarned).toBe(0);
    expect(rp.attempts).toBe(1);
  });

  it('repeated wrong answers stay at 0 total and increment attempts only', async () => {
    const ctx = setupState();
    await submit('hunt-1', 'r1', 'no', 'en');
    await submit('hunt-1', 'r1', 'no', 'en');
    const res = await submit('hunt-1', 'r1', 'no', 'en');
    expect(res.correct).toBe(false);
    expect(res.rewardCoins).toBe(0);
    expect(ctx.earnCalls).toHaveLength(0);
    expect(ctx.thp).toBeNull();
    const rp = ctx.rpByRiddle.get('r1');
    expect(rp.attempts).toBe(3);
    expect(rp.isCorrect).toBe(false);
    expect(rp.coinsEarned).toBe(0);
  });

  it('wrong answer followed by correct answer → exactly one 10 credit', async () => {
    const ctx = setupState();
    await submit('hunt-1', 'r1', 'wrong', 'en');
    const res = await submit('hunt-1', 'r1', 'hooghly river', 'en');
    expect(res.correct).toBe(true);
    expect(res.rewardCoins).toBe(10);
    expect(ctx.earnCalls).toHaveLength(1);
    expect(ctx.earnCalls[0].amount).toBe(10);
    const rp = ctx.rpByRiddle.get('r1');
    expect(rp.isCorrect).toBe(true);
    expect(rp.coinsEarned).toBe(10);
    expect(rp.attempts).toBe(2);
  });

  it('case/whitespace-normalized correct answer still awards exactly 10 (language-agnostic normalization preserved)', async () => {
    setupState();
    const ok1 = await submit('hunt-1', 'r1', 'hooghly river', 'en');
    expect(ok1.rewardCoins).toBe(10);
    // Messy spacing/caps/punctuation on the next riddle's answer still matches and awards exactly 10.
    const ok = await submit('hunt-1', 'r2', '  VICTORIA   MEMORIAL. ', 'en');
    expect(ok.correct).toBe(true);
    expect(ok.rewardCoins).toBe(10);
  });

  it('three correct riddles → +30 riddle points and a separate completion bonus of +150 awarded once', async () => {
    const ctx = setupState();
    const r1 = await submit('hunt-1', 'r1', 'hooghly river', 'en');
    expect(r1.huntCompleteReward).toBe(0);
    expect(r1.huntCompleted).toBe(false);
    const r2 = await submit('hunt-1', 'r2', 'victoria memorial', 'en');
    expect(r2.rewardCoins).toBe(10);
    expect(r2.huntCompleteReward).toBe(0);
    const r3 = await submit('hunt-1', 'r3', 'howrah bridge', 'en');
    expect(r3.rewardCoins).toBe(10);
    expect(r3.huntCompleteReward).toBe(150);
    expect(r3.huntCompleted).toBe(true);

    const riddleEarns = ctx.earnCalls.filter((e) => e.referenceType === 'RIDDLE');
    const huntEarns = ctx.earnCalls.filter((e) => e.referenceType === 'TREASURE_HUNT');
    expect(riddleEarns).toHaveLength(3);
    expect(riddleEarns.reduce((s, e) => s + e.amount, 0)).toBe(30);
    expect(huntEarns).toHaveLength(1);
    expect(huntEarns[0].amount).toBe(150);
    expect(ctx.thp.isCompleted).toBe(true);
    expect(ctx.thp.coinsEarned).toBe(180);
  });

  it('one wrong + two correct of three riddles → +20 riddle points, no completion bonus', async () => {
    const ctx = setupState();
    await submit('hunt-1', 'r1', 'wrong', 'en');
    const ok1 = await submit('hunt-1', 'r1', 'hooghly river', 'en');
    expect(ok1.rewardCoins).toBe(10);
    const wrong2 = await submit('hunt-1', 'r2', 'nope', 'en');
    expect(wrong2.rewardCoins).toBe(0);
    const ok2 = await submit('hunt-1', 'r2', 'victoria memorial', 'en');
    expect(ok2.rewardCoins).toBe(10);
    expect(ctx.earnCalls.filter((e) => e.referenceType === 'RIDDLE')).toHaveLength(2);
    expect(ctx.earnCalls.filter((e) => e.referenceType === 'RIDDLE').reduce((s, e) => s + e.amount, 0)).toBe(20);
    expect(ctx.thp.coinsEarned).toBe(20);
    expect(ctx.thp.isCompleted).toBe(false);
  });

  it('all wrong → +0 riddle points, no credit, no progress total', async () => {
    const ctx = setupState();
    let total = 0;
    for (const answer of ['x', 'y', 'z']) {
      const res = await submit('hunt-1', 'r1', answer, 'en');
      total += res.rewardCoins;
    }
    expect(total).toBe(0);
    expect(ctx.earnCalls).toHaveLength(0);
    expect(ctx.thp).toBeNull();
  });

  it('re-answering a solved riddle after completion → 0 additional points (idempotency)', async () => {
    const ctx = setupState();
    await submit('hunt-1', 'r1', 'hooghly river', 'en');
    await submit('hunt-1', 'r2', 'victoria memorial', 'en');
    await submit('hunt-1', 'r3', 'howrah bridge', 'en');
    const before = ctx.earnCalls.length;

    const again = await submit('hunt-1', 'r1', 'hooghly river', 'en');
    expect(again.correct).toBe(true);
    expect(again.rewardCoins).toBe(0);
    expect(again.huntCompleteReward).toBe(0);
    expect(ctx.earnCalls).toHaveLength(before);

    const finalAgain = await submit('hunt-1', 'r3', 'howrah bridge', 'en');
    expect(finalAgain.rewardCoins).toBe(0);
    expect(ctx.earnCalls).toHaveLength(before);
  });

  it('concurrent duplicate correct submissions on the same riddle → +10 total, not +20', async () => {
    const ctx = setupState();
    // Simulate an in-flight duplicate: riddle already solved but progress not yet advanced.
    ctx.thp = { id: 'tp-1', userId: USER, huntId: 'hunt-1', currentRiddleId: 'r1', isCompleted: false, coinsEarned: 10 };
    ctx.rpByRiddle.set('r1', { id: 'rp-r1', userId: USER, huntId: 'hunt-1', riddleId: 'r1', attempts: 1, isCorrect: true, coinsEarned: 10, completedAt: new Date() });

    const res = await submit('hunt-1', 'r1', 'hooghly river', 'en');
    expect(res.correct).toBe(true);
    expect(res.rewardCoins).toBe(0);
    expect(ctx.earnCalls).toHaveLength(0);
    expect(ctx.thp.coinsEarned).toBe(10);
  });

  it('completion bonus is awarded exactly once and never per-riddle', async () => {
    const ctx = setupState();
    await submit('hunt-1', 'r1', 'hooghly river', 'en');
    await submit('hunt-1', 'r2', 'victoria memorial', 'en');
    await submit('hunt-1', 'r3', 'howrah bridge', 'en');
    const huntEarns = ctx.earnCalls.filter((e) => e.referenceType === 'TREASURE_HUNT');
    expect(huntEarns).toHaveLength(1);
    expect(huntEarns[0].amount).toBe(150);
    expect(huntEarns[0].reason).toBe('hunt_complete');
    // Every intermediate riddle must NOT have carried the completion bonus.
    expect(ctx.earnCalls.filter((e) => e.referenceType === 'RIDDLE' && e.amount > 10)).toHaveLength(0);
  });

  it('client cannot choose or inject a reward amount (schema strips reward fields; backend decides)', () => {
    const parsed = submitAnswerSchema.safeParse({ answer: 'hooghly river', language: 'en', rewardCoins: 999, coinsEarned: 500 });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual({ answer: 'hooghly river', language: 'en' });
      expect('rewardCoins' in parsed.data).toBe(false);
      expect('coinsEarned' in parsed.data).toBe(false);
    }
  });

  it('getRiddle and getHuntDetails report the canonical riddle reward (10), never the DB column value', async () => {
    const ctx = setupState([9999, 9999, 9999]);
    (prisma.riddle.findFirst as any).mockResolvedValue({
      id: 'r1',
      huntId: 'hunt-1',
      sequence: 1,
      rewardCoins: 9999,
      clueEnglish: 'clue',
      clueHindi: 'संकेत',
    });

    const riddle = await riddlesService.getRiddle('hunt-1', 'r1', LAT, LNG);
    expect(riddle.rewardCoins).toBe(10);

    const details = await riddlesService.getHuntDetails('hunt-1', LAT, LNG, USER);
    expect(details.rewardCoins).toBe(150); // hunt completion bonus (unchanged, separate)
    expect(details.riddles.every((r: any) => r.rewardCoins === 10)).toBe(true);
    expect(ctx.earnCalls).toHaveLength(0);
  });
});