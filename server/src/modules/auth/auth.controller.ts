import { Request, Response } from 'express';
import { authService } from './auth.service';
import { catchAsync } from '../../shared/utils/catchAsync';
import { sendSuccess, sendCreated, sendNoContent } from '../../shared/utils/response';
import { env } from '../../config/env';
import { ApiError } from '../../shared/utils/ApiError';

/** Cookie maxAge must match JWT access-token TTL (default 1h). */
function accessTokenCookieMaxAgeMs(): number {
  const raw = String(env.jwt.expiresIn || '1h').trim();
  const match = /^(\d+)([smhd])$/i.exec(raw);
  if (!match) return 60 * 60 * 1000;
  const n = parseInt(match[1]!, 10);
  const unit = match[2]!.toLowerCase();
  const mult =
    unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
  return n * mult;
}

function setAccessTokenCookie(res: Response, accessToken: string) {
  res.cookie('token', accessToken, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: env.isProduction ? 'none' : 'strict',
    maxAge: accessTokenCookieMaxAgeMs(),
    path: '/',
  });
}

function clearAccessTokenCookie(res: Response) {
  res.clearCookie('token', {
    path: '/',
    secure: env.isProduction,
    sameSite: env.isProduction ? 'none' : 'strict',
  });
}

export const authController = {
  register: catchAsync(async (req: Request, res: Response) => {
    const result = await authService.register(req.body);
    sendCreated(res, result, 'Account created. Please verify your email.');
  }),

  verifyRegisterEmail: catchAsync(async (req: Request, res: Response) => {
    const { email, token } = req.body;
    const result = await authService.verifyRegisterEmail(email, token);
    setAccessTokenCookie(res, result.accessToken);
    sendSuccess(res, result, { message: 'Email verified successfully' });
  }),

  resendRegisterOtp: catchAsync(async (req: Request, res: Response) => {
    await authService.resendRegisterOtp(req.body.email);
    sendSuccess(res, null, { message: 'If verification is pending, a new code has been sent.' });
  }),

  login: catchAsync(async (req: Request, res: Response) => {
    const result = await authService.login(req.body);
    setAccessTokenCookie(res, result.accessToken);
    sendSuccess(res, result, { message: 'Login successful' });
  }),

  refresh: catchAsync(async (req: Request, res: Response) => {
    const { refreshToken } = req.body;
    const result = await authService.refresh(refreshToken);
    setAccessTokenCookie(res, result.accessToken);
    sendSuccess(res, result, { message: 'Token refreshed successfully' });
  }),

  logout: catchAsync(async (req: Request, res: Response) => {
    const { refreshToken } = req.body;
    await authService.logout(refreshToken);
    clearAccessTokenCookie(res);
    sendNoContent(res);
  }),

  getProfile: catchAsync(async (req: any, res: Response) => {
    const user = await authService.getProfile(req.user.id);
    sendSuccess(res, user);
  }),

  forgotPassword: catchAsync(async (req: Request, res: Response) => {
    await authService.forgotPassword(req.body.email);
    sendSuccess(res, null, { message: 'If an account with that email exists, a verification code has been sent.' });
  }),

  resetPassword: catchAsync(async (req: Request, res: Response) => {
    const { email, token, password } = req.body;
    const result = await authService.resetPassword(email, token, password);
    sendSuccess(res, result, { message: 'Password reset successful' });
  }),

  verifyResetOtp: catchAsync(async (req: Request, res: Response) => {
    const { email, token } = req.body;
    const result = await authService.verifyResetOtp(email, token);
    sendSuccess(res, { verified: true, resetSessionToken: result.resetSessionToken }, { message: 'Verification code confirmed' });
  }),

  requestLoginOtp: catchAsync(async (req: Request, res: Response) => {
    await authService.requestLoginOtp(req.body.email);
    sendSuccess(res, null, { message: 'If an admin account with that email exists, a sign-in code has been sent.' });
  }),

  loginWithOtp: catchAsync(async (req: Request, res: Response) => {
    const { email, token } = req.body;
    const result = await authService.loginWithOtp(email, token);
    setAccessTokenCookie(res, result.accessToken);
    sendSuccess(res, result, { message: 'Login successful' });
  }),

  updateProfile: catchAsync(async (req: any, res: Response) => {
    const result = await authService.updateProfile(req.user.id, req.body);
    sendSuccess(res, result, { message: 'Profile updated successfully' });
  }),

  changePassword: catchAsync(async (req: any, res: Response) => {
    const { currentPassword, newPassword } = req.body;
    await authService.changePassword(req.user.id, currentPassword, newPassword);
    sendSuccess(res, null, { message: 'Password changed successfully. Other sessions have been signed out.' });
  }),

  getDeletionInfo: catchAsync(async (req: any, res: Response) => {
    const info = await authService.getDeletionInfo(req.user.id);
    sendSuccess(res, info);
  }),

  requestAccountDeletionCode: catchAsync(async (req: any, res: Response) => {
    await authService.requestAccountDeletionCode(req.user.id);
    sendSuccess(res, null, { message: 'A verification code has been sent to your email.' });
  }),

  deleteAccount: catchAsync(async (req: any, res: Response) => {
    const { password, confirmDeletion, otp } = req.body;
    const result = await authService.deleteAccount(req.user.id, password, confirmDeletion, otp);
    clearAccessTokenCookie(res);
    sendSuccess(res, result, { message: 'Account deleted successfully' });
  }),

  setActiveMode: catchAsync(async (req: any, res: Response) => {
    const result = await authService.setActiveMode(req.user.id, req.body.activeMode);
    setAccessTokenCookie(res, result.accessToken);
    sendSuccess(res, result, { message: 'Active mode updated successfully' });
  }),

  setupVendor: catchAsync(async (req: Request, res: Response) => {
    // Seed helper only — never expose credential upsert in production.
    if (env.isProduction) {
      throw new ApiError(404, 'Not found.');
    }
    const email = typeof req.query.email === 'string' ? req.query.email : undefined;
    const result = await authService.setupVendor(email);
    sendSuccess(res, result, { message: 'Vendor account setup successful' });
  }),
};

