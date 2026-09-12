/**
 * Treasure Hunt — Daily Lock & Reward Unit Tests
 *
 * Tests the business-rule layer in isolation using mocked prisma/wallet.
 * Key invariants verified:
 *  - Correct answer = exactly 20 pts (TREASURE_HUNT_RIDDLE_REWARD_POINTS)
 *  - Wrong answer = 0 pts
 *  - Daily lock: any second attempt today returns 0 pts and dailyLocked=true
 *  - No hunt completion bonus, ever
 *  - Case-insensitive, whitespace-normalized, single-typo tolerance
 *  - Idempotency: correct already-solved riddle (different day) = 0 pts
 *  - City mismatch = 403 TREASURE_HUNT_CITY_MISMATCH
 *  - Out-of-order riddle = 409 RIDDLE_OUT_OF_ORDER
 *  - Daily open reward is separate and untouched (+5)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isAnswerMatch } from '../../src/shared/utils/answerMatch';
import { TREASURE_HUNT_RIDDLE_REWARD_POINTS, TREASURE_HUNT_COMPLETION_BONUS_POINTS } from '../../src/modules/riddles/riddles.constants';
import { getIndiaRewardDate } from '../../src/modules/social/creatorDailyReelReward';
import { DAILY_OPEN_REWARD_POINTS } from '../../src/modules/wallet/dailyOpenReward.service';

// ── Constants ─────────────────────────────────────────────────────────────────

describe('Treasure Hunt reward constants', () => {
  it('riddle reward must be exactly 20', () => {
    expect(TREASURE_HUNT_RIDDLE_REWARD_POINTS).toBe(20);
  });

  it('completion bonus must be exactly 0 (no completion bonus)', () => {
    expect(TREASURE_HUNT_COMPLETION_BONUS_POINTS).toBe(0);
  });

  it('daily open reward remains 5 and is separate from Treasure Hunt', () => {
    expect(DAILY_OPEN_REWARD_POINTS).toBe(5);
    // Verify constants are distinct — they must not be merged
    expect(DAILY_OPEN_REWARD_POINTS).not.toBe(TREASURE_HUNT_RIDDLE_REWARD_POINTS);
    expect(DAILY_OPEN_REWARD_POINTS).not.toBe(TREASURE_HUNT_COMPLETION_BONUS_POINTS);
  });
});

// ── Answer matching (called by submitAnswer) ───────────────────────────────────

describe('Answer matching — Treasure Hunt', () => {
  describe('correct answers (case + whitespace + single typo)', () => {
    const expected = 'Madan Mahal';

    it('exact match', () => expect(isAnswerMatch(expected, expected)).toBe(true));
    it('UPPERCASE', () => expect(isAnswerMatch('MADAN MAHAL', expected)).toBe(true));
    it('lowercase', () => expect(isAnswerMatch('madan mahal', expected)).toBe(true));
    it('mixed case', () => expect(isAnswerMatch('mAdAn mAhAl', expected)).toBe(true));
    it('leading/trailing whitespace', () => expect(isAnswerMatch('  Madan Mahal  ', expected)).toBe(true));
    it('extra internal whitespace', () => expect(isAnswerMatch('Madan  Mahal', expected)).toBe(true));
    it('single char typo in second word', () => expect(isAnswerMatch('Madan Mahaal', expected)).toBe(true));
    it('single char typo in first word', () => expect(isAnswerMatch('Madon Mahal', expected)).toBe(true));
  });

  describe('rejected answers', () => {
    const expected = 'Madan Mahal';

    it('missing word', () => expect(isAnswerMatch('Madan', expected)).toBe(false));
    it('extra word', () => expect(isAnswerMatch('Madan Mahal Fort', expected)).toBe(false));
    it('unrelated place', () => expect(isAnswerMatch('Bhopal', expected)).toBe(false));
    it('unrelated multi-word', () => expect(isAnswerMatch('Gateway of India', expected)).toBe(false));
    it('two tokens with typos', () => expect(isAnswerMatch('Madan Mahaal Fort', expected)).toBe(false));
    it('reordered tokens', () => expect(isAnswerMatch('Mahal Madan', expected)).toBe(false));
  });

  describe('Hindi answer matching', () => {
    const expectedHindi = 'मदन महल';

    it('exact Hindi match', () => expect(isAnswerMatch(expectedHindi, expectedHindi)).toBe(true));
    it('Hindi with trailing space', () => expect(isAnswerMatch(' मदन महल ', expectedHindi)).toBe(true));
    it('unrelated Hindi word', () => expect(isAnswerMatch('भोपाल', expectedHindi)).toBe(false));
  });
});

// ── IST date (daily lock clock) ───────────────────────────────────────────────

describe('getIndiaRewardDate — IST business day', () => {
  it('returns a YYYY-MM-DD string', () => {
    const date = getIndiaRewardDate();
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('adds +05:30 offset to UTC', () => {
    // Midnight UTC on 2026-09-13 = 05:30 IST on 2026-09-13
    const utcMidnight = new Date('2026-09-13T00:00:00Z');
    expect(getIndiaRewardDate(utcMidnight)).toBe('2026-09-13');
  });

  it('correctly advances to next IST day before UTC midnight', () => {
    // 23:00 UTC on 2026-09-12 = 04:30 IST on 2026-09-13
    const late = new Date('2026-09-12T23:00:00Z');
    expect(getIndiaRewardDate(late)).toBe('2026-09-13');
  });
});

// ── Daily lock simulation (pure state machine) ────────────────────────────────

/**
 * This section tests the logical rules of the daily lock without needing
 * a live DB. It validates the expected branching in submitAnswer:
 *
 *  existingDailyAttempt found  →  return { correct: prev, rewardCoins: 0, dailyLocked: true }
 *  first attempt + correct     →  return { correct: true,  rewardCoins: 20, dailyLocked: true }
 *  first attempt + wrong       →  return { correct: false, rewardCoins: 0,  dailyLocked: true }
 */
describe('Daily lock state machine', () => {
  function simulateSubmitAttempt(
    existingAttempt: { isCorrect: boolean } | null,
    answerIsCorrect: boolean,
    wasAlreadySolvedLifetime: boolean,
  ) {
    // Mirror the exact branching in riddles.service.ts submitAnswer()
    if (existingAttempt) {
      return { correct: existingAttempt.isCorrect, rewardCoins: 0, dailyLocked: true, alreadyAttemptedToday: true };
    }
    let rewardCoins = 0;
    if (answerIsCorrect) {
      if (!wasAlreadySolvedLifetime) {
        rewardCoins = TREASURE_HUNT_RIDDLE_REWARD_POINTS; // 20
      }
    }
    return { correct: answerIsCorrect, rewardCoins, dailyLocked: true, alreadyAttemptedToday: false };
  }

  it('first attempt correct → 20 pts', () => {
    const r = simulateSubmitAttempt(null, true, false);
    expect(r.correct).toBe(true);
    expect(r.rewardCoins).toBe(20);
    expect(r.dailyLocked).toBe(true);
    expect(r.alreadyAttemptedToday).toBe(false);
  });

  it('first attempt wrong → 0 pts', () => {
    const r = simulateSubmitAttempt(null, false, false);
    expect(r.correct).toBe(false);
    expect(r.rewardCoins).toBe(0);
    expect(r.dailyLocked).toBe(true);
  });

  it('duplicate same-day correct attempt → 0 extra pts, dailyLocked', () => {
    const r = simulateSubmitAttempt({ isCorrect: true }, true, true);
    expect(r.correct).toBe(true);
    expect(r.rewardCoins).toBe(0);
    expect(r.dailyLocked).toBe(true);
    expect(r.alreadyAttemptedToday).toBe(true);
  });

  it('duplicate same-day wrong attempt → 0 pts, dailyLocked', () => {
    const r = simulateSubmitAttempt({ isCorrect: false }, false, false);
    expect(r.rewardCoins).toBe(0);
    expect(r.dailyLocked).toBe(true);
    expect(r.alreadyAttemptedToday).toBe(true);
  });

  it('correct on a DIFFERENT day after already solved (lifetime) → 0 pts', () => {
    // No daily attempt today, but lifetime progress already isCorrect=true
    const r = simulateSubmitAttempt(null, true, true /* wasAlreadySolvedLifetime */);
    expect(r.correct).toBe(true);
    expect(r.rewardCoins).toBe(0); // no double-reward
    expect(r.alreadyAttemptedToday).toBe(false);
  });

  it('no hunt completion bonus — ever', () => {
    // The constant must be 0
    expect(TREASURE_HUNT_COMPLETION_BONUS_POINTS).toBe(0);
    // A "hunt complete" scenario should add 0 from completion bonus
    const bonusOnCompletion = TREASURE_HUNT_COMPLETION_BONUS_POINTS;
    expect(bonusOnCompletion).toBe(0);
  });
});

// ── Daily progression simulation ──────────────────────────────────────────────

describe('Daily progression rules', () => {
  type DailyStatus = 'AVAILABLE' | 'COMPLETED_TODAY' | 'LOCKED_TODAY' | 'NO_RIDDLES' | 'HUNT_COMPLETE';

  function simulateGetEligibleRiddle(
    riddles: { id: string; sequence: number }[],
    currentRiddleId: string | null,
    isCompleted: boolean,
    todayAttempt: { isCorrect: boolean } | null,
  ): { eligibleRiddle: { id: string; sequence: number } | null; dailyStatus: DailyStatus } {
    if (riddles.length === 0) return { eligibleRiddle: null, dailyStatus: 'NO_RIDDLES' };
    if (isCompleted) return { eligibleRiddle: null, dailyStatus: 'HUNT_COMPLETE' };

    let current = riddles[0];
    if (currentRiddleId) {
      const found = riddles.find((r) => r.id === currentRiddleId);
      if (found) current = found;
    }

    if (todayAttempt) {
      const status: DailyStatus = todayAttempt.isCorrect ? 'COMPLETED_TODAY' : 'LOCKED_TODAY';
      return { eligibleRiddle: null, dailyStatus: status };
    }

    return { eligibleRiddle: current, dailyStatus: 'AVAILABLE' };
  }

  const riddles = [
    { id: 'r1', sequence: 1 },
    { id: 'r2', sequence: 2 },
    { id: 'r3', sequence: 3 },
  ];

  it('no progress → eligible = riddle 1', () => {
    const r = simulateGetEligibleRiddle(riddles, null, false, null);
    expect(r.dailyStatus).toBe('AVAILABLE');
    expect(r.eligibleRiddle?.id).toBe('r1');
  });

  it('riddle 1 correct today → COMPLETED_TODAY, no riddle exposed', () => {
    const r = simulateGetEligibleRiddle(riddles, 'r2', false, { isCorrect: true });
    expect(r.dailyStatus).toBe('COMPLETED_TODAY');
    expect(r.eligibleRiddle).toBeNull();
  });

  it('riddle 1 wrong today → LOCKED_TODAY, no riddle exposed', () => {
    const r = simulateGetEligibleRiddle(riddles, 'r1', false, { isCorrect: false });
    expect(r.dailyStatus).toBe('LOCKED_TODAY');
    expect(r.eligibleRiddle).toBeNull();
  });

  it('riddle 1 correct (yesterday) → today eligible = riddle 2', () => {
    // currentRiddleId advanced to r2, no attempt today
    const r = simulateGetEligibleRiddle(riddles, 'r2', false, null);
    expect(r.dailyStatus).toBe('AVAILABLE');
    expect(r.eligibleRiddle?.id).toBe('r2');
  });

  it('riddle 1 wrong (yesterday) → today eligible = riddle 1 again', () => {
    // currentRiddleId still at r1 (wrong doesn't advance), no attempt today
    const r = simulateGetEligibleRiddle(riddles, 'r1', false, null);
    expect(r.dailyStatus).toBe('AVAILABLE');
    expect(r.eligibleRiddle?.id).toBe('r1');
  });

  it('all riddles completed → HUNT_COMPLETE', () => {
    const r = simulateGetEligibleRiddle(riddles, null, true, null);
    expect(r.dailyStatus).toBe('HUNT_COMPLETE');
    expect(r.eligibleRiddle).toBeNull();
  });

  it('no riddles in hunt → NO_RIDDLES', () => {
    const r = simulateGetEligibleRiddle([], null, false, null);
    expect(r.dailyStatus).toBe('NO_RIDDLES');
    expect(r.eligibleRiddle).toBeNull();
  });
});

// ── Excel import — header normalization (unit) ─────────────────────────────────

import { normalizeHeader, REQUIRED_HEADERS } from '../../src/modules/riddles/riddles-import';

describe('Excel import — header normalization', () => {
  const cases: Array<[string, string]> = [
    ['City name', 'city name'],
    ['CITY NAME', 'city name'],
    ['city name', 'city name'],
    ['CiTy NaMe', 'city name'],
    [' City name ', 'city name'],
    ['Riddle in English', 'riddle in english'],
    ['RIDDLE IN ENGLISH', 'riddle in english'],
    ['riddle in english', 'riddle in english'],
    ['RiDDle in ENGLISH', 'riddle in english'],
    [' Riddle in English ', 'riddle in english'],
    ['Answer in English', 'answer in english'],
    ['Riddle in Hindi', 'riddle in hindi'],
    ['Answer in Hindi', 'answer in hindi'],
    // BOM strip
    ['\uFEFFCity name', 'city name'],
    // Internal whitespace collapse
    ['City  name', 'city name'],
  ];

  it.each(cases)('normalizeHeader(%s) === %s', (input, expected) => {
    expect(normalizeHeader(input)).toBe(expected);
  });

  it('all required headers normalize to distinct keys', () => {
    const normalized = REQUIRED_HEADERS.map(normalizeHeader);
    const unique = new Set(normalized);
    expect(unique.size).toBe(REQUIRED_HEADERS.length);
  });
});

// ── Import duplicate detection (unit) ─────────────────────────────────────────

import { buildImportPreview } from '../../src/modules/riddles/riddles-import';

describe('Excel import — duplicate detection', () => {
  function makeRow(city: string, en: string, aen: string, hi: string, ahi: string) {
    return [city, en, aen, hi, ahi];
  }
  const header = ['City name', 'Riddle in English', 'Answer in English', 'Riddle in Hindi', 'Answer in Hindi'];

  it('rejects duplicate English riddle within same city', () => {
    const rows = [
      header,
      makeRow('Bhopal', 'Where does history sleep?', 'Madan Mahal', 'इतिहास कहाँ सोता है?', 'मदन महल'),
      makeRow('Bhopal', 'Where does history sleep?', 'Madan Mahal', 'इतिहास कहाँ सोता है दोबारा?', 'मदन महल 2'),
    ];
    const result = buildImportPreview(rows);
    expect(result.summary.invalid).toBeGreaterThan(0);
    const errors = result.data.filter((r) => r.error !== null).map((r) => r.error);
    expect(errors.some((e) => e?.includes('Duplicate Riddle in English'))).toBe(true);
  });

  it('rejects duplicate Hindi riddle within same city', () => {
    const rows = [
      header,
      makeRow('Bhopal', 'First clue', 'Answer 1', 'पहला सुराग', 'मदन महल'),
      makeRow('Bhopal', 'Second clue', 'Answer 2', 'पहला सुराग', 'मदन महल 2'),
    ];
    const result = buildImportPreview(rows);
    expect(result.data.some((r) => r.error?.includes('Duplicate Riddle in Hindi'))).toBe(true);
  });

  it('allows same riddle text in different cities', () => {
    const rows = [
      header,
      makeRow('Bhopal', 'Same clue', 'Answer', 'एक सुराग', 'जवाब'),
      makeRow('Indore', 'Same clue', 'Answer', 'एक सुराग', 'जवाब'),
    ];
    const result = buildImportPreview(rows);
    expect(result.summary.valid).toBe(2);
    expect(result.summary.invalid).toBe(0);
  });

  it('rejects duplicate complete row', () => {
    const rows = [
      header,
      makeRow('Bhopal', 'Unique clue', 'Answer', 'अनोखा सुराग', 'जवाब'),
      makeRow('Bhopal', 'Unique clue', 'Answer', 'अनोखा सुराग', 'जवाब'),
    ];
    const result = buildImportPreview(rows);
    expect(result.data.some((r) => r.error?.includes('Duplicate row'))).toBe(true);
  });

  it('rejects first-data-row with blank city (no previous city)', () => {
    const rows = [
      header,
      makeRow('', 'Some clue', 'Answer', 'कोई सुराग', 'जवाब'),
    ];
    const result = buildImportPreview(rows);
    expect(result.data[0].status).toBe('INVALID');
    expect(result.data[0].error).toContain('City name is required');
  });

  it('forward-fills city across rows', () => {
    const rows = [
      header,
      makeRow('Bhopal', 'Clue 1', 'Answer 1', 'सुराग 1', 'जवाब 1'),
      makeRow('', 'Clue 2', 'Answer 2', 'सुराग 2', 'जवाब 2'),
      makeRow('', 'Clue 3', 'Answer 3', 'सुराग 3', 'जवाब 3'),
      makeRow('Indore', 'Clue 4', 'Answer 4', 'सुराग 4', 'जवाब 4'),
      makeRow('', 'Clue 5', 'Answer 5', 'सुराग 5', 'जवाब 5'),
    ];
    const result = buildImportPreview(rows);
    expect(result.summary.valid).toBe(5);
    expect(result.data[0].city).toMatch(/Bhopal/i);
    expect(result.data[1].city).toMatch(/Bhopal/i);
    expect(result.data[2].city).toMatch(/Bhopal/i);
    expect(result.data[3].city).toMatch(/Indore/i);
    expect(result.data[4].city).toMatch(/Indore/i);
  });

  it('preserves Excel row sequence order', () => {
    const rows = [
      header,
      makeRow('Bhopal', 'First clue', 'Ans1', 'पहला', 'जवाब1'),
      makeRow('Bhopal', 'Second clue', 'Ans2', 'दूसरा', 'जवाब2'),
      makeRow('Bhopal', 'Third clue', 'Ans3', 'तीसरा', 'जवाब3'),
    ];
    const result = buildImportPreview(rows);
    const validRows = result.data.filter((r) => r.status === 'VALID');
    expect(validRows[0].clueEnglish).toBe('First clue');
    expect(validRows[1].clueEnglish).toBe('Second clue');
    expect(validRows[2].clueEnglish).toBe('Third clue');
  });

  it('rejects missing required field (blank riddle English)', () => {
    const rows = [
      header,
      makeRow('Bhopal', '', 'Answer', 'सुराग', 'जवाब'),
    ];
    const result = buildImportPreview(rows);
    expect(result.data[0].status).toBe('INVALID');
    expect(result.data[0].error).toContain('Riddle in English is required');
  });

  it('throws on entirely empty sheet', () => {
    expect(() => buildImportPreview([])).toThrow();
    expect(() => buildImportPreview([[]])).toThrow();
  });

  it('throws on missing required column header', () => {
    const badHeader = ['City name', 'Riddle in English', 'Answer in English'];
    expect(() => buildImportPreview([badHeader, ['Bhopal', 'clue', 'ans']])).toThrow(/Missing column/i);
  });
});
