import { Router } from 'express';
import { redemptionsController } from './redemptions.controller';
import { authenticate, requireAdmin, requireVendorRole } from '../../middleware/auth';
import { requireFinanceOps } from '../../middleware/adminCapabilities';
import { validate } from '../../middleware/validate';
import {
  redeemOfferSchema,
  payPointsSchema,
  adminRefundSchema,
  adminListSchema,
} from './redemptions.validation';
import { partnerRedeemLimiter } from '../../config/rateLimit';

const router = Router();

router.post('/redeem', authenticate, validate(redeemOfferSchema), redemptionsController.redeemOffer);
router.post('/generate', authenticate, validate(redeemOfferSchema), redemptionsController.redeemOffer);
router.post('/pay', authenticate, partnerRedeemLimiter, validate(payPointsSchema), redemptionsController.pay);
router.get('/mine', authenticate, redemptionsController.myRedemptions);
router.get('/vendor', authenticate, requireVendorRole, redemptionsController.vendorRedemptions);
router.post('/:id/refund', authenticate, requireFinanceOps, validate(adminRefundSchema), redemptionsController.adminRefund);
router.get('/admin/all', authenticate, requireAdmin, validate(adminListSchema, 'query'), redemptionsController.adminListAll);
router.get('/admin/export', authenticate, requireAdmin, redemptionsController.adminExport);
router.get('/admin/fraud-alerts', authenticate, requireAdmin, redemptionsController.adminFraudAlerts);

export default router;
