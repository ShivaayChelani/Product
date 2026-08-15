import { Router } from 'express';
import { walletController } from './wallet.controller';
import { authenticate, requireAdmin, optionalAuth } from '../../middleware/auth';
import { requireFinanceOps } from '../../middleware/adminCapabilities';
import { validate } from '../../middleware/validate';
import { leaderboardLimiter } from '../../config/rateLimit';
import { earnPointsSchema, adjustWalletSchema, walletQuerySchema, walletBatchQuerySchema } from './wallet.validation';

const router = Router();

/** Manual credit / debit — finance-capable roles only (not analytics/support viewers). */
const requireWalletMutator = requireFinanceOps;

router.get('/profile', authenticate, walletController.getProfile);
router.post('/earn', authenticate, requireWalletMutator, validate(earnPointsSchema), walletController.earn);
// Spend is internal-only (redemptions service). No public spend endpoint.
router.get('/transactions', authenticate, validate(walletQuerySchema, 'query'), walletController.transactions);
router.post('/adjust/:userId', authenticate, requireWalletMutator, validate(adjustWalletSchema), walletController.adjust);
router.get('/admin/batch', authenticate, requireAdmin, validate(walletBatchQuerySchema, 'query'), walletController.getBatch);
router.get('/admin/:userId', authenticate, requireAdmin, walletController.getByUserId);
router.get('/leaderboard', leaderboardLimiter, walletController.getLeaderboard);
router.get('/leaderboard/regional', leaderboardLimiter, optionalAuth, walletController.getRegionalLeaderboard);
router.post('/game-completion', authenticate, walletController.completeGame);
router.get('/daily-login/status', authenticate, walletController.dailyLoginStatus);
router.post('/daily-login/claim', authenticate, walletController.claimDailyLogin);

export default router;
