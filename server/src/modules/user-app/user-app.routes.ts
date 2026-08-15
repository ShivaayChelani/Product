import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { userAppController } from './user-app.controller';
import {
  blockUserSchema,
  feedbackSchema,
  patchUserAppSettingsSchema,
  revokeSessionSchema,
} from './user-app.validation';

const router = Router();

router.use(authenticate);

router.get('/settings', userAppController.getSettings);
router.patch('/settings', validate(patchUserAppSettingsSchema), userAppController.patchSettings);

router.get('/blocks', userAppController.listBlocks);
router.post('/blocks', validate(blockUserSchema), userAppController.blockUser);
router.delete('/blocks/:blockId', userAppController.unblockUser);

router.get('/data-export', userAppController.exportData);
router.post('/data-delete', userAppController.deletePersonalData);

router.get('/sessions', userAppController.listSessions);
router.delete('/sessions/:sessionId', userAppController.revokeSession);
router.post('/sessions/revoke-others', validate(revokeSessionSchema), userAppController.revokeOtherSessions);

router.post('/feedback', validate(feedbackSchema), userAppController.submitFeedback);

export default router;
