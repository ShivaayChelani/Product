import { prisma } from '../src/config/database';
import { riddlesService } from '../src/modules/riddles/riddles.service';
import * as XLSX from 'xlsx';
import assert from 'assert';

/**
 * E2E test script for the PALSAFAR Treasure Hunt text-riddle flow.
 *
 * Covers the 14 release test cases:
 *   1.  Excel valid format -> all rows VALID, sequence = row order
 *   2.  Missing column -> 400 "Missing column: ..."
 *   3.  Empty cell (city/answer) -> row flagged INVALID with message
 *   4.  Duplicate row -> second row INVALID "Duplicate row"
 *   5.  Invalid/Garbage Excel bytes -> 400 friendly error
 *   6.  Hindi answers -> language: 'hi' path (no language mixing)
 *   7.  Multi-city import -> one hunt per city
 *   8.  GPS city -> correct current city hunt returned
 *   9.  Wrong-city access (getRiddle / submitAnswer) -> 403 TREASURE_HUNT_CITY_MISMATCH
 *   10. No answer/clue leak -> hunt riddles {id,sequence,rewardCoins}, riddle clues only, nextRiddle {id,sequence}
 *   11. Wrong answer -> correct:false, zero coins
 *   12. Correct answer with messy spacing -> normalized match, coins once (no double credit)
 *   13. Out-of-order / re-answer -> 409 RIDDLE_OUT_OF_ORDER
 *   14. Completion -> huntCompleteReward + isCompleted + wallet tx once
 *
 * Cleanup removes all rows this script creates. Run: npx ts-node scripts/test-treasure-hunt.ts
 */

const ADMIN_ID = 'test-th-admin-001';
const USER_ID = 'test-th-user-001';
const FILE_NAME = `test-import-${Date.now()}.xlsx`;

const KOL = { lat: 22.5726, lng: 88.3639 };
const DEL = { lat: 28.6139, lng: 77.2090 };

const R1 = {
  city: 'Kolkata',
  clueEnglish: 'White landmark across from the Maidan',
  answerEnglish: 'Victoria Memorial',
  clueHindi: 'मैदान के सामने सफेद स्मारक',
  answerHindi: 'विक्टोरिया मेमोरियल',
};
const R2 = {
  city: 'Kolkata',
  clueEnglish: 'The river that flows through Kolkata',
  answerEnglish: 'Hooghly river',
  clueHindi: 'कोलकाता से बहने वाली नदी',
  answerHindi: 'हुगली नदी',
};
const R3 = {
  city: 'Kolkata',
  clueEnglish: 'The final treasure bridge over the Hooghly',
  answerEnglish: 'Howrah Bridge',
  clueHindi: 'हुगली पर बना अंतिम खजाना पुल',
  answerHindi: 'हावड़ा ब्रिज',
};
const D1 = {
  city: 'Delhi',
  clueEnglish: 'The Red Fort gateway city hunt',
  answerEnglish: 'Lal Qila',
  clueHindi: 'लाल किला शहर',
  answerHindi: 'लाल किला',
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
  let delhiHuntId = '';
  const createdHuntIds: string[] = [];
  const createdRiddleIds: string[] = [];

  // Setup users
  await prisma.user.upsert({
    where: { id: ADMIN_ID },
    update: {},
    create: { id: ADMIN_ID, email: 'test-th-admin@example.com', name: 'Test Admin', permission: 'USER' },
  });
  await prisma.user.upsert({
    where: { id: USER_ID },
    update: {},
    create: { id: USER_ID, email: 'test-th-user@example.com', name: 'Test User', permission: 'USER' },
  });

  const cleanup = async () => {
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
    // ── TEST 1: Correct Excel format → all rows VALID, cities detected ──
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
      console.log('✅ TEST 1: Correct Excel format passed (1 valid row, city detected)');
      passed++;
    } catch (e: any) {
      failed++; failures.push(`TEST 1: ${e.message}`);
      console.error('❌ TEST 1 FAILED:', e.message);
    }

    // ── TEST 2: Missing column → 400 'Missing column: ...' ──
    try {
      const badHeaders = ['City name', 'Riddle in English', 'Answer in English', 'Riddle in Hindi'];
      const buf = makeXlsx([badHeaders, [R1.city, R1.clueEnglish, R1.answerEnglish, R1.clueHindi]]);
      await expectReject('TEST 2', () => riddlesService.bulkImportValidate(buf), 400, 'Missing column');
      console.log('✅ TEST 2: Missing column rejected with 400');
      passed++;
    } catch (e: any) {
      failed++; failures.push(`TEST 2: ${e.message}`);
      console.error('❌ TEST 2 FAILED:', e.message);
    }

    // ── TEST 3: Empty cell (city + answer missing) → INVALID with message ──
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
      console.log('✅ TEST 3: Empty cells flagged INVALID with messages');
      passed++;
    } catch (e: any) {
      failed++; failures.push(`TEST 3: ${e.message}`);
      console.error('❌ TEST 3 FAILED:', e.message);
    }

    // ── TEST 4: Duplicate row → second row INVALID 'Duplicate row' ──
    try {
      const dup = [R1.city, R1.clueEnglish, R1.answerEnglish, R1.clueHindi, R1.answerHindi];
      const buf = makeXlsx([HEADERS, dup, dup]);
      const res = await riddlesService.bulkImportValidate(buf);
      assert.strictEqual(res.data[0].status, 'VALID');
      assert.strictEqual(res.data[1].status, 'INVALID');
      assert.ok(res.data[1].error.includes('Duplicate row'));
      console.log('✅ TEST 4: Duplicate row flagged INVALID');
      passed++;
    } catch (e: any) {
      failed++; failures.push(`TEST 4: ${e.message}`);
      console.error('❌ TEST 4 FAILED:', e.message);
    }

    // ── TEST 5: Invalid/garbage file → 400 friendly error ──
    try {
      const garbage = Buffer.from('this is definitely not an excel file', 'utf8');
      await expectReject('TEST 5', () => riddlesService.bulkImportValidate(garbage), 400);
      console.log('✅ TEST 5: Garbage file rejected with 400');
      passed++;
    } catch (e: any) {
      failed++; failures.push(`TEST 5: ${e.message}`);
      console.error('❌ TEST 5 FAILED:', e.message);
    }

    // ── TEST 7 (import): Multi-city import → one hunt per city ──
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
      delhiHuntId = delHunt!.id;
      createdHuntIds.push(kolkataHuntId, delhiHuntId);

      const kolRiddles = await prisma.riddle.findMany({ where: { huntId: kolkataHuntId }, orderBy: { sequence: 'asc' } });
      assert.strictEqual(kolRiddles.length, 3);
      assert.strictEqual(kolRiddles[0].sequence, 1);
      assert.strictEqual(kolRiddles[1].sequence, 2);
      assert.strictEqual(kolRiddles[2].sequence, 3);
      assert.strictEqual(kolRiddles[0].answerEnglish, 'Victoria Memorial');
      createdRiddleIds.push(...kolRiddles.map((r) => r.id));

      const log = await prisma.treasureHuntImportLog.findFirst({
        where: { fileName: FILE_NAME, uploadedById: ADMIN_ID },
        orderBy: { createdAt: 'desc' },
      });
      assert.ok(log, 'import log missing');
      assert.strictEqual(log!.status, 'COMPLETED');
      assert.strictEqual(log!.validRows, 4);
      assert.ok(log!.cities.includes('Kolkata') && log!.cities.includes('Delhi'));
      console.log('✅ TEST 7: Multi-city import created hunts + import log, sequence = row order');
      passed++;
    } catch (e: any) {
      failed++; failures.push(`TEST 7: ${e.message}`);
      console.error('❌ TEST 7 FAILED:', e.message);
    }

    await sleep(1500);

    // ── TEST 8: GPS city → current city hunt (Kolkata) ──
    try {
      const res = await riddlesService.getCurrentCityHunt(KOL.lat, KOL.lng);
      assert.strictEqual(res.city, 'Kolkata');
      assert.ok(res.hunt, 'no hunt for Kolkata');
      assert.strictEqual(res.hunt!.id, kolkataHuntId);
      assert.strictEqual(res.hunt!.riddleCount, 3);
      console.log('✅ TEST 8: GPS city resolution returned Kolkata hunt (riddleCount 3)');
      passed++;
    } catch (e: any) {
      failed++; failures.push(`TEST 8: ${e.message}`);
      console.error('❌ TEST 8 FAILED:', e.message);
    }

    // ── TEST 10: No answer/clue leak ──
    try {
      const details = await riddlesService.getHuntDetails(kolkataHuntId, KOL.lat, KOL.lng, USER_ID);
      assert.strictEqual(details.riddles.length, 3);
      for (const r of details.riddles as any[]) {
        assert.deepStrictEqual(Object.keys(r).sort(), ['id', 'rewardCoins', 'sequence']);
      }
      const r1 = await riddlesService.getRiddle(kolkataHuntId, createdRiddleIds[0], KOL.lat, KOL.lng);
      assert.strictEqual(r1.clueEnglish, R1.clueEnglish);
      assert.strictEqual(r1.clueHindi, R1.clueHindi);
      assert.strictEqual((r1 as any).answerEnglish, undefined);
      assert.strictEqual((r1 as any).answerHindi, undefined);
      console.log('✅ TEST 10: No answer/clue leak in hunt details or riddle');
      passed++;
    } catch (e: any) {
      failed++; failures.push(`TEST 10: ${e.message}`);
      console.error('❌ TEST 10 FAILED:', e.message);
    }

    await sleep(1500);

    // ── TEST 9: Wrong-city access → 403 TREASURE_HUNT_CITY_MISMATCH ──
    try {
      await expectReject(
        'TEST 9a (getRiddle from Delhi)',
        () => riddlesService.getRiddle(kolkataHuntId, createdRiddleIds[0], DEL.lat, DEL.lng),
        403,
        'TREASURE_HUNT_CITY_MISMATCH'
      );
      await expectReject(
        'TEST 9b (getHuntDetails from Delhi)',
        () => riddlesService.getHuntDetails(kolkataHuntId, DEL.lat, DEL.lng, USER_ID),
        403,
        'TREASURE_HUNT_CITY_MISMATCH'
      );
      await expectReject(
        'TEST 9c (submitAnswer from Delhi)',
        () => riddlesService.submitAnswer(kolkataHuntId, createdRiddleIds[0], USER_ID, 'Victoria Memorial', 'en', DEL.lat, DEL.lng),
        403,
        'TREASURE_HUNT_CITY_MISMATCH'
      );
      console.log('✅ TEST 9: Wrong-city riddle/hunt/submit rejected with 403');
      passed++;
    } catch (e: any) {
      failed++; failures.push(`TEST 9: ${e.message}`);
      console.error('❌ TEST 9 FAILED:', e.message);
    }

    await sleep(1500);

    // ── TEST 13: Out-of-order answer → 409 RIDDLE_OUT_OF_ORDER ──
    try {
      await expectReject(
        'TEST 13a (skip to riddle 2)',
        () => riddlesService.submitAnswer(kolkataHuntId, createdRiddleIds[1], USER_ID, 'Hooghly river', 'en', KOL.lat, KOL.lng),
        409,
        'RIDDLE_OUT_OF_ORDER'
      );
      console.log('✅ TEST 13: Out-of-order answer rejected with 409');
      passed++;
    } catch (e: any) {
      failed++; failures.push(`TEST 13: ${e.message}`);
      console.error('❌ TEST 13 FAILED:', e.message);
    }

    await sleep(1500);

    // ── TEST 11: Wrong answer → no coins ──
    try {
      const res = await riddlesService.submitAnswer(kolkataHuntId, createdRiddleIds[0], USER_ID, 'Taj Mahal', 'en', KOL.lat, KOL.lng);
      assert.strictEqual(res.correct, false);
      assert.strictEqual(res.rewardCoins, 0);
      assert.strictEqual(res.huntCompleteReward, 0);
      const progress = await prisma.riddleProgress.findUnique({
        where: { userId_riddleId: { userId: USER_ID, riddleId: createdRiddleIds[0] } },
      });
      assert.strictEqual(progress!.attempts, 1);
      assert.strictEqual(progress!.isCorrect, false);
      const txs = await prisma.walletTransaction.findMany({ where: { userId: USER_ID, referenceId: createdRiddleIds[0] } });
      assert.strictEqual(txs.length, 0);
      console.log('✅ TEST 11: Wrong answer → correct:false, 0 coins, attempts recorded');
      passed++;
    } catch (e: any) {
      failed++; failures.push(`TEST 11: ${e.message}`);
      console.error('❌ TEST 11 FAILED:', e.message);
    }

    await sleep(1500);

    // ── TEST 12: Correct answer with messy spacing → coins once, no double credit ──
    try {
      const res = await riddlesService.submitAnswer(kolkataHuntId, createdRiddleIds[0], USER_ID, '  VICTORIA   MEMORIAL. ', 'en', KOL.lat, KOL.lng);
      assert.strictEqual(res.correct, true);
      assert.strictEqual(res.rewardCoins, 10);
      assert.strictEqual(res.huntCompleted, false);
      assert.deepStrictEqual(res.nextRiddle, { id: createdRiddleIds[1], sequence: 2 });

      const txs = await prisma.walletTransaction.findMany({
        where: { userId: USER_ID, referenceId: createdRiddleIds[0], referenceType: 'RIDDLE' },
      });
      assert.strictEqual(txs.length, 1);
      assert.strictEqual(txs[0].amount, 10);

      // Re-answer the just-solved riddle → blocked by order guard (equally prevents double credit)
      await expectReject(
        'TEST 12b (re-answer solved riddle)',
        () => riddlesService.submitAnswer(kolkataHuntId, createdRiddleIds[0], USER_ID, 'Victoria Memorial', 'en', KOL.lat, KOL.lng),
        409,
        'RIDDLE_OUT_OF_ORDER'
      );
      const txsAfter = await prisma.walletTransaction.findMany({
        where: { userId: USER_ID, referenceId: createdRiddleIds[0], referenceType: 'RIDDLE' },
      });
      assert.strictEqual(txsAfter.length, 1, 'double reward credited');

      console.log('✅ TEST 12: Normalized correct answer → +10 coins, re-answer blocked, single credit');
      passed++;
    } catch (e: any) {
      failed++; failures.push(`TEST 12: ${e.message}`);
      console.error('❌ TEST 12 FAILED:', e.message);
    }

    await sleep(1500);

    // ── TEST 6: Hindi-only validation & language isolation ──
    try {
      // English answer with language 'hi' is NOT accepted
      const enInHi = await riddlesService.submitAnswer(kolkataHuntId, createdRiddleIds[1], USER_ID, 'Hooghly river', 'hi', KOL.lat, KOL.lng);
      assert.strictEqual(enInHi.correct, false);
      assert.strictEqual(enInHi.rewardCoins, 0);

      const ok = await riddlesService.submitAnswer(kolkataHuntId, createdRiddleIds[1], USER_ID, 'हुगली नदी', 'hi', KOL.lat, KOL.lng);
      assert.strictEqual(ok.correct, true);
      assert.strictEqual(ok.rewardCoins, 10);
      assert.deepStrictEqual(ok.nextRiddle, { id: createdRiddleIds[2], sequence: 3 });
      console.log('✅ TEST 6: Hindi answers validated against answerHindi only');
      passed++;
    } catch (e: any) {
      failed++; failures.push(`TEST 6: ${e.message}`);
      console.error('❌ TEST 6 FAILED:', e.message);
    }

    await sleep(1500);

    // ── TEST 14: Final riddle → hunt completion reward + isCompleted, no double reward ──
    try {
      const res = await riddlesService.submitAnswer(kolkataHuntId, createdRiddleIds[2], USER_ID, 'howrah bridge', 'en', KOL.lat, KOL.lng);
      assert.strictEqual(res.correct, true);
      assert.strictEqual(res.rewardCoins, 10);
      assert.strictEqual(res.huntCompleteReward, 150);
      assert.strictEqual(res.huntCompleted, true);
      assert.strictEqual(res.nextRiddle, null);

      const huntTxs = await prisma.walletTransaction.findMany({
        where: { userId: USER_ID, referenceId: kolkataHuntId, referenceType: 'TREASURE_HUNT' },
      });
      assert.strictEqual(huntTxs.length, 1);
      assert.strictEqual(huntTxs[0].amount, 150);

      const progress = await prisma.treasureHuntProgress.findUnique({
        where: { userId_huntId: { userId: USER_ID, huntId: kolkataHuntId } },
      });
      assert.strictEqual(progress!.isCompleted, true);
      assert.ok(progress!.completedAt);
      assert.strictEqual(progress!.coinsEarned, 180); // 3 riddles x10 + 150 completion bonus = 180

      // Re-answer a solved riddle after completion → no second credit
      const again = await riddlesService.submitAnswer(kolkataHuntId, createdRiddleIds[0], USER_ID, 'Victoria Memorial', 'en', KOL.lat, KOL.lng);
      assert.strictEqual(again.correct, true);
      assert.strictEqual(again.rewardCoins, 0);
      const txsAfter = await prisma.walletTransaction.findMany({
        where: { userId: USER_ID, referenceId: createdRiddleIds[0], referenceType: 'RIDDLE' },
      });
      assert.strictEqual(txsAfter.length, 1, 'double credit after completion');

      const myProgress = await riddlesService.getMyHuntProgress(USER_ID);
      assert.strictEqual(myProgress.length, 1);
      assert.strictEqual(myProgress[0].hunt.city, 'Kolkata');
      assert.strictEqual(myProgress[0].isCompleted, true);
      console.log('✅ TEST 14: Completion reward +isCompleted=180 coins (3x10 riddles + 150 bonus), idempotent, progress reflects');
      passed++;
    } catch (e: any) {
      failed++; failures.push(`TEST 14: ${e.message}`);
      console.error('❌ TEST 14 FAILED:', e.message);
    }

    await sleep(1500);

    // ── TEST 8b: Delhi GPS → Delhi hunt ──
    try {
      const res = await riddlesService.getCurrentCityHunt(DEL.lat, DEL.lng);
      assert.strictEqual(res.city, 'Delhi');
      assert.ok(res.hunt && res.hunt.id === delhiHuntId);
      const kol = await riddlesService.getCurrentCityHunt(KOL.lat, KOL.lng);
      assert.strictEqual(kol.hunt!.id, kolkataHuntId);
      assert.strictEqual(kol.hunt!.riddleCount, 3);
      console.log('✅ TEST 8b: Delhi GPS → Delhi hunt, Kolkata GPS → Kolkata hunt (no cross-city leak)');
      passed++;
    } catch (e: any) {
      failed++; failures.push(`TEST 8b: ${e.message}`);
      console.error('❌ TEST 8b FAILED:', e.message);
    }
  } finally {
    await cleanup();
    console.log('🧹 Cleanup complete (test users, hunts, riddles, wallet txs, import log removed)');
  }

  console.log('----------------------------------------------------');
  console.log(`FINAL VERDICT: Passed ${passed}/${passed + failed} test blocks`);
  if (failed > 0) {
    console.error('Failures:');
    for (const f of failures) console.error('  -', f);
  }
  console.log(failed === 0 ? '✅ ALL TREASURE HUNT TESTS PASSED' : `❌ ${failed} BLOCKS FAILED`);
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

run().catch(async (e) => {
  console.error('FATAL:', e);
  try {
    await prisma.walletTransaction.deleteMany({ where: { userId: USER_ID } });
    await prisma.wallet.deleteMany({ where: { userId: USER_ID } });
    await prisma.user.deleteMany({ where: { id: { in: [ADMIN_ID, USER_ID] } } });
  } catch {
    /* best-effort cleanup */
  }
  process.exit(1);
});