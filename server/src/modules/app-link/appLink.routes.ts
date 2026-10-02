import { Router } from 'express';
import { appLinkController } from './appLink.controller';
import { globalLimiter } from '../../config/rateLimit';

const router = Router();

// Association files are cached by the verifier and hit rarely; the landing page
// is an unauthenticated DB read, so it stays under the same budget as /api.
router.get('/.well-known/assetlinks.json', appLinkController.assetLinks);
router.get('/.well-known/apple-app-site-association', appLinkController.appleAppSiteAssociation);
router.get('/reel/:reelId', globalLimiter, appLinkController.reelLandingPage);
router.get('/trip/shared/:token', globalLimiter, appLinkController.tripLandingPage);

export default router;
