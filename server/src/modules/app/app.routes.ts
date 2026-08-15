import { Router } from 'express';
import { appPublicController } from './app.controller';

const router = Router();

router.get('/mobile-config', appPublicController.mobileConfig);
router.get('/licenses', appPublicController.licenses);

export default router;
