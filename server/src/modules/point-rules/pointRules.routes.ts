import { Router } from 'express';
import { pointRulesController } from './pointRules.controller';
import { authenticate, optionalAuth } from '../../middleware/auth';
import { requireFinanceOps } from '../../middleware/adminCapabilities';

const router = Router();

const requirePointRuleMutator = requireFinanceOps;

router.get('/', optionalAuth, pointRulesController.list);
router.get('/:key', optionalAuth, pointRulesController.getByKey);

router.post('/', authenticate, requirePointRuleMutator, pointRulesController.create);
router.post('/reset-defaults', authenticate, requirePointRuleMutator, pointRulesController.resetDefaults);
router.patch('/:id', authenticate, requirePointRuleMutator, pointRulesController.update);
router.delete('/:id', authenticate, requirePointRuleMutator, pointRulesController.delete);

export default router;
