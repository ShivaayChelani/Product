import { Router } from 'express';
import { authenticate, optionalAuth, requireAdmin, requireVendorRole } from '../../middleware/auth';
import { requireFinanceOps, requireContentOps } from '../../middleware/adminCapabilities';
import { monetizationController } from './monetization.controller';
import { adClaimLimiter, partnerRedeemLimiter } from '../../config/rateLimit';

const router = Router();

// ── Public / client ──────────────────────────────────────────────
router.get('/plans', monetizationController.listPlansPublic);
router.get('/plans/:id', monetizationController.getPlan);
router.get('/ads/config', optionalAuth, monetizationController.getAdConfigClient);
router.post('/ads/claim-reward', authenticate, adClaimLimiter, monetizationController.claimRewardedAd);
router.get('/ads/ssv', monetizationController.adMobSsvCallback);

// ── Authenticated user ───────────────────────────────────────────
router.get('/entitlements/me', authenticate, monetizationController.getMyEntitlements);
router.get('/transactions/me', authenticate, monetizationController.listMyTransactions);
router.get('/invoices/me', authenticate, monetizationController.listMyInvoices);
router.get('/invoices/:id/pdf', authenticate, monetizationController.downloadInvoicePdf);
router.post('/razorpay/order', authenticate, monetizationController.createRazorpayOrder);
router.post('/razorpay/verify', authenticate, monetizationController.verifyRazorpayPayment);
router.post('/iap/verify', authenticate, monetizationController.verifyIap);

// Vendor ops
router.get('/vendor/customers', authenticate, requireVendorRole, monetizationController.vendorCustomers);
router.get('/vendor/customers/export.csv', authenticate, requireVendorRole, monetizationController.vendorCustomersCsv);
router.get('/vendor/documents', authenticate, requireVendorRole, monetizationController.listMyDocuments);
router.post('/vendor/documents', authenticate, requireVendorRole, monetizationController.uploadDocument);
router.post('/vendor/coupons', authenticate, requireVendorRole, monetizationController.createCouponVendor);

router.get('/pal-points-partner/offers', monetizationController.listPalPointsPartnerOffersPublic);
router.post('/pal-points-partner/redeem', authenticate, partnerRedeemLimiter, monetizationController.redeemPalPointsPartnerOffer);
router.get('/pal-points-partner/me', authenticate, requireVendorRole, monetizationController.getVendorPalPointsPartner);
router.patch('/pal-points-partner/me', authenticate, requireVendorRole, monetizationController.updateVendorPalPointsPartner);
router.post('/pal-points-partner/offers/manage', authenticate, requireVendorRole, monetizationController.upsertVendorPalPointsPartnerOffer);

// Webhook (no JWT — signature verified)
router.post('/razorpay/webhook', monetizationController.razorpayWebhook);

// ── Admin ────────────────────────────────────────────────────────
router.get('/admin/plans', authenticate, requireAdmin, monetizationController.listPlansAdmin);
router.post('/admin/plans', authenticate, requireFinanceOps, monetizationController.createPlan);
router.post('/admin/plans/sort', authenticate, requireFinanceOps, monetizationController.sortPlans);
router.patch('/admin/plans/:id', authenticate, requireFinanceOps, monetizationController.updatePlan);
router.patch('/admin/plans/:id/status', authenticate, requireFinanceOps, monetizationController.setPlanStatus);
router.post('/admin/plans/:id/duplicate', authenticate, requireFinanceOps, monetizationController.duplicatePlan);
router.delete('/admin/plans/:id', authenticate, requireFinanceOps, monetizationController.deletePlan);

router.get('/admin/transactions', authenticate, requireAdmin, monetizationController.listTransactionsAdmin);
router.get('/admin/invoices/:id/pdf', authenticate, requireAdmin, monetizationController.downloadInvoicePdfAdmin);
router.get('/admin/refunds', authenticate, requireAdmin, monetizationController.listRefundsAdmin);
router.get('/admin/revenue', authenticate, requireAdmin, monetizationController.revenueSummary);
router.get('/admin/grant-context', authenticate, requireFinanceOps, monetizationController.adminGrantContext);
router.post('/admin/grant', authenticate, requireFinanceOps, monetizationController.adminGrant);

router.get('/admin/ads', authenticate, requireAdmin, monetizationController.getAdConfigAdmin);
router.patch('/admin/ads', authenticate, requireFinanceOps, monetizationController.updateAdConfig);

router.get('/admin/coupons', authenticate, requireAdmin, monetizationController.listCoupons);
router.post('/admin/coupons', authenticate, requireFinanceOps, monetizationController.createCouponAdmin);
router.delete('/admin/coupons/:id', authenticate, requireFinanceOps, monetizationController.deleteCoupon);

router.patch('/admin/pal-points-partner/config', authenticate, requireFinanceOps, monetizationController.updatePalPointsPartnerConfig);
router.get('/admin/pal-points-partner/config', authenticate, requireAdmin, monetizationController.getPalPointsPartnerConfig);
router.patch('/admin/pal-points-partner/vendors/:vendorId', authenticate, requireFinanceOps, monetizationController.adminEnablePalPointsPartner);
router.get('/admin/subscription-audit', authenticate, requireAdmin, monetizationController.listSubscriptionAuditLogs);

router.get('/admin/documents', authenticate, requireAdmin, monetizationController.listDocumentsAdmin);
router.patch('/admin/documents/:id', authenticate, requireContentOps, monetizationController.reviewDocument);

export default router;
