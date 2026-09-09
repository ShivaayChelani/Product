import { Request, Response } from 'express';
import { riddlesService } from './riddles.service';
import { catchAsync } from '../../shared/utils/catchAsync';
import { sendSuccess, sendCreated } from '../../shared/utils/response';
import { ApiError } from '../../shared/utils/ApiError';

export const riddlesController = {
  // ─── Admin ──────────────────────────────────────────────────────────────────

  list: catchAsync(async (req: Request, res: Response) => {
    const result = await riddlesService.listAll(req.query as any);
    sendSuccess(res, result.data, { pagination: result.pagination });
  }),

  getCitySummary: catchAsync(async (req: Request, res: Response) => {
    const summary = await riddlesService.getCitySummary();
    sendSuccess(res, summary);
  }),

  getById: catchAsync(async (req: Request, res: Response) => {
    const riddle = await riddlesService.getById(req.params.id as string);
    sendSuccess(res, riddle);
  }),

  create: catchAsync(async (req: Request, res: Response) => {
    const riddle = await riddlesService.create(req.body);
    sendCreated(res, riddle, 'Riddle created');
  }),

  update: catchAsync(async (req: Request, res: Response) => {
    const riddle = await riddlesService.update(req.params.id as string, req.body);
    sendSuccess(res, riddle, { message: 'Riddle updated' });
  }),

  delete: catchAsync(async (req: Request, res: Response) => {
    await riddlesService.delete(req.params.id as string);
    sendSuccess(res, null, { message: 'Riddle deleted' });
  }),

  getSubmissions: catchAsync(async (req: Request, res: Response) => {
    const result = await riddlesService.getSubmissions(req.params.id as string, req.query as any);
    sendSuccess(res, result.data, { pagination: result.pagination });
  }),

  getAllPendingSubmissions: catchAsync(async (req: Request, res: Response) => {
    const result = await riddlesService.getAllPendingSubmissions(req.query as any);
    sendSuccess(res, result.data, { pagination: result.pagination });
  }),

  approve: catchAsync(async (req: any, res: Response) => {
    const result = await riddlesService.approve(req.params.submissionId as string, req.user.id);
    sendSuccess(res, result, { message: 'Submission approved and points awarded' });
  }),

  reject: catchAsync(async (req: any, res: Response) => {
    const result = await riddlesService.reject(req.params.submissionId as string, req.user.id, req.body);
    sendSuccess(res, result, { message: 'Submission rejected' });
  }),

  // ──────────────── Admin Excel Bulk Import ────────────────

  bulkImportValidate: catchAsync(async (req: any, res: Response) => {
    if (!req.file) {
      throw new ApiError(400, 'No file uploaded');
    }
    const result = await riddlesService.bulkImportValidate(req.file.buffer);
    sendSuccess(res, result);
  }),

  bulkImportConfirm: catchAsync(async (req: Request, res: Response) => {
    const result = await riddlesService.bulkImportConfirm(req.body.validRows);
    sendSuccess(res, result, { message: `Imported ${result.imported} riddles` });
  }),

  // ──────────────── User Gameplay ────────────────

  getActiveForCurrentLocation: catchAsync(async (req: Request, res: Response) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const riddles = await riddlesService.getActiveForCurrentLocation(lat, lng);
    sendSuccess(res, riddles);
  }),

  getByIdUser: catchAsync(async (req: Request, res: Response) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const riddle = await riddlesService.getByIdUser(req.params.id as string, lat, lng);
    sendSuccess(res, riddle);
  }),

  getHint: catchAsync(async (req: Request, res: Response) => {
    const lat = Number(req.body.userLat || req.body.lat);
    const lng = Number(req.body.userLng || req.body.lng);
    const hint = await riddlesService.getHint(req.params.id as string, lat, lng);
    sendSuccess(res, hint);
  }),

  validateCheckIn: catchAsync(async (req: any, res: Response) => {
    const { userLat, userLng } = req.body;
    const result = await riddlesService.validateCheckIn(req.params.id as string, Number(userLat), Number(userLng));
    sendSuccess(res, result);
  }),

  getMySubmissions: catchAsync(async (req: any, res: Response) => {
    const submissions = await riddlesService.getMySubmissions(req.user.id);
    sendSuccess(res, submissions);
  }),

  getMySubmission: catchAsync(async (req: any, res: Response) => {
    const submission = await riddlesService.getMySubmission(req.params.id as string, req.user.id);
    sendSuccess(res, submission);
  }),

  submit: catchAsync(async (req: any, res: Response) => {
    const { photoUrl, userLat, userLng } = req.body;
    const submission = await riddlesService.submit(
      req.params.id as string,
      req.user.id,
      photoUrl,
      Number(userLat),
      Number(userLng)
    );
    sendCreated(res, submission, 'Answer submitted! Admin will review it soon.');
  }),
};
