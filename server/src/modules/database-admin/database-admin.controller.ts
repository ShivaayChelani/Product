import { Request, Response } from 'express';
import { Role } from '@prisma/client';
import { catchAsync } from '../../shared/utils/catchAsync';
import { sendSuccess } from '../../shared/utils/response';
import { databaseAdminService } from './database-admin.service';
import { databaseExplorerService } from './database-explorer.service';

export const databaseAdminController = {
  overview: catchAsync(async (_req: Request, res: Response) => {
    sendSuccess(res, await databaseAdminService.getOverview());
  }),

  tableStats: catchAsync(async (_req: Request, res: Response) => {
    sendSuccess(res, await databaseAdminService.getTableStats());
  }),

  qualityReport: catchAsync(async (_req: Request, res: Response) => {
    sendSuccess(res, await databaseAdminService.getQualityReport());
  }),

  ensureExtensions: catchAsync(async (_req: Request, res: Response) => {
    const extensions = await databaseAdminService.ensureExtensions();
    sendSuccess(res, extensions, { message: 'Database extensions and triggers applied' });
  }),

  startupSeed: catchAsync(async (_req: Request, res: Response) => {
    const result = await databaseAdminService.runStartupSeed();
    sendSuccess(res, result, { message: 'Startup seed completed (admins, settings, point rules)' });
  }),

  settingsSeed: catchAsync(async (_req: Request, res: Response) => {
    const result = await databaseAdminService.seedSettingsDefaults();
    sendSuccess(res, result, { message: 'Default settings seeded' });
  }),

  duplicateScan: catchAsync(async (req: Request, res: Response) => {
    const precision = parseInt(String(req.body?.precision ?? 6), 10);
    const prefixBatch = parseInt(String(req.body?.prefixBatch ?? 100), 10);
    const prefixOffset = parseInt(String(req.body?.prefixOffset ?? 0), 10);
    const result = await databaseAdminService.runDuplicateScan({ precision, prefixBatch, prefixOffset });
    sendSuccess(res, result, { message: 'Duplicate scan batch completed' });
  }),

  autoMerge: catchAsync(async (req: any, res: Response) => {
    const minConfidence = parseFloat(String(req.body?.minConfidence ?? 0.86));
    const limit = parseInt(String(req.body?.limit ?? 50), 10);
    const result = await databaseAdminService.runAutoMerge({
      minConfidence,
      limit,
      mergedById: req.user.id,
    });
    sendSuccess(res, result, { message: 'Auto-merge batch completed' });
  }),

  dataIntegrityStatus: catchAsync(async (_req: Request, res: Response) => {
    sendSuccess(res, await databaseAdminService.getDataIntegrityStatus());
  }),

  runDataIntegrityPhase: catchAsync(async (req: Request, res: Response) => {
    const phase = String(req.body?.phase || '');
    const limit = parseInt(String(req.body?.limit ?? 500), 10);
    const result = await databaseAdminService.runDataIntegrityPhase(phase, limit);
    sendSuccess(res, result, { message: `Phase ${phase} completed` });
  }),

  // Database Explorer Endpoints
  explorerTables: catchAsync(async (_req: Request, res: Response) => {
    sendSuccess(res, await databaseExplorerService.getTables());
  }),

  explorerTableSchema: catchAsync(async (req: Request, res: Response) => {
    const table = String(req.params.table);
    sendSuccess(res, await databaseExplorerService.getTableSchema(table));
  }),

  explorerTableRecords: catchAsync(async (req: Request, res: Response) => {
    const table = String(req.params.table);
    const page = parseInt(String(req.query.page ?? 1), 10);
    const pageSize = parseInt(String(req.query.pageSize ?? 50), 10);
    const search = req.query.search ? String(req.query.search) : undefined;
    sendSuccess(res, await databaseExplorerService.getTableRecords(table, page, pageSize, search));
  }),
};

export const DATABASE_OPS_ROLES = [Role.SUPER_ADMIN, Role.ADMIN, Role.OPS_ADMIN];
