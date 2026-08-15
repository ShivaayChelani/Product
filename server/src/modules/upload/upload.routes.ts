import { Router } from 'express';
import { uploadController } from './upload.controller';
import { authenticate } from '../../middleware/auth';
import { upload, videoUpload } from '../../config/upload';
import { uploadLimiter } from '../../config/rateLimit';

const router = Router();

router.use(authenticate);
router.use(uploadLimiter);

router.post('/single', upload.single('image'), uploadController.uploadImage);
router.post('/multiple', upload.array('images', 5), uploadController.uploadMultiple);
router.post('/video', videoUpload.single('video'), uploadController.uploadVideo);

export default router;
