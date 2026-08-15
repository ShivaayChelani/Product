import { Router } from 'express';
import { rewardsController } from './rewards.controller';
import { authenticate } from '../../middleware/auth';
import { requireFinanceOps } from '../../middleware/adminCapabilities';
import { validate } from '../../middleware/validate';
import { createRewardSchema, updateRewardSchema, redeemVendorOfferSchema } from './rewards.validation';

const router = Router();

router.get('/', rewardsController.list);
router.get('/offers', rewardsController.listOffers);
router.get('/offers/:offerId', rewardsController.getVendorOfferById);
router.post('/redeem', authenticate, validate(redeemVendorOfferSchema), rewardsController.redeemOffer);
router.get('/nearby', rewardsController.nearby);
router.get('/:id', rewardsController.getById);
router.post('/', authenticate, requireFinanceOps, validate(createRewardSchema), rewardsController.create);
router.patch('/:id', authenticate, requireFinanceOps, validate(updateRewardSchema), rewardsController.update);
router.delete('/:id', authenticate, requireFinanceOps, rewardsController.delete);

export default router;
