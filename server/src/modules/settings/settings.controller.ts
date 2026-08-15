import { Response } from 'express';
import { settingsService } from './settings.service';
import { catchAsync } from '../../shared/utils/catchAsync';
import { sendSuccess } from '../../shared/utils/response';

export const settingsController = {
  list: catchAsync(async (_req: any, res: Response) => {
    const settings = await settingsService.getAll();
    sendSuccess(res, settings);
  }),

  getByCategory: catchAsync(async (req: any, res: Response) => {
    const settings = await settingsService.getByCategory(req.params.category);
    sendSuccess(res, settings);
  }),

  update: catchAsync(async (req: any, res: Response) => {
    const setting = await settingsService.update(req.params.key, req.body.value);
    sendSuccess(res, setting, { message: 'Setting updated' });
  }),

  bulkUpdate: catchAsync(async (req: any, res: Response) => {
    const results = await settingsService.bulkUpdate(req.body.updates);
    sendSuccess(res, results, { message: 'Settings updated' });
  }),

  resetDefaults: catchAsync(async (_req: any, res: Response) => {
    const settings = await settingsService.resetDefaults();
    sendSuccess(res, settings, { message: 'Settings reset to defaults' });
  }),

  seedDefaults: catchAsync(async (_req: any, res: Response) => {
    await settingsService.seedDefaults();
    sendSuccess(res, null, { message: 'Default settings seeded' });
  }),

  getCategories: catchAsync(async (_req: any, res: Response) => {
    const categories = await settingsService.getCategories();
    sendSuccess(res, categories);
  }),
};
