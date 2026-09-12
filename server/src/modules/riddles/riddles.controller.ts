import { Request, Response } from 'express';
import { riddlesService } from './riddles.service';
import { catchAsync } from '../../shared/utils/catchAsync';
import { sendSuccess } from '../../shared/utils/response';
import { ApiError } from '../../shared/utils/ApiError';

export const riddlesController = {
  // ─── Admin ──────────────────────────────────────────────────────────────────

  listAllHunts: catchAsync(async (req: Request, res: Response) => {
    const result = await riddlesService.listAllHunts(req.query as any);
    sendSuccess(res, result.data, { pagination: result.pagination });
  }),

  listAllRiddles: catchAsync(async (req: Request, res: Response) => {
    const result = await riddlesService.listAllRiddles(req.query as any);
    sendSuccess(res, result.data, { pagination: result.pagination });
  }),

  deleteHunt: catchAsync(async (req: Request, res: Response) => {
    await riddlesService.deleteHunt(req.params.id as string);
    sendSuccess(res, null, { message: 'Hunt deleted' });
  }),

  deleteImport: catchAsync(async (req: any, res: Response) => {
    const result = await riddlesService.deleteImport(req.params.importId as string, req.user.id);
    const message =
      result.mode === 'DELETED'
        ? `Import "${result.fileName}" deleted (${result.riddles} riddles removed).`
        : result.mode === 'ARCHIVED'
          ? `Import "${result.fileName}" archived — user progress and reward history were preserved (${result.riddles} riddles deactivated).`
          : result.alreadyDeleted
            ? `Import "${result.fileName}" was already deleted.`
            : `Import "${result.fileName}" had no imported content to remove.`;
    sendSuccess(res, result, { message });
  }),

  // ──────────────── Admin Excel Bulk Import ────────────────

  bulkImportValidate: catchAsync(async (req: any, res: Response) => {
    if (!req.file) {
      throw new ApiError(400, 'No file uploaded');
    }
    const result = await riddlesService.bulkImportValidate(req.file.buffer);
    sendSuccess(res, result);
  }),

  bulkImportConfirm: catchAsync(async (req: any, res: Response) => {
    const { validRows, totalRows, invalidRows, cities, fileName } = req.body;
    if (!Array.isArray(validRows) || validRows.length === 0) {
      throw new ApiError(400, 'No valid rows to import');
    }
    if (!fileName) {
      throw new ApiError(400, 'File name is required');
    }
    const result = await riddlesService.bulkImportExecute({
      validRows,
      fileName,
      uploadedById: req.user.id,
      totalRows: Number(totalRows) || validRows.length,
      invalidRows: Number(invalidRows) || 0,
      cities: Array.isArray(cities) ? cities : [],
    });
    sendSuccess(res, result, { message: `Imported ${result.imported} riddles` });
  }),

  getOverview: catchAsync(async (req: Request, res: Response) => {
    const result = await riddlesService.getOverview();
    sendSuccess(res, result);
  }),

  getCities: catchAsync(async (req: Request, res: Response) => {
    const result = await riddlesService.getCities();
    sendSuccess(res, result);
  }),

  listImportHistory: catchAsync(async (req: Request, res: Response) => {
    const result = await riddlesService.listImportHistory(req.query as any);
    sendSuccess(res, result.data, { pagination: result.pagination });
  }),

  // ──────────────── User Gameplay ────────────────

  getCurrentCityHunt: catchAsync(async (req: Request, res: Response) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const hunt = await riddlesService.getCurrentCityHunt(lat, lng);
    sendSuccess(res, hunt);
  }),

  getEligibleRiddle: catchAsync(async (req: any, res: Response) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const result = await riddlesService.getEligibleRiddle(
      req.params.id as string,
      lat,
      lng,
      req.user.id,
    );
    sendSuccess(res, result);
  }),

  getHuntDetails: catchAsync(async (req: any, res: Response) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const hunt = await riddlesService.getHuntDetails(req.params.id as string, lat, lng, req.user.id);
    sendSuccess(res, hunt);
  }),

  getRiddle: catchAsync(async (req: Request, res: Response) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const riddle = await riddlesService.getRiddle(req.params.huntId as string, req.params.riddleId as string, lat, lng);
    sendSuccess(res, riddle);
  }),

  submitAnswer: catchAsync(async (req: any, res: Response) => {
    const { answer, language } = req.body;
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const result = await riddlesService.submitAnswer(
      req.params.huntId as string,
      req.params.riddleId as string,
      req.user.id,
      answer,
      language,
      lat,
      lng
    );
    sendSuccess(res, result);
  }),

  getMyHuntProgress: catchAsync(async (req: any, res: Response) => {
    const progress = await riddlesService.getMyHuntProgress(req.user.id);
    sendSuccess(res, progress);
  }),
};
