import { Response } from 'express';
import { catchAsync } from '../../shared/utils/catchAsync';
import { sendSuccess } from '../../shared/utils/response';
import { userAppService } from './user-app.service';

export const userAppController = {
  getSettings: catchAsync(async (req: any, res: Response) => {
    const data = await userAppService.getSettings(req.user.id);
    sendSuccess(res, data);
  }),

  patchSettings: catchAsync(async (req: any, res: Response) => {
    const data = await userAppService.patchSettings(req.user.id, req.body);
    sendSuccess(res, data, { message: 'Settings saved' });
  }),

  listBlocks: catchAsync(async (req: any, res: Response) => {
    const data = await userAppService.listBlocks(req.user.id);
    sendSuccess(res, data);
  }),

  blockUser: catchAsync(async (req: any, res: Response) => {
    const data = await userAppService.blockUser(req.user.id, req.body.blockedUserId);
    sendSuccess(res, data);
  }),

  unblockUser: catchAsync(async (req: any, res: Response) => {
    const data = await userAppService.unblockUser(req.user.id, req.params.blockId);
    sendSuccess(res, data);
  }),

  exportData: catchAsync(async (req: any, res: Response) => {
    const data = await userAppService.exportPersonalData(req.user.id);
    sendSuccess(res, data);
  }),

  deletePersonalData: catchAsync(async (req: any, res: Response) => {
    const data = await userAppService.deletePersonalData(req.user.id);
    sendSuccess(res, data, { message: 'Personal activity data cleared' });
  }),

  listSessions: catchAsync(async (req: any, res: Response) => {
    const data = await userAppService.listSessions(req.user.id);
    sendSuccess(res, data);
  }),

  revokeSession: catchAsync(async (req: any, res: Response) => {
    const data = await userAppService.revokeSession(req.user.id, req.params.sessionId);
    sendSuccess(res, data);
  }),

  revokeOtherSessions: catchAsync(async (req: any, res: Response) => {
    const refreshToken = req.body?.refreshToken ?? null;
    const data = await userAppService.revokeOtherSessions(req.user.id, refreshToken);
    sendSuccess(res, data);
  }),

  submitFeedback: catchAsync(async (req: any, res: Response) => {
    const data = await userAppService.submitFeedback(
      req.user?.id ?? null,
      req.body.category,
      req.body.message,
      req.body.metadata,
    );
    sendSuccess(res, data, { message: 'Thank you for your feedback' });
  }),
};
