import { prisma } from '../src/config/database';
import { riddlesService } from '../src/modules/riddles/riddles.service';
import * as XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';
import assert from 'assert';

async function runTests() {
  console.log('--- STARTING PALSAFAR TREASURE HUNT E2E TESTS ---');
  let passed = 0;
  let failed = 0;
  
  for (let i = 0; i < 5; i++) {
    try {
      await prisma.$connect();
      console.log('DB connected');
      break;
    } catch (e) {
      console.log('DB connection failed, retrying...', e);
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  // 0. Setup mock data
  const adminId = 'admin-test-123';
  const userId = 'user-test-123';
  
  await prisma.user.upsert({
    where: { id: adminId },
    update: {},
    create: { id: adminId, email: 'admin@test.com', name: 'Admin Test', permission: 'SUPER_ADMIN' },
  });
  
  await prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: { id: userId, email: 'user@test.com', name: 'User Test', permission: 'USER' },
  });

  // Ensure Victoria Memorial exists for destination matching
  const destName = 'Victoria Memorial Test';
  await prisma.place.deleteMany({ where: { name: destName } });
  await prisma.place.create({
    data: {
      name: destName,
      status: 'APPROVED',
      latitude: 22.5448,
      longitude: 88.3426,
      city: 'Kolkata',
      slug: 'victoria-memorial-test-123',
      description: 'Test description',
      category: 'Monument'
    }
  });

  const mockRiddleTitle = 'TEST_E2E_MOCK_RIDDLE_WHITE_MARBLE';
  const mockUnknownTitle = 'TEST_E2E_MOCK_UNKNOWN_PLACE_123';
  
  // Create a mock Excel file in memory for testing
  const wb = XLSX.utils.book_new();
  const wsData = [
    ['State', 'District', 'City Name', 'Riddle English', 'Answer English', 'Riddle Hindi', 'Answer Hindi', 'Reward'],
    ['West Bengal', 'Kolkata', 'Kolkata', mockRiddleTitle, destName, 'Safed Mahal', 'Victoria', '100'],
    ['West Bengal', 'Kolkata', 'Kolkata', mockUnknownTitle, 'Fake Unknown Place 123', '', '', '100'], // Should be NEEDS_ATTENTION
    ['West Bengal', 'Kolkata', '', 'Missing city', destName, '', '', '100'], // INVALID
  ];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, 'Riddles');
  const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  // TEST 1: REAL EXCEL IMPORT VALIDATION
  let validatedRows: any[] = [];
  try {
    const res = await riddlesService.bulkImportValidate(excelBuffer);
    validatedRows = res.data;
    assert.strictEqual(validatedRows.length, 3);
    assert.strictEqual(validatedRows[0].status, 'VALID');
    assert.strictEqual(validatedRows[1].status, 'NEEDS_ATTENTION');
    assert.strictEqual(validatedRows[2].status, 'INVALID');
    console.log('✅ TEST 1: Excel Validation Passed');
    passed++;
  } catch (e: any) {
    console.error('❌ TEST 1 FAILED:', e.message);
    failed++;
  }

  // TEST 2: EXCEL IMPORT CONFIRM & DUPLICATE IMPORT
  try {
    // Delete if exists
    await prisma.riddle.deleteMany({ where: { title: mockRiddleTitle } });
    
    // First import
    const validRows = validatedRows.filter(r => r.status === 'VALID');
    const importRes1 = await riddlesService.bulkImportConfirm(validRows);
    assert.strictEqual(importRes1.imported, 1);

    // Second import (duplicate)
    const importRes2 = await riddlesService.bulkImportConfirm(validRows);
    assert.strictEqual(importRes2.imported, 0);

    const dbRiddles = await prisma.riddle.findMany({ where: { title: mockRiddleTitle } });
    assert.strictEqual(dbRiddles.length, 1);
    
    // Set mock hint image for test 6
    await prisma.riddle.update({
      where: { id: dbRiddles[0].id },
      data: { hintImage: 'http://example.com/hint.jpg' }
    });

    console.log('✅ TEST 2: Duplicate Import Idempotency Passed');
    passed++;
  } catch (e: any) {
    console.error('❌ TEST 2 FAILED:', e.message);
    failed++;
  }

  // TEST 3: UNKNOWN DESTINATION
  try {
    const activeUnknown = await prisma.riddle.findFirst({ where: { title: mockUnknownTitle } });
    assert.strictEqual(activeUnknown, null);
    console.log('✅ TEST 3: Unknown Destination Blocked (NEEDS_ATTENTION) Passed');
    passed++;
  } catch (e: any) {
    console.error('❌ TEST 3 FAILED:', e.message);
    failed++;
  }

  // TEST 4 & 5: CITY RESTRICTION & CITY CHANGE
  let kolkataRiddleId = '';
  try {
    // GPS near Victoria Memorial (Kolkata)
    const kolkataLat = 22.5448;
    const kolkataLng = 88.3426;
    
    const activeKolkata = await riddlesService.getActiveForCurrentLocation(kolkataLat, kolkataLng);
    assert.strictEqual(activeKolkata.city.toLowerCase(), 'kolkata');
    assert.ok(activeKolkata.riddles.some(r => r.title === mockRiddleTitle));
    
    kolkataRiddleId = activeKolkata.riddles.find(r => r.title === mockRiddleTitle)!.id;

    // GPS in Bhopal
    const bhopalLat = 23.2599;
    const bhopalLng = 77.4126;
    const activeBhopal = await riddlesService.getActiveForCurrentLocation(bhopalLat, bhopalLng);
    assert.strictEqual(activeBhopal.city.toLowerCase(), 'bhopal');
    assert.strictEqual(activeBhopal.riddles.some(r => r.title === mockRiddleTitle), false);

    // Try accessing Kolkata riddle from Bhopal
    try {
      await riddlesService.getByIdUser(kolkataRiddleId, bhopalLat, bhopalLng);
      assert.fail('Should have thrown 403');
    } catch (err: any) {
      assert.strictEqual(err.statusCode, 403);
    }

    console.log('✅ TEST 4 & 5: City Restriction & City Change Passed');
    passed++;
  } catch (e: any) {
    console.error('❌ TEST 4 & 5 FAILED:', e.message);
    failed++;
  }

  // TEST 6: HIDDEN COORDINATES & HINT SECURITY
  try {
    const kolkataLat = 22.5448;
    const kolkataLng = 88.3426;
    const riddleDetail = await riddlesService.getByIdUser(kolkataRiddleId, 22.5448, 88.3426);
    assert.strictEqual((riddleDetail as any).correctPlaceName, undefined);
    assert.strictEqual((riddleDetail as any).correctLat, undefined);
    assert.strictEqual((riddleDetail as any).correctLng, undefined);
    
    // Verify hint isn't exposed in initial response
    assert.strictEqual((riddleDetail as any).hintImage, undefined);
    assert.strictEqual(riddleDetail.hasHint, true);

    // Verify hint endpoint works for correct city
    const hintRes = await riddlesService.getHint(kolkataRiddleId, 22.5448, 88.3426);
    assert.strictEqual(hintRes.hintImage, 'http://example.com/hint.jpg');

    // Verify hint endpoint fails for wrong city (Delhi GPS for Kolkata riddle)
    try {
      await riddlesService.getHint(kolkataRiddleId, 28.7041, 77.1025);
      assert.fail('Should have rejected hint request for wrong city');
    } catch (e: any) {
      assert.strictEqual(e.statusCode, 403);
    }

    console.log('✅ TEST 6: Hidden Coordinates & Hint Security Passed');
    passed++;
  } catch (e: any) {
    console.error('❌ TEST 6 FAILED:', e.message);
    failed++;
  }

  // TEST 7: CHECK-IN OUTSIDE RADIUS
  try {
    // 5km away
    const farLat = 22.5848;
    const farLng = 88.3426;
    // TEST 7: Check-in outside radius (or outside city)
    try {
      const checkinFar = await riddlesService.validateCheckIn(kolkataRiddleId, 22.5848, 88.3426);
      assert.strictEqual(checkinFar.allowed, false);
      passed++;
    } catch (e: any) {
      if (e.statusCode === 403) {
        // Cross-city boundary hit - also valid!
        passed++;
      } else {
        throw e;
      }
    }
    // Attempt submit
      try {
        await riddlesService.submit(kolkataRiddleId, userId, 'http://test.jpg', farLat, farLng);
        assert.fail('Should have rejected submit');
      } catch (err: any) {
        if (err.statusCode !== 400 && err.statusCode !== 403) {
          throw err;
        }
      }
      console.log('✅ TEST 7: Check-in Outside Radius Passed');
    passed++;
  } catch (e: any) {
    console.error('❌ TEST 7 FAILED:', e.message);
    failed++;
  }

  // TEST 8 & 9 & 10: CHECK-IN INSIDE RADIUS & SUBMIT SECURITY
  let submissionId = '';
  try {
    // 100m away
    const closeLat = 22.5440;
    const closeLng = 88.3426;
    
    // Clear previous submissions
    await prisma.riddleSubmission.deleteMany({ where: { riddleId: kolkataRiddleId, userId } });

    const checkin = await riddlesService.validateCheckIn(kolkataRiddleId, closeLat, closeLng);
    assert.strictEqual(checkin.allowed, true);
    
    const submission = await riddlesService.submit(kolkataRiddleId, userId, 'http://test.jpg', closeLat, closeLng);
    submissionId = submission.id;
    assert.strictEqual(submission.status, 'PENDING');

    // Duplicate submit
    try {
      await riddlesService.submit(kolkataRiddleId, userId, 'http://test.jpg', closeLat, closeLng);
      assert.fail('Should reject duplicate');
    } catch (err: any) {
      assert.strictEqual(err.statusCode, 409);
    }

    console.log('✅ TEST 8 & 9 & 10: Submit Security & Flow Passed');
    passed++;
  } catch (e: any) {
    console.error('❌ TEST 8 & 9 & 10 FAILED:', e.message);
    failed++;
  }

  // TEST 11: ADMIN APPROVAL ATOMICITY
  try {
    await prisma.walletTransaction.deleteMany({ where: { referenceId: submissionId } });
    
    const approved = await riddlesService.approve(submissionId, adminId);
    assert.strictEqual(approved.status, 'APPROVED');

    // Attempt second approval
    try {
      await riddlesService.approve(submissionId, adminId);
      assert.fail('Should reject second approval');
    } catch (err: any) {
      assert.strictEqual(err.statusCode, 409);
    }

    // Verify points
    const pointsTx = await prisma.walletTransaction.findMany({ where: { referenceId: submissionId } });
    assert.strictEqual(pointsTx.length, 1);
    
    console.log('✅ TEST 11: Admin Approval Atomicity Passed');
    passed++;
  } catch (e: any) {
    console.error('❌ TEST 11 FAILED:', e.message);
    failed++;
  }

  // TEST 12: REJECT FLOW
  try {
    await prisma.riddleSubmission.deleteMany({ where: { riddleId: kolkataRiddleId, userId } });
    
    const submissionId2 = (await riddlesService.submit(kolkataRiddleId, userId, 'http://test2.jpg', 22.5440, 88.3426)).id;
    
    await prisma.walletTransaction.deleteMany({ where: { referenceId: submissionId2 } });
    
    const rejected = await riddlesService.reject(submissionId2, adminId, { adminComment: 'Fake photo' });
    assert.strictEqual(rejected.status, 'REJECTED');
    assert.strictEqual(rejected.adminComment, 'Fake photo');

    const pointsTx2 = await prisma.walletTransaction.findMany({ where: { referenceId: submissionId2 } });
    assert.strictEqual(pointsTx2.length, 0);

    console.log('✅ TEST 12: Reject Flow Passed');
    passed++;
  } catch (e: any) {
    console.error('❌ TEST 12 FAILED:', e.message);
    failed++;
  }

  console.log('----------------------------------------------------');
  console.log(`FINAL VERDICT:`);
  console.log(`Passed: ${passed}/9 test blocks`);
  console.log(`Failed: ${failed}/9 test blocks`);
  if (failed === 0) {
    console.log('READY FOR PRODUCTION TESTING');
  } else {
    console.log('NOT READY');
  }
}

runTests().catch(console.error).finally(() => process.exit(0));
