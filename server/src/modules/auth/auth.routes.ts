import { Router } from 'express';
import { authController } from './auth.controller';
import { validate } from '../../middleware/validate';
import { authenticate, requireAdmin } from '../../middleware/auth';
import { registerSchema, loginSchema, refreshSchema, logoutSchema, forgotPasswordSchema, resetPasswordSchema, verifyResetOtpSchema, requestLoginOtpSchema, loginWithOtpSchema, verifyRegisterEmailSchema, resendRegisterOtpSchema, updateProfileSchema, changePasswordSchema, deleteAccountSchema, activeModeSchema, activeRoleAliasSchema } from './auth.validation';
import { loginLimiter, registerLimiter, refreshLimiter, forgotPasswordLimiter, resetPasswordLimiter, otpVerifyLimiter } from '../../config/rateLimit';

const router = Router();

router.post('/register', registerLimiter, validate(registerSchema), authController.register);
router.post('/register/verify-email', otpVerifyLimiter, validate(verifyRegisterEmailSchema), authController.verifyRegisterEmail);
router.post('/register/resend-otp', forgotPasswordLimiter, validate(resendRegisterOtpSchema), authController.resendRegisterOtp);
router.post('/login', loginLimiter, validate(loginSchema), authController.login);
router.post('/refresh', refreshLimiter, validate(refreshSchema, 'body'), authController.refresh);
router.post('/logout', validate(logoutSchema, 'body'), authController.logout);
router.get('/me', authenticate, authController.getProfile);
router.post('/forgot-password', forgotPasswordLimiter, validate(forgotPasswordSchema), authController.forgotPassword);
router.post('/login-otp/request', forgotPasswordLimiter, validate(requestLoginOtpSchema), authController.requestLoginOtp);
router.post('/login-otp/verify', loginLimiter, validate(loginWithOtpSchema), authController.loginWithOtp);
router.post('/verify-reset-otp', otpVerifyLimiter, validate(verifyResetOtpSchema), authController.verifyResetOtp);
router.post('/reset-password', resetPasswordLimiter, validate(resetPasswordSchema), authController.resetPassword);
router.patch('/profile', authenticate, validate(updateProfileSchema), authController.updateProfile);
router.patch('/password', authenticate, validate(changePasswordSchema), authController.changePassword);
router.get('/account/deletion-info', authenticate, authController.getDeletionInfo);
router.post('/account/deletion-code', authenticate, forgotPasswordLimiter, authController.requestAccountDeletionCode);
router.delete('/account', authenticate, validate(deleteAccountSchema), authController.deleteAccount);
router.patch('/active-mode', authenticate, validate(activeModeSchema), authController.setActiveMode);
router.patch('/active-role', authenticate, validate(activeRoleAliasSchema), authController.setActiveMode);
router.get('/setup-vendor', authenticate, requireAdmin, authController.setupVendor);

export default router;
