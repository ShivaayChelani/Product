import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../src/config/database', () => ({
  prisma: {
    treasureHuntImportLog: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    treasureHunt: {
      upsert: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    riddle: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      createMany: vi.fn(),
      deleteMany: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    riddleProgress: { count: vi.fn() },
    treasureHuntProgress: { count: vi.fn() },
    walletTransaction: { count: vi.fn() },
    riddleDailyAttempt: { count: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../src/modules/wallet/wallet.service', () => ({
  walletService: { earn: vi.fn(async () => ({ palPoints: 20 })) },
}));

vi.mock('../../src/shared/utils/reverseGeocode', () => ({
  reverseGeocodeToCity: vi.fn(async () => 'Kolkata'),
}));

import { prisma } from '../../src/config/database';
import { riddlesService } from '../../src/modules/riddles/riddles.service';
import { TREASURE_HUNT_RIDDLE_REWARD_POINTS } from '../../src/modules/riddles/riddles.constants';

const P = prisma as unknown as Record<string, any>;

function resetMocks() {
  P.treasureHuntImportLog.findUnique.mockReset();
  P.treasureHuntImportLog.create.mockReset();
  P.treasureHuntImportLog.update.mockReset();
  P.treasureHunt.upsert.mockReset();
  P.treasureHunt.findMany.mockReset();
  P.treasureHunt.update.mockReset();
  P.treasureHunt.updateMany.mockReset();
  P.treasureHunt.deleteMany.mockReset();
  P.riddle.findMany.mockReset();
  P.riddle.findFirst.mockReset();
  P.riddle.createMany.mockReset();
  P.riddle.deleteMany.mockReset();
  P.riddle.updateMany.mockReset();
  P.riddle.count.mockReset();
  P.riddleProgress.count.mockReset();
  P.treasureHuntProgress.count.mockReset();
  P.walletTransaction.count.mockReset();
  P.riddleDailyAttempt.count.mockReset();
  P.$transaction.mockReset();

  // Run the transaction callback against the same mocked client.
  P.$transaction.mockImplementation(async (cb: any) => cb(P));

  // Safe defaults: no usage, no leftover riddles, no active riddles.
  P.riddleProgress.count.mockResolvedValue(0);
  P.treasureHuntProgress.count.mockResolvedValue(0);
  P.walletTransaction.count.mockResolvedValue(0);
  P.riddleDailyAttempt.count.mockResolvedValue(0);
  P.riddle.count.mockResolvedValue(0);
  P.treasureHunt.findMany.mockResolvedValue([]);
  P.treasureHuntImportLog.update.mockResolvedValue({});
  P.treasureHunt.update.mockResolvedValue({});
}

beforeEach(resetMocks);

describe('riddlesService.deleteImport (import-scoped deletion)', () => {
  it('404s when the import record does not exist', async () => {
    P.treasureHuntImportLog.findUnique.mockResolvedValue(null);

    await expect(riddlesService.deleteImport('missing', 'admin-1')).rejects.toThrow(
      'Import record not found',
    );
    expect(P.$transaction).not.toHaveBeenCalled();
  });

  it('is idempotent — deleting an already-deleted import is a no-op', async () => {
    P.treasureHuntImportLog.findUnique.mockResolvedValue({
      id: 'imp-1',
      fileName: 'a.xlsx',
      status: 'DELETED',
      deletedAt: new Date(),
    });

    const res = await riddlesService.deleteImport('imp-1', 'admin-1');

    expect(res.alreadyDeleted).toBe(true);
    expect(res.mode).toBe('NONE');
    expect(res.riddles).toBe(0);
    expect(P.$transaction).not.toHaveBeenCalled();
    expect(P.riddle.deleteMany).not.toHaveBeenCalled();
  });

  it('reports NO_CONTENT when the import created nothing and still records the audit deletion', async () => {
    P.treasureHuntImportLog.findUnique.mockResolvedValue({
      id: 'imp-1',
      fileName: 'a.xlsx',
      status: 'COMPLETED',
      deletedAt: null,
    });
    P.riddle.findMany.mockResolvedValue([]);

    const res = await riddlesService.deleteImport('imp-1', 'admin-1');

    expect(res.mode).toBe('NO_CONTENT');
    expect(res.hunts).toBe(0);
    expect(res.riddles).toBe(0);
    expect(P.riddle.deleteMany).not.toHaveBeenCalled();
    expect(P.treasureHuntImportLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'imp-1' },
        data: expect.objectContaining({ status: 'DELETED', deletedById: 'admin-1' }),
      }),
    );
  });

  it('hard-deletes ONLY the riddles owned by this import (id-scoped, never filename/city)', async () => {
    P.treasureHuntImportLog.findUnique.mockResolvedValue({
      id: 'imp-1',
      fileName: 'a.xlsx',
      status: 'COMPLETED',
      deletedAt: null,
    });
    P.riddle.findMany.mockResolvedValue([
      { id: 'r-1', huntId: 'h-1' },
      { id: 'r-2', huntId: 'h-1' },
    ]);
    P.treasureHunt.findMany.mockResolvedValue([{ id: 'h-1', _count: { riddles: 0 } }]);

    const res = await riddlesService.deleteImport('imp-1', 'admin-1');

    // Ownership is discovered by importLogId, not by file/city/text.
    expect(P.riddle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { importLogId: 'imp-1' },
        select: { id: true, huntId: true },
      }),
    );
    expect(P.riddle.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['r-1', 'r-2'] } } });
    expect(res.mode).toBe('DELETED');
    expect(res.riddles).toBe(2);
    expect(res.hunts).toBe(1);
  });

  it('removes hunts left empty but keeps hunts that still own other riddles', async () => {
    P.treasureHuntImportLog.findUnique.mockResolvedValue({
      id: 'imp-1',
      fileName: 'a.xlsx',
      status: 'COMPLETED',
      deletedAt: null,
    });
    P.riddle.findMany.mockResolvedValue([{ id: 'r-1', huntId: 'h-empty' }]);
    P.treasureHunt.findMany.mockResolvedValue([
      { id: 'h-empty', _count: { riddles: 0 } },
      { id: 'h-shared', _count: { riddles: 3 } },
    ]);

    await riddlesService.deleteImport('imp-1', 'admin-1');

    expect(P.treasureHunt.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['h-empty'] } } });
  });

  it('ARCHIVES instead of deleting when a user already has riddle progress', async () => {
    P.treasureHuntImportLog.findUnique.mockResolvedValue({
      id: 'imp-1',
      fileName: 'a.xlsx',
      status: 'COMPLETED',
      deletedAt: null,
    });
    P.riddle.findMany.mockResolvedValue([{ id: 'r-1', huntId: 'h-1' }]);
    P.riddleProgress.count.mockResolvedValue(1);
    // active riddle count after archive = 0 -> hunt gets archived
    P.riddle.count.mockResolvedValue(0);

    const res = await riddlesService.deleteImport('imp-1', 'admin-1');

    expect(res.mode).toBe('ARCHIVED');
    expect(P.riddle.deleteMany).not.toHaveBeenCalled();
    expect(P.treasureHunt.deleteMany).not.toHaveBeenCalled();
    expect(P.riddle.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['r-1'] } },
      data: { status: 'ARCHIVED' },
    });
    // Hunt archived via update (per-hunt, not updateMany)
    expect(P.treasureHunt.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'h-1' }, data: { status: 'ARCHIVED' } }),
    );
  });

  it('ARCHIVES when hunt-level progress exists (huntId-scoped check)', async () => {
    P.treasureHuntImportLog.findUnique.mockResolvedValue({
      id: 'imp-1',
      fileName: 'a.xlsx',
      status: 'COMPLETED',
      deletedAt: null,
    });
    P.riddle.findMany.mockResolvedValue([{ id: 'r-1', huntId: 'h-1' }]);
    P.treasureHuntProgress.count.mockResolvedValue(2);
    P.riddle.count.mockResolvedValue(0);

    const res = await riddlesService.deleteImport('imp-1', 'admin-1');

    expect(res.mode).toBe('ARCHIVED');
    expect(P.treasureHuntProgress.count).toHaveBeenCalledWith({ where: { huntId: { in: ['h-1'] } } });
    expect(P.riddle.deleteMany).not.toHaveBeenCalled();
  });

  it('ARCHIVES when a wallet transaction references the content (wallet rows are never deleted)', async () => {
    P.treasureHuntImportLog.findUnique.mockResolvedValue({
      id: 'imp-1',
      fileName: 'a.xlsx',
      status: 'COMPLETED',
      deletedAt: null,
    });
    P.riddle.findMany.mockResolvedValue([{ id: 'r-1', huntId: 'h-1' }]);
    P.walletTransaction.count.mockResolvedValue(1);
    P.riddle.count.mockResolvedValue(0);

    const res = await riddlesService.deleteImport('imp-1', 'admin-1');

    expect(res.mode).toBe('ARCHIVED');
    expect(P.walletTransaction.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { referenceType: 'RIDDLE', referenceId: { in: ['r-1'] } },
            { referenceType: 'TREASURE_HUNT', referenceId: { in: ['h-1'] } },
          ],
        },
      }),
    );
    // No wallet mutation API is ever invoked by deletion.
    expect(P.walletTransaction.deleteMany).toBeUndefined();
    expect(P.walletTransaction.delete).toBeUndefined();
  });

  it('ARCHIVES when a daily attempt record exists (dailyAttempt check)', async () => {
    P.treasureHuntImportLog.findUnique.mockResolvedValue({
      id: 'imp-1',
      fileName: 'a.xlsx',
      status: 'COMPLETED',
      deletedAt: null,
    });
    P.riddle.findMany.mockResolvedValue([{ id: 'r-1', huntId: 'h-1' }]);
    P.riddleDailyAttempt.count.mockResolvedValue(3);
    P.riddle.count.mockResolvedValue(0);

    const res = await riddlesService.deleteImport('imp-1', 'admin-1');

    expect(res.mode).toBe('ARCHIVED');
    expect(P.riddleDailyAttempt.count).toHaveBeenCalledWith({ where: { riddleId: { in: ['r-1'] } } });
    expect(P.riddle.deleteMany).not.toHaveBeenCalled();
  });

  it('returns the full audit shape (importId, fileName, hunts, riddles, mode)', async () => {
    P.treasureHuntImportLog.findUnique.mockResolvedValue({
      id: 'imp-9',
      fileName: 'lucknow.xlsx',
      status: 'COMPLETED',
      deletedAt: null,
    });
    P.riddle.findMany.mockResolvedValue([{ id: 'r-1', huntId: 'h-1' }]);
    P.treasureHunt.findMany.mockResolvedValue([{ id: 'h-1', _count: { riddles: 0 } }]);

    const res = await riddlesService.deleteImport('imp-9', 'admin-1');

    expect(res).toMatchObject({
      importId: 'imp-9',
      fileName: 'lucknow.xlsx',
      alreadyDeleted: false,
      mode: 'DELETED',
      riddles: 1,
      hunts: 1,
    });
  });
});

describe('riddlesService.bulkImportExecute (ownership stamping, non-destructive)', () => {
  const validRows = [
    { status: 'VALID', city: 'Kolkata', clueEnglish: 'c1', answerEnglish: 'a1', clueHindi: 'h1', answerHindi: 'b1' },
    { status: 'VALID', city: 'Kolkata', clueEnglish: 'c2', answerEnglish: 'a2', clueHindi: 'h2', answerHindi: 'b2' },
    { status: 'INVALID', city: 'Kolkata', clueEnglish: 'bad', answerEnglish: '', clueHindi: '', answerHindi: '' },
  ];

  it('creates the log FIRST as PROCESSING, stamps importLogId on every riddle, then marks COMPLETED', async () => {
    P.treasureHuntImportLog.create.mockResolvedValue({ id: 'imp-new' });
    P.treasureHunt.upsert.mockResolvedValue({ id: 'h-1', city: 'Kolkata' });
    P.riddle.findFirst.mockResolvedValue(null); // no existing active riddles
    P.riddle.createMany.mockResolvedValue({ count: 2 });

    const res = await riddlesService.bulkImportExecute({
      validRows,
      fileName: 'kolkata.xlsx',
      uploadedById: 'admin-1',
      totalRows: 3,
      invalidRows: 1,
      cities: ['Kolkata'],
    });

    // Log created before riddles, initially PROCESSING.
    expect(P.treasureHuntImportLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ fileName: 'kolkata.xlsx', status: 'PROCESSING', validRows: 2, failedRows: 1 }),
    });

    // Every created riddle carries the ownership link.
    const createArg = P.riddle.createMany.mock.calls[0][0];
    expect(createArg.data).toHaveLength(2);
    for (const row of createArg.data) {
      expect(row.importLogId).toBe('imp-new');
    }

    // Only complete once the riddles are written.
    expect(P.treasureHuntImportLog.update).toHaveBeenCalledWith({
      where: { id: 'imp-new' },
      data: { status: 'COMPLETED' },
    });

    // Invalid row is never imported.
    expect(res.imported).toBe(2);
  });

  it('does NOT call riddle.deleteMany on re-import (non-destructive: existing city riddles preserved)', async () => {
    P.treasureHuntImportLog.create.mockResolvedValue({ id: 'imp-x' });
    P.treasureHunt.upsert.mockResolvedValue({ id: 'h-1', city: 'Kolkata' });
    P.riddle.findFirst.mockResolvedValue({ sequence: 5 }); // existing active riddle with seq=5
    P.riddle.createMany.mockResolvedValue({ count: 1 });

    await riddlesService.bulkImportExecute({
      validRows: [
        { status: 'VALID', city: 'Kolkata', clueEnglish: 'c1', answerEnglish: 'a1', clueHindi: 'h1', answerHindi: 'b1' },
      ],
      fileName: 'k.xlsx',
      uploadedById: 'admin-1',
      totalRows: 1,
      invalidRows: 0,
      cities: ['Kolkata'],
    });

    // The key safety guarantee: no deleteMany is ever called on city riddles
    expect(P.riddle.deleteMany).not.toHaveBeenCalled();
  });

  it('appends sequences after existing active riddles to avoid collision', async () => {
    P.treasureHuntImportLog.create.mockResolvedValue({ id: 'imp-x' });
    P.treasureHunt.upsert.mockResolvedValue({ id: 'h-1', city: 'Kolkata' });
    // Existing riddle at sequence 3
    P.riddle.findFirst.mockResolvedValue({ sequence: 3 });
    P.riddle.createMany.mockResolvedValue({ count: 2 });

    await riddlesService.bulkImportExecute({
      validRows: [
        { status: 'VALID', city: 'Kolkata', clueEnglish: 'c1', answerEnglish: 'a1', clueHindi: 'h1', answerHindi: 'b1' },
        { status: 'VALID', city: 'Kolkata', clueEnglish: 'c2', answerEnglish: 'a2', clueHindi: 'h2', answerHindi: 'b2' },
      ],
      fileName: 'k.xlsx',
      uploadedById: 'admin-1',
      totalRows: 2,
      invalidRows: 0,
      cities: ['Kolkata'],
    });

    const createArg = P.riddle.createMany.mock.calls[0][0];
    // New riddles start at seq 4, 5
    expect(createArg.data[0].sequence).toBe(4);
    expect(createArg.data[1].sequence).toBe(5);
  });

  it('sets rewardCoins to TREASURE_HUNT_RIDDLE_REWARD_POINTS (20) on every created riddle', async () => {
    P.treasureHuntImportLog.create.mockResolvedValue({ id: 'imp-x' });
    P.treasureHunt.upsert.mockResolvedValue({ id: 'h-1', city: 'Kolkata' });
    P.riddle.findFirst.mockResolvedValue(null);
    P.riddle.createMany.mockResolvedValue({ count: 1 });

    await riddlesService.bulkImportExecute({
      validRows: [
        { status: 'VALID', city: 'Kolkata', clueEnglish: 'c1', answerEnglish: 'a1', clueHindi: 'h1', answerHindi: 'b1' },
      ],
      fileName: 'k.xlsx',
      uploadedById: 'admin-1',
      totalRows: 1,
      invalidRows: 0,
      cities: ['Kolkata'],
    });

    const createArg = P.riddle.createMany.mock.calls[0][0];
    expect(createArg.data[0].rewardCoins).toBe(TREASURE_HUNT_RIDDLE_REWARD_POINTS);
    expect(createArg.data[0].rewardCoins).toBe(20);
  });

  it('does not import rows whose status is not VALID', async () => {
    P.treasureHuntImportLog.create.mockResolvedValue({ id: 'imp-x' });
    P.treasureHunt.upsert.mockResolvedValue({ id: 'h-1', city: 'Kolkata' });
    P.riddle.findFirst.mockResolvedValue(null);
    P.riddle.createMany.mockResolvedValue({ count: 1 });

    await riddlesService.bulkImportExecute({
      validRows: [
        { status: 'VALID', city: 'Kolkata', clueEnglish: 'c1', answerEnglish: 'a1', clueHindi: 'h1', answerHindi: 'b1' },
        { status: 'INVALID', city: 'Kolkata', clueEnglish: 'bad', answerEnglish: '', clueHindi: '', answerHindi: '' },
      ],
      fileName: 'k.xlsx',
      uploadedById: 'admin-1',
      totalRows: 2,
      invalidRows: 1,
      cities: ['Kolkata'],
    });

    const createArg = P.riddle.createMany.mock.calls[0][0];
    expect(createArg.data).toHaveLength(1);
  });
});
