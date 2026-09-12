import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../src/config/database', () => ({
  prisma: {
    treasureHunt: { findUnique: vi.fn() },
    treasureHuntProgress: { findUnique: vi.fn() },
    riddleProgress: { upsert: vi.fn(), update: vi.fn() },
    riddleDailyAttempt: { findUnique: vi.fn(), create: vi.fn() },
    riddle: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../src/modules/wallet/wallet.service', () => ({
  walletService: {
    earn: vi.fn(async () => ({ palPoints: 20 })),
  },
}));

vi.mock('../../src/shared/utils/reverseGeocode', () => ({
  reverseGeocodeToCity: vi.fn(async () => 'Kolkata'),
}));

import { prisma } from '../../src/config/database';
import { walletService } from '../../src/modules/wallet/wallet.service';
import { reverseGeocodeToCity } from '../../src/shared/utils/reverseGeocode';
import { riddlesService } from '../../src/modules/riddles/riddles.service';
import { TREASURE_HUNT_RIDDLE_REWARD_POINTS, TREASURE_HUNT_COMPLETION_BONUS_POINTS } from '../../src/modules/riddles/riddles.constants';
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
  dailyAttemptsByRiddle: Map<string, { isCorrect: boolean }>;
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
      rewardCoins: 20,
      status: 'ACTIVE',
      riddles,
    },
    dailyAttemptsByRiddle: new Map(),
  };

  (walletService.earn as any).mockImplementation(async (userId: string, amount: number, reason: string, referenceId: string, referenceType: string) => {
    ctx.earnCalls.push({ userId, amount, reason, referenceId, referenceType });
    return { palPoints: amount };
  });
  (reverseGeocodeToCity as any).mockResolvedValue('Kolkata');
  (prisma.treasureHunt.findUnique as any).mockResolvedValue(ctx.hunt);
  (prisma.riddleProgress.upsert as any).mockImplementation(async (args: any) => upsertRiddleProgress(ctx, args));
  (prisma.riddleProgress.update as any).mockImplementation(async (args: any) => {
    const riddleId = args.where.userId_riddleId.riddleId;
    const existing = ctx.rpByRiddle.get(riddleId);
    if (existing) {
      existing.attempts = existing.attempts + (args.data?.attempts?.increment ?? 0);
    }
    return existing ?? {};
  });
  (prisma.treasureHuntProgress.findUnique as any).mockImplementation(async () => ctx.thp);

  // Daily attempt: first call returns null (not yet attempted), then creates and remembers
  (prisma.riddleDailyAttempt.findUnique as any).mockImplementation(async ({ where }: any) => {
    return ctx.dailyAttemptsByRiddle.get(where.riddle_daily_attempts_user_riddle_date_key.riddleId) ?? null;
  });
  (prisma.riddleDailyAttempt.create as any).mockImplementation(async ({ data }: any) => {
    const rec = { ...data };
    ctx.dailyAttemptsByRiddle.set(data.riddleId, { isCorrect: data.isCorrect });
    return rec;
  });

  const tx = {
    riddleDailyAttempt: {
      create: async ({ data }: any) => {
        const rec = { ...data };
        ctx.dailyAttemptsByRiddle.set(data.riddleId, { isCorrect: data.isCorrect });
        return rec;
      },
    },
    riddleProgress: {
      findUnique: async ({ where }: any) => ctx.rpByRiddle.get(where.userId_riddleId.riddleId) ?? null,
      upsert: async (args: any) => upsertRiddleProgress(ctx, args),
      update: async (args: any) => {
        const riddleId = args.where.userId_riddleId.riddleId;
        const existing = ctx.rpByRiddle.get(riddleId);
        if (existing) existing.attempts += args.data?.attempts?.increment ?? 0;
        return existing ?? {};
      },
    },
    treasureHuntProgress: {
      findUnique: async () => ctx.thp,
      create: async ({ data }: any) => {
        ctx.thp = { id: 'tp-1', ...data, isCompleted: data.isCompleted ?? false, coinsEarned: data.coinsEarned ?? 0, startedAt: new Date(), completedAt: data.completedAt ?? null };
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

describe('Treasure Hunt scoring — canonical riddle reward = 20 pts, no completion bonus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('defines the canonical riddle reward as exactly 20, no completion bonus (0)', () => {
    expect(TREASURE_HUNT_RIDDLE_REWARD_POINTS).toBe(20);
    expect(TREASURE_HUNT_COMPLETION_BONUS_POINTS).toBe(0);
    expect(DAILY_OPEN_REWARD_POINTS).toBe(5);
    expect(DAILY_OPEN_EARN_REASON).toBe('daily_open');
  });

  it('correct English answer awards exactly 20 and writes the expected ledger + progress', async () => {
    const ctx = setupState();
    const res = await submit('hunt-1', 'r1', 'hooghly river', 'en');

    expect(res.correct).toBe(true);
    expect(res.rewardCoins).toBe(20);
    expect(res.dailyLocked).toBe(true);
    expect(res.alreadyAttemptedToday).toBe(false);
    expect(ctx.earnCalls).toHaveLength(1);
    expect(ctx.earnCalls[0]).toMatchObject({ userId: USER, amount: 20, reason: 'game_complete', referenceId: 'r1', referenceType: 'RIDDLE' });
    const rp = ctx.rpByRiddle.get('r1');
    expect(rp.isCorrect).toBe(true);
    expect(rp.coinsEarned).toBe(20);
    expect(ctx.thp.coinsEarned).toBe(20);
  });

  it('server is the source of truth: a drifted DB reward column (9999) still awards exactly 20, not 9999', async () => {
    const ctx = setupState([9999, 9999, 9999]);
    const res = await submit('hunt-1', 'r1', 'hooghly river', 'en');
    expect(res.rewardCoins).toBe(20);
    expect(ctx.earnCalls[0].amount).toBe(20);
  });

  it('Hindi correct answer awards exactly 20 (same reward as English, no language difference)', async () => {
    const ctx = setupState();
    const res = await submit('hunt-1', 'r1', 'हुगली नदी', 'hi');
    expect(res.correct).toBe(true);
    expect(res.rewardCoins).toBe(20);
    expect(ctx.earnCalls[0].amount).toBe(20);
    expect(ctx.earnCalls[0].reason).toBe('game_complete');
    expect(ctx.earnCalls[0].reason).not.toBe('daily_open');
  });

  it('wrong answer awards 0: no wallet credit, no coinsEarned mutation, dailyLocked=true', async () => {
    const ctx = setupState();
    const res = await submit('hunt-1', 'r1', 'wrong answer', 'en');
    expect(res.correct).toBe(false);
    expect(res.rewardCoins).toBe(0);
    expect(res.dailyLocked).toBe(true);
    expect(ctx.earnCalls).toHaveLength(0);
    expect(ctx.thp).toBeNull();
    const rp = ctx.rpByRiddle.get('r1');
    expect(rp.isCorrect).toBe(false);
    expect(rp.coinsEarned).toBe(0);
    expect(rp.attempts).toBe(1);
  });

  it('daily lock: second attempt same day (wrong) returns dailyLocked=true, 0 pts, alreadyAttemptedToday=true', async () => {
    const ctx = setupState();
    // First attempt (wrong) — locks for the day
    await submit('hunt-1', 'r1', 'wrong', 'en');
    // Second attempt same day (correct answer) — should be locked
    const res = await submit('hunt-1', 'r1', 'hooghly river', 'en');
    expect(res.dailyLocked).toBe(true);
    expect(res.alreadyAttemptedToday).toBe(true);
    expect(res.rewardCoins).toBe(0);
    // No wallet credit for the second attempt
    expect(ctx.earnCalls).toHaveLength(0);
  });

  it('daily lock: second attempt same day (correct again) returns alreadyAttemptedToday=true, 0 extra pts', async () => {
    // Pre-inject the daily attempt record for r1 (simulating first-attempt already happened)
    // without advancing the hunt progress pointer (so order check passes)
    const ctx = setupState();
    ctx.dailyAttemptsByRiddle.set('r1', { isCorrect: true });

    const res = await submit('hunt-1', 'r1', 'hooghly river', 'en');
    expect(res.alreadyAttemptedToday).toBe(true);
    expect(res.rewardCoins).toBe(0);
    // No additional wallet credit
    expect(ctx.earnCalls).toHaveLength(0);
  });

  it('wrong answer followed by correct answer next-day simulation → exactly one 20pt credit', async () => {
    // Simulate next-day by NOT having a daily attempt in the map (fresh ctx)
    const ctx = setupState();
    // Day 1: wrong (goes into daily attempt map)
    await submit('hunt-1', 'r1', 'wrong', 'en');
    expect(ctx.earnCalls).toHaveLength(0);
    // Day 2: clear daily attempts (simulate next IST day) then correct
    ctx.dailyAttemptsByRiddle.clear();
    const res = await submit('hunt-1', 'r1', 'hooghly river', 'en');
    expect(res.correct).toBe(true);
    expect(res.rewardCoins).toBe(20);
    expect(ctx.earnCalls).toHaveLength(1);
    expect(ctx.earnCalls[0].amount).toBe(20);
  });

  it('case/whitespace-normalized correct answer awards 20', async () => {
    setupState();
    const ok = await submit('hunt-1', 'r1', '  HOOGHLY   RIVER. ', 'en');
    expect(ok.correct).toBe(true);
    expect(ok.rewardCoins).toBe(20);
  });

  it('three correct riddles over three simulated days → +60 riddle points, NO completion bonus', async () => {
    const ctx = setupState();

    // Day 1: riddle 1
    const r1 = await submit('hunt-1', 'r1', 'hooghly river', 'en');
    expect(r1.rewardCoins).toBe(20);
    expect(r1.dailyLocked).toBe(true);

    // Day 2: riddle 2 (clear daily attempts)
    ctx.dailyAttemptsByRiddle.clear();
    const r2 = await submit('hunt-1', 'r2', 'victoria memorial', 'en');
    expect(r2.rewardCoins).toBe(20);

    // Day 3: riddle 3 (clear daily attempts)
    ctx.dailyAttemptsByRiddle.clear();
    const r3 = await submit('hunt-1', 'r3', 'howrah bridge', 'en');
    expect(r3.rewardCoins).toBe(20);

    const riddleEarns = ctx.earnCalls.filter((e) => e.referenceType === 'RIDDLE');
    const huntEarns = ctx.earnCalls.filter((e) => e.referenceType === 'TREASURE_HUNT');
    expect(riddleEarns).toHaveLength(3);
    expect(riddleEarns.reduce((s, e) => s + e.amount, 0)).toBe(60);
    // NO completion bonus — ever
    expect(huntEarns).toHaveLength(0);
    expect(ctx.thp.isCompleted).toBe(true);
    expect(ctx.thp.coinsEarned).toBe(60);
  });

  it('same-day duplicate submission (already attempted today) returns 0 pts, alreadyAttemptedToday=true', async () => {
    // Setup: manually inject a "today's attempt" for r1 without advancing progress,
    // so the order check passes and the daily-lock check fires.
    const ctx = setupState();
    // Manually mark r1 as already attempted today (no progress advancement)
    ctx.dailyAttemptsByRiddle.set('r1', { isCorrect: true });

    const again = await submit('hunt-1', 'r1', 'hooghly river', 'en');
    expect(again.correct).toBe(true); // reflects previous correct outcome
    expect(again.rewardCoins).toBe(0); // no extra award — already locked
    expect(again.dailyLocked).toBe(true);
    expect(again.alreadyAttemptedToday).toBe(true);
    // No wallet earn
    expect(ctx.earnCalls).toHaveLength(0);
  });

  it('same-day wrong-attempt lock: manual lock then correct answer still 0 pts', async () => {
    const ctx = setupState();
    ctx.dailyAttemptsByRiddle.set('r1', { isCorrect: false });

    const again = await submit('hunt-1', 'r1', 'hooghly river', 'en');
    expect(again.correct).toBe(false); // reflects previous wrong outcome
    expect(again.rewardCoins).toBe(0);
    expect(again.dailyLocked).toBe(true);
    expect(again.alreadyAttemptedToday).toBe(true);
    expect(ctx.earnCalls).toHaveLength(0);
  });

  it('no completion bonus awarded — TREASURE_HUNT referenceType earn never called', async () => {
    const ctx = setupState();
    ctx.dailyAttemptsByRiddle.clear();
    await submit('hunt-1', 'r1', 'hooghly river', 'en');
    ctx.dailyAttemptsByRiddle.clear();
    await submit('hunt-1', 'r2', 'victoria memorial', 'en');
    ctx.dailyAttemptsByRiddle.clear();
    await submit('hunt-1', 'r3', 'howrah bridge', 'en');

    const huntEarns = ctx.earnCalls.filter((e) => e.referenceType === 'TREASURE_HUNT');
    expect(huntEarns).toHaveLength(0);
    expect(TREASURE_HUNT_COMPLETION_BONUS_POINTS).toBe(0);
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

  it('getRiddle and getHuntDetails report the canonical riddle reward (20), never the DB column value', async () => {
    const ctx = setupState([9999, 9999, 9999]);
    ctx.hunt.rewardCoins = 9999;
    (prisma.riddle.findFirst as any).mockResolvedValue({
      id: 'r1',
      huntId: 'hunt-1',
      sequence: 1,
      rewardCoins: 9999,
      clueEnglish: 'clue',
      clueHindi: 'संकेत',
    });

    const riddle = await riddlesService.getRiddle('hunt-1', 'r1', LAT, LNG);
    expect(riddle.rewardCoins).toBe(20); // canonical, not DB value

    const details = await riddlesService.getHuntDetails('hunt-1', LAT, LNG, USER);
    expect(details.rewardCoins).toBe(20); // canonical riddle reward
    expect(details.riddles.every((r: any) => r.rewardCoins === 20)).toBe(true);
    expect(ctx.earnCalls).toHaveLength(0);
  });

  it('one-word typos are accepted and award exactly 20', async () => {
    const ctx = setupState();
    const t1 = await submit('hunt-1', 'r1', 'hooghly rivr', 'en');
    expect(t1.correct).toBe(true);
    expect(t1.rewardCoins).toBe(20);
    ctx.dailyAttemptsByRiddle.clear();
    const t2 = await submit('hunt-1', 'r2', 'victora memorial', 'en');
    expect(t2.correct).toBe(true);
    expect(t2.rewardCoins).toBe(20);
    ctx.dailyAttemptsByRiddle.clear();
    const t3 = await submit('hunt-1', 'r3', 'howrah brdige', 'en');
    expect(t3.correct).toBe(true);
    expect(t3.rewardCoins).toBe(20);
    // No completion bonus
    expect(ctx.earnCalls.filter((e) => e.referenceType === 'TREASURE_HUNT')).toHaveLength(0);
  });

  it('partial, extra, reordered and unrelated answers are rejected with 0 coins', async () => {
    const ctx = setupState();
    await submit('hunt-1', 'r1', 'hooghly river', 'en');
    ctx.dailyAttemptsByRiddle.clear();
    const partial = await submit('hunt-1', 'r2', 'memorial', 'en');
    expect(partial.correct).toBe(false);
    expect(partial.rewardCoins).toBe(0);
    ctx.dailyAttemptsByRiddle.clear();
    const reordered = await submit('hunt-1', 'r2', 'memorial victoria', 'en');
    expect(reordered.correct).toBe(false);
    ctx.dailyAttemptsByRiddle.clear();
    const extra = await submit('hunt-1', 'r2', 'victoria memorial kolkata', 'en');
    expect(extra.correct).toBe(false);
    ctx.dailyAttemptsByRiddle.clear();
    const unrelated = await submit('hunt-1', 'r2', 'gateway of india', 'en');
    expect(unrelated.correct).toBe(false);
    expect(ctx.earnCalls.filter((e) => e.referenceType === 'RIDDLE')).toHaveLength(1); // only r1
  });

  it('Hindi typo accepted under conservative rule; language is never mixed', async () => {
    setupState();
    const wrongLang = await submit('hunt-1', 'r1', 'hooghly river', 'hi');
    expect(wrongLang.correct).toBe(false);
    const ctx = setupState(); // fresh for isolation
    const hiTypo = await submit('hunt-1', 'r1', 'हुगली नदि', 'hi');
    expect(hiTypo.correct).toBe(true);
    expect(hiTypo.rewardCoins).toBe(20);
  });
});
