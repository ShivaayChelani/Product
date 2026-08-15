import { Response } from 'express';
import { pointRulesService } from './pointRules.service';
import { catchAsync } from '../../shared/utils/catchAsync';
import { sendSuccess, sendCreated, sendNoContent } from '../../shared/utils/response';

export const pointRulesController = {
  list: catchAsync(async (_req: any, res: Response) => {
    const rules = await pointRulesService.listRules();
    sendSuccess(res, rules);
  }),

  getByKey: catchAsync(async (req: any, res: Response) => {
    const rule = await pointRulesService.getRuleByKey(req.params.key);
    sendSuccess(res, rule);
  }),

  create: catchAsync(async (req: any, res: Response) => {
    const rule = await pointRulesService.createRule(req.body);
    sendCreated(res, rule, 'Point rule created');
  }),

  update: catchAsync(async (req: any, res: Response) => {
    const rule = await pointRulesService.updateRule(req.params.id, req.body);
    sendSuccess(res, rule, { message: 'Point rule updated' });
  }),

  delete: catchAsync(async (req: any, res: Response) => {
    await pointRulesService.deleteRule(req.params.id);
    sendNoContent(res);
  }),

  resetDefaults: catchAsync(async (_req: any, res: Response) => {
    await pointRulesService.seedDefaults();
    const rules = await pointRulesService.listRules();
    sendSuccess(res, rules, { message: 'Point rules reset to defaults' });
  }),
};
