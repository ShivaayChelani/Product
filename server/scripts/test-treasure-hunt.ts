import { prisma } from '../src/config/database';
import { riddlesService } from '../src/modules/riddles/riddles.service';
import { TREASURE_HUNT_RIDDLE_REWARD_POINTS, TREASURE_HUNT_COMPLETION_BONUS_POINTS } from '../src/modules/riddles/riddles.constants';
import * as XLSX from 'xlsx';
import assert from 'assert';

/**
 * E2E smoke-test for the PALSAFAR Treasure Hunt text-riddle flow.
 *
 * CURRENT BUSINESS RULES (2026-09-13):
 *   - Correct riddle answer  = +20 pts  (TREASURE_HUNT_RIDDLE_REWARD_POINTS)
 *   - Wrong riddle answer    =  0 pts
 *   - Hunt completion bonus  =  0 pts  (TREASURE_HUNT_COMPLETION_BONUS_POINTS = 0)
 *   - Daily app-open reward  = +5 pts  (separate service, not tested here)
 *   - Daily lock: one attempt per user/riddle/IST-day via RiddleDailyAttempt
 *   - submitAnswer response shape:
 *       { correct, rewardCoins, dailyLocked, alreadyAttemptedToday }
 *     (huntCompleteReward, huntCompleted, nextRiddle do NOT exist in the response)
 *
 * Test blocks:
 *   15. Constant invariants: RIDDLE_REWARD=20, COMPLETION_BONUS=0
 *   1.  Excel valid format â†’ all rows VALID, sequence = row order
 *   2.  Missing column â†’ 400 "Missing column: ..."
 *   3.  Empty cell (city/answer) â†’ row flagged INVALID with message
 *   4.  Duplicate row â†’ second row INVALID "Duplicate row"
 *   5.  Invalid/Garbage Excel bytes â†’ 400 friendly error
 *   7.  Multi-city import â†’ one hunt per city, importLogId stamped
 *   8.  GPS city â†’ correct current city hunt returned
 *   10. No answer/clue leak; rewardCoins = 20 (constant, not DB column)
 *   9.  Wrong-city access â†’ 403 TREASURE_HUNT_CITY_MISMATCH
 *   13. Out-of-order / skip riddle â†’ 409 RIDDLE_OUT_OF_ORDER
 *   11. Wrong answer â†’ correct:false, 0 coins, dailyLocked=true
 *   11b.Daily lock: same-day re-attempt â†’ alreadyAttemptedToday=true, 0 coins
 *   12. Correct answer (normalized) â†’ +20 coins, single RIDDLE tx, dailyLocked=true
 *   6.  Hindi answers â†’ language:'hi' path, no language mixing, rewardCoins=20
 *   14. Final riddle â†’ isCompleted, coinsEarned=60 (3Ã—20), zero TREASURE_HUNT txs
 *   8b. Delhi GPS â†’ Delhi hunt, Kolkata GPS â†’ Kolkata hunt
 *   E.  getEligibleRiddle: AVAILABLE / HUNT_COMPLETE
 *
 * MUST be run against a TEST database â€” NOT production.
 * Run: npx ts-node scripts/test-treasure-hunt.ts
 */

const ADMIN_ID  = 'test-th-admin-001';
const USER_ID   = 'test-th-user-001';
const FILE_NAME = `test-import-${Date.now()}.xlsx`;

const KOL = { lat: 22.5726, lng: 88.3639 };
const DEL = { lat: 28.6139, lng: 77.2090 };

const R1 = {
  city: 'Kolkata',
  clueEnglish: 'White landmark across from the Maidan',
  answerEnglish: 'Victoria Memorial',
  clueHindi: 'à¤®à¥ˆà¤¦à¤¾à¤¨ à¤•à¥‡ à¤¸à¤¾à¤®à¤¨à¥‡ à¤¸à¤«à¥‡à¤¦ à¤¸à¥à¤®à¤¾à¤°à¤•',
  answerHindi: 'à¤µà¤¿à¤•à¥à¤Ÿà¥‹à¤°à¤¿à¤¯à¤¾ à¤®à¥‡à¤®à¥‹à¤°à¤¿à¤¯à¤²',
};
const R2 = {
  city: 'Kolkata',
  clueEnglish: 'The river that flows through Kolkata',
  answerEnglish: 'Hooghly river',
  clueHindi: 'à¤•à¥‹à¤²à¤•à¤¾à¤¤à¤¾ à¤¸à¥‡ à¤¬à¤¹à¤¨à¥‡ à¤µà¤¾à¤²à¥€ à¤¨à¤¦à¥€',
  answerHindi: 'à¤¹à¥à¤—à¤²à¥€ à¤¨à¤¦à¥€',
};
const R3 = {
  city: 'Kolkata',
  clueEnglish: 'The final treasure bridge over the Hooghly',
  answerEnglish: 'Howrah Bridge',
  clueHindi: 'à¤¹à¥à¤—à¤²à¥€ à¤ªà¤° à¤¬à¤¨à¤¾ à¤…à¤‚à¤¤à¤¿à¤® à¤–à¤œà¤¾à¤¨à¤¾ à¤ªà¥à¤²',
  answerHindi: 'à¤¹à¤¾à¤µà¤¡à¤¼à¤¾ à¤¬à¥à¤°à¤¿à¤œ',
};
const D1 = {
  city: 'Delhi',
  clueEnglish: 'The Red Fort gateway city hunt',
  answerEnglish: 'Lal Qila',
  clueHindi: 'à¤²à¤¾à¤² à¤•à¤¿à¤²à¤¾ à¤¶à¤¹à¤°',
  answerHindi: 'à¤²à¤¾à¤² à¤•à¤¿à¤²à¤¾',
};

const HEADERS = ['City name', 'Riddle in English', 'Answer in English', 'Riddle in Hindi', 'Answer in Hindi'];

let passed = 0;
let failed = 0;
const failures: string[] = [];

function makeXlsx(rows: any[][]): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Riddles');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

async function expectReject(name: string, fn: () => Promise<any>, status: number, code?: string) {
  try {
    await fn();
    throw new Error(`${name}: expected to throw ${status}${code ? ' ' + code : ''} but did not`);
  } catch (err: any) {
    if (err.message === `${name}: expected to throw ${status}${code ? ' ' + code : ''} but did not`) throw err;
    const actualStatus = err.statusCode as number | undefined;
    assert.strictEqual(actualStatus, status, `${name}: expected status ${status}, got ${actualStatus} (${err.code || err.message})`);
    if (code) {
      const actualCode = err.code || err.message;
      assert.ok(String(actualCode).includes(code), `${name}: expected code ${code}, got ${actualCode}`);
    }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function run() {
  console.log('--- STARTING PALSAFAR TREASURE HUNT E2E (text-riddle) TESTS ---');
  console.log(`    Riddle reward    : ${TREASURE_HUNT_RIDDLE_REWARD_POINTS} pts`);
  console.log(`    Completion bonus : ${TREASURE_HUNT_COMPLETION_BONUS_POINTS} pts (none)`);

  for (let i = 0; i < 5; i++) {
    try {
      await prisma.$connect();
      console.log('DB connected');
      break;
    } catch (e) {
      console.log('DB connection failed, retrying...', (e as Error).message);
      await sleep(2000);
    }
  }

  let kolkataHuntId = '';
  let delhiHuntId   = '';
  const createdHuntIds: string[]   = [];
  const createdRiddleIds: string[] = [];

  // ---------- setup test users ----------
  await prisma.user.upsert({
    where:  { id: ADMIN_ID },
    update: {},
    create: { id: ADMIN_ID, email: 'test-th-admin@example.com', name: 'Test Admin', permission: 'USER' },
  });
  await prisma.user.upsert({
    where:  { id: USER_ID },
    update: {},
    create: { id: USER_ID, email: 'test-th-user@example.com', name: 'Test User', permission: 'USER' },
  });

  const cleanup = async () => {
    // Daily attempts are FK children of riddles/users â€” delete first
    for (const huntId of createdHuntIds) {
      await prisma.riddleDailyAttempt.deleteMany({ where: { huntId } });
    }
    await prisma.riddleDailyAttempt.deleteMany({ where: { userId: USER_ID } });
    for (const huntId of createdHuntIds) {
      await prisma.riddleProgress.deleteMany({ where: { huntId } });
      await prisma.treasureHuntProgress.deleteMany({ where: { huntId } });
      await prisma.riddle.deleteMany({ where: { huntId } });
      await prisma.treasureHunt.deleteMany({ where: { id: huntId } });
    }
    await prisma.riddleProgress.deleteMany({ where: { riddleId: { in: createdRiddleIds } } });
    await prisma.walletTransaction.deleteMany({ where: { userId: USER_ID } });
    await prisma.wallet.deleteMany({ where: { userId: USER_ID } });
    await prisma.walletTransaction.deleteMany({ where: { userId: ADMIN_ID } });
    await prisma.wallet.deleteMany({ where: { userId: ADMIN_ID } });
    await prisma.treasureHuntImportLog.deleteMany({ where: { fileName: FILE_NAME } });
    await prisma.user.deleteMany({ where: { id: { in: [ADMIN_ID, USER_ID] } } });
  };

  try {

    // â”€â”€ TEST 15: Constant invariants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    try {
      assert.strictEqual(TREASURE_HUNT_RIDDLE_REWARD_POINTS, 20,
        `Riddle reward must be 20, got ${TREASURE_HUNT_RIDDLE_REWARD_POINTS}`);
      assert.strictEqual(TREASURE_HUNT_COMPLETION_BONUS_POINTS, 0,
        `Completion bonus must be 0, got ${TREASURE_HUNT_COMPLETION_BONUS_POINTS}`);
      console.log('âœ… TEST 15: Constants â€” RIDDLE_REWARD=20, COMPLETION_BONUS=0');
      passed++;
    } catch (e: any) {
      failed++; failures.push(`TEST 15: ${e.message}`);
      console.error('âŒ TEST 15 FAILED:', e.message);
    }

    // â”€â”€ TEST 1: Correct Excel format â†’ all rows VALID â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    try {
      const buf = makeXlsx([HEADERS, [R1.city, R1.clueEnglish, R1.answerEnglish, R1.clueHindi, R1.answerHindi]]);
      const res = await riddlesService.bulkImportValidate(buf);
      assert.strictEqual(res.summary.total, 1);
      assert.strictEqual(res.summary.valid, 1);
      assert.strictEqual(res.summary.invalid, 0);
      assert.strictEqual(res.data[0].status, 'VALID');
      assert.strictEqual(res.data[0].city, 'Kolkata');
      assert.strictEqual(res.data[0].clueEnglish, R1.clueEnglish);
      assert.strictEqual(res.data[0].answerEnglish, R1.answerEnglish);
      console.log('âœ… TEST 1: Correct Excel format passed (1 valid row, city detected)');
      passed++;
    } catch (e: any) {
      failed++; failures.push(`TEST 1: ${e.message}`);
      console.error('âŒ TEST 1 FAILED:', e.message);
    }

    // â”€â”€ TEST 2: Missing column â†’ 400 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    try {
      const badHeaders = ['City name', 'Riddle in English', 'Answer in English', 'Riddle in Hindi'];
      const buf = makeXlsx([badHeaders, [R1.city, R1.clueEnglish, R1.answerEnglish, R1.clueHindi]]);
      await expectReject('TEST 2', () => riddlesService.bulkImportValidate(buf), 400, 'Missing column');
      console.log('âœ… TEST 2: Missing column rejected with 400');
      passed++;
    } catch (e: any) {
      failed++; failures.push(`TEST 2: ${e.message}`);
      console.error('âŒ TEST 2 FAILED:', e.message);
    }

    // â”€â”€ TEST 3: Empty cells â†’ INVALID with message â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    try {
      const buf = makeXlsx([
        HEADERS,
        ['', R1.clueEnglish, R1.answerEnglish, R1.clueHindi, R1.answerHindi],
        [R1.city, R1.clueEnglish, '', R1.clueHindi, R1.answerHindi],
      ]);
      const res = await riddlesService.bulkImportValidate(buf);
      assert.strictEqual(res.summary.invalid, 2);
      assert.ok(res.data[0].status === 'INVALID' && res.data[0].error.includes('City name is required'));
      assert.ok(res.data[1].status === 'INVALID' && res.data[1].error.includes('Answer in English is required'));
      console.log('âœ… TEST 3: Empty cells flagged INVALID with messages');
      passed++;
    } catch (e: any) {
      failed++; failures.push(`TEST 3: ${e.message}`);
      console.error('âŒ TEST 3 FAILED:', e.message);
    }

    // â”€â”€ TEST 4: Duplicate row â†’ second row INVALID â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    try {
      const dup = [R1.city, R1.clueEnglish, R1.answerEnglish, R1.clueHindi, R1.answerHindi];
      const buf = makeXlsx([HEADERS, dup, dup]);
      const res = await riddlesService.bulkImportValidate(buf);
      assert.strictEqual(res.data[0].status, 'VALID');
      assert.strictEqual(res.data[1].status, 'INVALID');
      assert.ok(res.data[1].error.includes('Duplicate row'));
      console.log('âœ… TEST 4: Duplicate row flagged INVALID');
      passed++;
    } catch (e: any) {
      failed++; failures.push(`TEST 4: ${e.message}`);
      console.error('âŒ TEST 4 FAILED:', e.message);
    }

    // â”€â”€ TEST 5: Garbage file â†’ 400 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    try {
      const garbage = Buffer.from('this is definitely not an excel file', 'utf8');
      await expectReject('TEST 5', () => riddlesService.bulkImportValidate(garbage), 400);
      console.log('âœ… TEST 5: Garbage file rejected with 400');
      passed++;
    } catch (e: any) {
      failed++; failures.push(`TEST 5: ${e.message}`);
      console.error('âŒ TEST 5 FAILED:', e.message);
    }

    // â”€â”€ TEST 7: Multi-city import â†’ one hunt per city, importLogId stamped â”€â”€â”€
    try {
      const buf = makeXlsx([
        HEADERS,
        [R1.city, R1.clueEnglish, R1.answerEnglish, R1.clueHindi, R1.answerHindi],
        [R2.city, R2.clueEnglish, R2.answerEnglish, R2.clueHindi, R2.answerHindi],
        [R3.city, R3.clueEnglish, R3.answerEnglish, R3.clueHindi, R3.answerHindi],
        [D1.city, D1.clueEnglish, D1.answerEnglish, D1.clueHindi, D1.answerHindi],
      ]);
      const res = await riddlesService.bulkImportValidate(buf);
      assert.strictEqual(res.summary.valid, 4);
      const validRows = res.data.filter((r: any) => r.status === 'VALID');
      const importRes = await riddlesService.bulkImportExecute({
        validRows,
        fileName: FILE_NAME,
        uploadedById: ADMIN_ID,
        totalRows: res.summary.total,
        invalidRows: res.summary.invalid,
        cities: [...new Set(validRows.map((r: any) => r.city))],
      });
      assert.strictEqual(importRes.imported, 4);

      const kolHunt = await prisma.treasureHunt.findUnique({ where: { city: 'Kolkata' } });
      const delHunt = await prisma.treasureHunt.findUnique({ where: { city: 'Delhi' } });
      assert.ok(kolHunt, 'Kolkata hunt missing');
      assert.ok(delHunt, 'Delhi hunt missing');
      kolkataHuntId = kolHunt!.id;
      delhiHuntId   = delHunt!.id;
      createdHuntIds.push(kolkataHuntId, delhiHuntId);

      const kolRiddles = await prisma.riddle.findMany({
        where: { huntId: kolkataHuntId },
        orderBy: { sequence: 'asc' },
      });
      assert.strictEqual(kolRiddles.length, 3);
      assert.strictEqual(kolRiddles[0].sequence, 1);
      assert.strictEqual(kolRiddles[1].sequence, 2);
      assert.strictEqual(kolRiddles[2].sequence, 3);
      assert.strictEqual(kolRiddles[0].answerEnglish, 'Victoria Memorial');
      // importLogId must be stamped on every riddle (ownership tracking for deletion)
      assert.ok(kolRiddles.every((r) => r.importLogId !== null), 'importLogId missing on some riddles');
      createdRiddleIds.push(...kolRiddles.map((r) => r.id));

      const log = await prisma.treasureHuntImportLog.findFirst({
        where: { fileName: FILE_NAME, uploadedById: ADMIN_ID },
        orderBy: { createdAt: 'desc' },
      });
      assert.ok(log, 'import log missing');
      assert.strictEqual(log!.status, 'COMPLETED');
      assert.strictEqual(log!.validRows, 4);
      assert.ok(log!.cities.includes('Kolkata') && log!.cities.includes('Delhi'));
      console.log('âœ… TEST 7: Multi-city import created hunts + import log, sequence = row order, importLogId stamped');
      passed++;
    } catch (e: any) {
      failed++; failures.push(`TEST 7: ${e.message}`);
      console.error('âŒ TEST 7 FAILED:', e.message);
    }

    await sleep(1500);

    // â”€â”€ TEST 8: GPS city â†’ current city hunt (Kolkata) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    try {
      const res = await riddlesService.getCurrentCityHunt(KOL.lat, KOL.lng);
      assert.strictEqual(res.city, 'Kolkata');
      assert.ok(res.hunt, 'no hunt for Kolkata');
      assert.strictEqual(res.hunt!.id, kolkataHuntId);
      assert.strictEqual(res.hunt!.riddleCount, 3);
      console.log('âœ… TEST 8: GPS city resolution returned Kolkata hunt (riddleCount 3)');
      passed++;
    } catch (e: any) {
      failed++; failures.push(`TEST 8: ${e.message}`);
      console.error('âŒ TEST 8 FAILED:', e.message);
    }

    // â”€â”€ TEST 10: No answer/clue leak; canonical rewardCoins = 20 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    try {
      const details = await riddlesService.getHuntDetails(kolkataHuntId, KOL.lat, KOL.lng, USER_ID);
      assert.strictEqual(details.riddles.length, 3);
      for (const r of details.riddles as any[]) {
        // Only id, sequence, rewardCoins â€” never answerEnglish/answerHindi/clues
        assert.deepStrictEqual(Object.keys(r).sort(), ['id', 'rewardCoins', 'sequence']);
        // Backend overrides DB column: must always be canonical 20
        assert.strictEqual(r.rewardCoins, 20);
      }
      const r1 = await riddlesService.getRiddle(kolkataHuntId, createdRiddleIds[0], KOL.lat, KOL.lng);
      assert.strictEqual(r1.clueEnglish, R1.clueEnglish);
      assert.strictEqual(r1.clueHindi, R1.clueHindi);
      // Answers must never be exposed
      assert.strictEqual((r1 as any).answerEnglish, undefined);
      assert.strictEqual((r1 as any).answerHindi, undefined);
      assert.strictEqual(r1.rewardCoins, 20);
      console.log('âœ… TEST 10: No answer/clue leak; rewardCoins=20 (constant, not DB column)');
      passed++;
    } catch (e: any) {
      failed++; failures.push(`TEST 10: ${e.message}`);
      console.error('âŒ TEST 10 FAILED:', e.message);
    }

    await sleep(1500);

    // â”€â”€ TEST 9: Wrong-city access â†’ 403 TREASURE_HUNT_CITY_MISMATCH â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    try {
      await expectReject(
        'TEST 9a (getRiddle from Delhi)',
        () => riddlesService.getRiddle(kolkataHuntId, createdRiddleIds[0], DEL.lat, DEL.lng),
        403, 'TREASURE_HUNT_CITY_MISMATCH',
      );
      await expectReject(
        'TEST 9b (getHuntDetails from Delhi)',
        () => riddlesService.getHuntDetails(kolkataHuntId, DEL.lat, DEL.lng, USER_ID),
        403, 'TREASURE_HUNT_CITY_MISMATCH',
      );
      await expectReject(
        'TEST 9c (submitAnswer from Delhi)',
        () => riddlesService.submitAnswer(kolkataHuntId, createdRiddleIds[0], USER_ID, 'Victoria Memorial', 'en', DEL.lat, DEL.lng),
        403, 'TREASURE_HUNT_CITY_MISMATCH',
      );
      await expectReject(
        'TEST 9d (getEligibleRiddle from Delhi)',
        () => riddlesService.getEligibleRiddle(kolkataHuntId, DEL.lat, DEL.lng, USER_ID),
        403, 'TREASURE_HUNT_CITY_MISMATCH',
      );
      console.log('âœ… TEST 9: Wrong-city riddle/hunt/submit/eligible rejected with 403');
      passed++;
    } catch (e: any) {
      failed++; failures.push(`TEST 9: ${e.message}`);
      console.error('âŒ TEST 9 FAILED:', e.message);
    }

    await sleep(1500);

    // â”€â”€ TEST 13: Out-of-order answer â†’ 409 RIDDLE_OUT_OF_ORDER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    try {
      await expectReject(
        'TEST 13a (skip to riddle 2)',
        () => riddlesService.submitAnswer(kolkataHuntId, createdRiddleIds[1], USER_ID, 'Hooghly river', 'en', KOL.lat, KOL.lng),
        409, 'RIDDLE_OUT_OF_ORDER',
      );
      console.log('âœ… TEST 13: Out-of-order answer rejected with 409');
      passed++;
    } catch (e: any) {
      failed++; failures.push(`TEST 13: ${e.message}`);
      console.error('âŒ TEST 13 FAILED:', e.message);
    }

    await sleep(1500);

    // â”€â”€ TEST 11: Wrong answer â†’ 0 coins, dailyLocked=true â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    try {
      const res = await riddlesService.submitAnswer(
        kolkataHuntId, createdRiddleIds[0], USER_ID, 'Taj Mahal', 'en', KOL.lat, KOL.lng,
      );
      assert.strictEqual(res.correct, false);
      assert.strictEqual(res.rewardCoins, 0);
      assert.strictEqual(res.dailyLocked, true);
      assert.strictEqual(res.alreadyAttemptedToday, false);
      // Old fields must NOT exist
      assert.strictEqual((res as any).huntCompleteReward, undefined, 'huntCompleteReward must not be in response');
      assert.strictEqual((res as any).huntCompleted, undefined, 'huntCompleted must not be in response');
      assert.strictEqual((res as any).nextRiddle, undefined, 'nextRiddle must not be in response');

      // RiddleProgress attempt recorded
      const rp = await prisma.riddleProgress.findUnique({
        where: { userId_riddleId: { userId: USER_ID, riddleId: createdRiddleIds[0] } },
      });
      assert.ok(rp, 'riddleProgress must exist after wrong answer');
      assert.strictEqual(rp!.attempts, 1);
      assert.strictEqual(rp!.isCorrect, false);

      // Daily attempt record created with isCorrect=false
      const da = await prisma.riddleDailyAttempt.findFirst({
        where: { userId: USER_ID, riddleId: createdRiddleIds[0] },
      });
      assert.ok(da, 'dailyAttempt record missing after wrong answer');
      assert.strictEqual(da!.isCorrect, false);

      // No wallet transaction
      const txs = await prisma.walletTransaction.findMany({
        where: { userId: USER_ID, referenceId: createdRiddleIds[0] },
      });
      assert.strictEqual(txs.length, 0, 'no wallet tx should exist after wrong answer');
      console.log('âœ… TEST 11: Wrong answer â†’ correct:false, 0 coins, dailyLocked=true, daily attempt recorded');
      passed++;
    } catch (e: any) {
      failed++; failures.push(`TEST 11: ${e.message}`);
      console.error('âŒ TEST 11 FAILED:', e.message);
    }

    await sleep(1500);

    // â”€â”€ TEST 11b: Daily lock â€” same-day re-attempt â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // riddle[0] was attempted wrong above; same-day correct answer is still locked
    try {
      const locked = await riddlesService.submitAnswer(
        kolkataHuntId, createdRiddleIds[0], USER_ID, 'Victoria Memorial', 'en', KOL.lat, KOL.lng,
      );
      assert.strictEqual(locked.correct, false);           // previous wrong outcome preserved
      assert.strictEqual(locked.rewardCoins, 0);
      assert.strictEqual(locked.dailyLocked, true);
      assert.strictEqual(locked.alreadyAttemptedToday, true);

      const txs = await prisma.walletTransaction.findMany({
        where: { userId: USER_ID, referenceId: createdRiddleIds[0] },
      });
      assert.strictEqual(txs.length, 0, 'no tx after same-day locked re-submission');
      console.log('âœ… TEST 11b: Daily lock â€” same-day re-attempt blocked, alreadyAttemptedToday=true, 0 coins');
      passed++;
    } catch (e: any) {
      failed++; failures.push(`TEST 11b: ${e.message}`);
      console.error('âŒ TEST 11b FAILED:', e.message);
    }

    await sleep(1500);

    // â”€â”€ Simulate next IST day: delete today's daily attempt for riddle[0] â”€â”€â”€â”€â”€
    // The daily attempt for USER/riddle[0]/today was wrong; removing it lets
    // us test "next day, same riddle becomes available again" without waiting
    // until real IST midnight.  This test user is fully isolated.
    console.log('    [Setup] Deleting daily attempt for riddle[0] to simulate next IST day...');
    await prisma.riddleDailyAttempt.deleteMany({
      where: { userId: USER_ID, riddleId: createdRiddleIds[0] },
    });

    // â”€â”€ TEST 12: Correct answer (normalized) â†’ +20 coins, no double credit â”€â”€â”€â”€
    try {
      const res = await riddlesService.submitAnswer(
        kolkataHuntId, createdRiddleIds[0], USER_ID,
        '  VICTORIA   MEMORIAL. ', 'en', KOL.lat, KOL.lng,
      );
      assert.strictEqual(res.correct, true);
      assert.strictEqual(res.rewardCoins, 20);
      assert.strictEqual(res.dailyLocked, true);
      assert.strictEqual(res.alreadyAttemptedToday, false);
      // Old fields must NOT exist
      assert.strictEqual((res as any).huntCompleteReward, undefined, 'huntCompleteReward must not be in response');
      assert.strictEqual((res as any).huntCompleted, undefined, 'huntCompleted must not be in response');
      assert.strictEqual((res as any).nextRiddle, undefined, 'nextRiddle must not be in response');

      // Exactly one RIDDLE wallet tx for 20 pts
      const txs = await prisma.walletTransaction.findMany({
        where: { userId: USER_ID, referenceId: createdRiddleIds[0], referenceType: 'RIDDLE' },
      });
      assert.strictEqual(txs.length, 1, 'exactly one RIDDLE tx expected');
      assert.strictEqual(txs[0].amount, 20);

      // Hunt progress advances to riddle[1]
      const thp = await prisma.treasureHuntProgress.findUnique({
        where: { userId_huntId: { userId: USER_ID, huntId: kolkataHuntId } },
      });
      assert.ok(thp, 'TreasureHuntProgress must exist');
      assert.strictEqual(thp!.currentRiddleId, createdRiddleIds[1]);
      assert.strictEqual(thp!.isCompleted, false);
      assert.strictEqual(thp!.coinsEarned, 20);

      // Re-answer of riddle[0] after progress advanced: blocked by order guard (409).
      // Either way, no double credit.
      let reAnswerResult: any = null;
      try {
        reAnswerResult = await riddlesService.submitAnswer(
          kolkataHuntId, createdRiddleIds[0], USER_ID, 'Victoria Memorial', 'en', KOL.lat, KOL.lng,
        );
        // If reached (daily lock path): must be 0 coins
        assert.strictEqual(reAnswerResult.rewardCoins, 0, 'no extra coins on blocked re-answer');
      } catch (err: any) {
        // Order guard fired first (409) â€” equally valid, no credit was issued
        assert.ok(err.statusCode === 409 || err.code === 'RIDDLE_OUT_OF_ORDER',
          `unexpected error on re-answer: ${err.message}`);
      }
      const txsAfter = await prisma.walletTransaction.findMany({
        where: { userId: USER_ID, referenceId: createdRiddleIds[0], referenceType: 'RIDDLE' },
      });
      assert.strictEqual(txsAfter.length, 1, 'no double reward for riddle[0]');

      console.log('âœ… TEST 12: Normalized correct answer â†’ +20 coins, single RIDDLE tx, no double credit');
      passed++;
    } catch (e: any) {
      failed++; failures.push(`TEST 12: ${e.message}`);
      console.error('âŒ TEST 12 FAILED:', e.message);
    }

    await sleep(1500);

    // â”€â”€ TEST 6: Hindi-only validation & language isolation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    try {
      // English answer with language='hi' â†’ NOT accepted
      const enInHi = await riddlesService.submitAnswer(
        kolkataHuntId, createdRiddleIds[1], USER_ID, 'Hooghly river', 'hi', KOL.lat, KOL.lng,
      );
      assert.strictEqual(enInHi.correct, false);
      assert.strictEqual(enInHi.rewardCoins, 0);
      assert.strictEqual(enInHi.dailyLocked, true);

      // Clear this wrong daily attempt so correct Hindi answer can proceed
      await prisma.riddleDailyAttempt.deleteMany({
        where: { userId: USER_ID, riddleId: createdRiddleIds[1] },
      });

      const ok = await riddlesService.submitAnswer(
        kolkataHuntId, createdRiddleIds[1], USER_ID, 'à¤¹à¥à¤—à¤²à¥€ à¤¨à¤¦à¥€', 'hi', KOL.lat, KOL.lng,
      );
      assert.strictEqual(ok.correct, true);
      assert.strictEqual(ok.rewardCoins, 20);
      assert.strictEqual((ok as any).nextRiddle, undefined, 'nextRiddle must not be in response');

      const txs = await prisma.walletTransaction.findMany({
        where: { userId: USER_ID, referenceId: createdRiddleIds[1], referenceType: 'RIDDLE' },
      });
      assert.strictEqual(txs.length, 1, 'exactly one RIDDLE tx for riddle[1]');
      assert.strictEqual(txs[0].amount, 20);
      console.log('âœ… TEST 6: Hindi answers validated against answerHindi only; rewardCoins=20');
      passed++;
    } catch (e: any) {
      failed++; failures.push(`TEST 6: ${e.message}`);
      console.error('âŒ TEST 6 FAILED:', e.message);
    }

    await sleep(1500);

    // â”€â”€ TEST 14: Final riddle â†’ isCompleted, 60 coins total, NO completion tx â”€
    try {
      const res = await riddlesService.submitAnswer(
        kolkataHuntId, createdRiddleIds[2], USER_ID, 'howrah bridge', 'en', KOL.lat, KOL.lng,
      );
      assert.strictEqual(res.correct, true);
      assert.strictEqual(res.rewardCoins, 20);         // only per-riddle reward
      assert.strictEqual(res.dailyLocked, true);
      assert.strictEqual(res.alreadyAttemptedToday, false);
      // Bonus fields must NOT be present
      assert.strictEqual((res as any).huntCompleteReward, undefined, 'huntCompleteReward must not be in response');
      assert.strictEqual((res as any).huntCompleted, undefined, 'huntCompleted must not be in response');
      assert.strictEqual((res as any).nextRiddle, undefined, 'nextRiddle must not be in response');

      // No TREASURE_HUNT completion wallet transaction
      const huntTxs = await prisma.walletTransaction.findMany({
        where: { userId: USER_ID, referenceId: kolkataHuntId, referenceType: 'TREASURE_HUNT' },
      });
      assert.strictEqual(huntTxs.length, 0,
        `TREASURE_HUNT completion tx must NOT exist (bonus = 0); found ${huntTxs.length}`);

      // Hunt progress complete
      const thp = await prisma.treasureHuntProgress.findUnique({
        where: { userId_huntId: { userId: USER_ID, huntId: kolkataHuntId } },
      });
      assert.ok(thp, 'TreasureHuntProgress must exist');
      assert.strictEqual(thp!.isCompleted, true);
      assert.ok(thp!.completedAt, 'completedAt must be set');
      // riddle[0]=20 + riddle[1]=20 + riddle[2]=20 = 60 (no completion bonus)
      assert.strictEqual(thp!.coinsEarned, 60,
        `Expected coinsEarned=60 (3Ã—20, no bonus), got ${thp!.coinsEarned}`);

      // All three RIDDLE wallet txs, total = 60
      const allRiddleTxs = await prisma.walletTransaction.findMany({
        where: { userId: USER_ID, referenceType: 'RIDDLE' },
      });
      assert.strictEqual(allRiddleTxs.length, 3, 'exactly 3 RIDDLE transactions expected');
      const totalRiddleCoins = allRiddleTxs.reduce((s, t) => s + t.amount, 0);
      assert.strictEqual(totalRiddleCoins, 60,
        `Expected total riddle coins = 60, got ${totalRiddleCoins}`);

      // getMyHuntProgress reflects completion
      const myProgress = await riddlesService.getMyHuntProgress(USER_ID);
      assert.strictEqual(myProgress.length, 1);
      assert.strictEqual(myProgress[0].hunt.city, 'Kolkata');
      assert.strictEqual(myProgress[0].isCompleted, true);

      console.log('âœ… TEST 14: Final riddle â†’ isCompleted, coinsEarned=60 (3Ã—20, no bonus), 0 TREASURE_HUNT txs');
      passed++;
    } catch (e: any) {
      failed++; failures.push(`TEST 14: ${e.message}`);
      console.error('âŒ TEST 14 FAILED:', e.message);
    }

    await sleep(1500);

    // â”€â”€ TEST 8b: Delhi GPS â†’ Delhi hunt; Kolkata GPS â†’ Kolkata hunt â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    try {
      const del = await riddlesService.getCurrentCityHunt(DEL.lat, DEL.lng);
      assert.strictEqual(del.city, 'Delhi');
      assert.ok(del.hunt && del.hunt.id === delhiHuntId);
      const kol = await riddlesService.getCurrentCityHunt(KOL.lat, KOL.lng);
      assert.strictEqual(kol.hunt!.id, kolkataHuntId);
      assert.strictEqual(kol.hunt!.riddleCount, 3);
      console.log('âœ… TEST 8b: Delhi GPS â†’ Delhi hunt, Kolkata GPS â†’ Kolkata hunt (no cross-city leak)');
      passed++;
    } catch (e: any) {
      failed++; failures.push(`TEST 8b: ${e.message}`);
      console.error('âŒ TEST 8b FAILED:', e.message);
    }

    // â”€â”€ TEST E: getEligibleRiddle â€” AVAILABLE / HUNT_COMPLETE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    try {
      // Delhi: user has no progress â†’ AVAILABLE, eligibleRiddle = riddle[0]
      const delRiddles = await prisma.riddle.findMany({
        where: { huntId: delhiHuntId },
        orderBy: { sequence: 'asc' },
      });
      assert.ok(delRiddles.length > 0, 'Delhi hunt has no riddles');

      const eligDel = await riddlesService.getEligibleRiddle(delhiHuntId, DEL.lat, DEL.lng, USER_ID);
      assert.strictEqual(eligDel.dailyStatus, 'AVAILABLE');
      assert.ok(eligDel.eligibleRiddle, 'eligibleRiddle must be present for fresh Delhi hunt');
      assert.strictEqual(eligDel.eligibleRiddle!.id, delRiddles[0].id);
      assert.strictEqual(eligDel.eligibleRiddle!.sequence, 1);

      // Kolkata: user just completed all riddles â†’ HUNT_COMPLETE
      const eligKol = await riddlesService.getEligibleRiddle(kolkataHuntId, KOL.lat, KOL.lng, USER_ID);
      assert.strictEqual(eligKol.dailyStatus, 'HUNT_COMPLETE');
      assert.strictEqual(eligKol.eligibleRiddle, null);

      console.log('âœ… TEST E: getEligibleRiddle â†’ AVAILABLE (fresh hunt), HUNT_COMPLETE (finished hunt)');
      passed++;
    } catch (e: any) {
      failed++; failures.push(`TEST E: ${e.message}`);
      console.error('âŒ TEST E FAILED:', e.message);
    }

  } finally {
    await cleanup();
    console.log('ðŸ§¹ Cleanup complete (users, hunts, riddles, wallet txs, daily attempts, import log removed)');
  }

  console.log('----------------------------------------------------');
  console.log(`FINAL VERDICT: Passed ${passed}/${passed + failed} test blocks`);
  if (failed > 0) {
    console.error('Failures:');
    for (const f of failures) console.error('  -', f);
  }
  console.log(failed === 0 ? 'âœ… ALL TREASURE HUNT TESTS PASSED' : `âŒ ${failed} BLOCKS FAILED`);
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

run().catch(async (e) => {
  console.error('FATAL:', e);
  try {
    await prisma.riddleDailyAttempt.deleteMany({ where: { userId: USER_ID } });
    await prisma.walletTransaction.deleteMany({ where: { userId: USER_ID } });
    await prisma.wallet.deleteMany({ where: { userId: USER_ID } });
    await prisma.user.deleteMany({ where: { id: { in: [ADMIN_ID, USER_ID] } } });
  } catch {
    /* best-effort cleanup */
  }
  process.exit(1);
});
