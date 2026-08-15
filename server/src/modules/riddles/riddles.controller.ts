import { Request, Response } from 'express';
import { riddlesService } from './riddles.service';
import { catchAsync } from '../../shared/utils/catchAsync';
import { sendSuccess, sendCreated } from '../../shared/utils/response';

export const riddlesController = {
  // ─── Admin ──────────────────────────────────────────────────────────────────

  list: catchAsync(async (req: Request, res: Response) => {
    const result = await riddlesService.listAll(req.query as any);
    sendSuccess(res, result.data, { pagination: result.pagination });
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

  // ─── User ────────────────────────────────────────────────────────────────────

  getActiveForCity: catchAsync(async (req: Request, res: Response) => {
    const city = (req.query.city as string) || '';
    const riddles = city ? await riddlesService.getActiveForCity(city) : [];
    sendSuccess(res, riddles);
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
    const submission = await riddlesService.submit(req.params.id as string, req.user.id, req.body.photoUrl);
    sendCreated(res, submission, 'Answer submitted! Admin will review it soon.');
  }),
};
