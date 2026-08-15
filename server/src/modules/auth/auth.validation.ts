import { z } from 'zod';
import { Role } from '@prisma/client';

const emailField = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim() : value),
  z.string().min(1, 'Email is required').email('Invalid email address').transform((value) => value.toLowerCase()),
);

export const registerSchema = z.object({
  email: emailField,
  password: z.string().min(8, 'Password must be at least 8 characters').max(128, 'Password must not exceed 128 characters').regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/, 'Password must contain uppercase, lowercase, number, and special character'),
  name: z.string().min(1, 'Name is required').max(100),
});

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Password is required').max(128, 'Password must not exceed 128 characters'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: emailField,
});

export const resetPasswordSchema = z.object({
  email: emailField,
  token: z.string().min(1, 'Token/Code is required'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128, 'Password must not exceed 128 characters').regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/, 'Password must contain uppercase, lowercase, number, and special character'),
});

export const verifyResetOtpSchema = z.object({
  email: emailField,
  token: z.string().min(8, 'Verification code must be 8 characters').max(8),
});

export const requestLoginOtpSchema = z.object({
  email: emailField,
});

export const loginWithOtpSchema = verifyResetOtpSchema;

export const verifyRegisterEmailSchema = z.object({
  email: emailField,
  token: z.string().min(8, 'Verification code must be 8 characters').max(8),
});

export const resendRegisterOtpSchema = z.object({
  email: emailField,
});

export const updateProfileSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100).optional(),
  bio: z.string().max(500).nullable().optional(),
  interests: z.array(z.string()).optional(),
  avatarStyle: z.number().int().min(0).max(10).optional(),
  avatar: z.string().nullable().optional(),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type VerifyResetOtpInput = z.infer<typeof verifyResetOtpSchema>;
export type RequestLoginOtpInput = z.infer<typeof requestLoginOtpSchema>;
export type LoginWithOtpInput = z.infer<typeof loginWithOtpSchema>;
export type VerifyRegisterEmailInput = z.infer<typeof verifyRegisterEmailSchema>;
export type ResendRegisterOtpInput = z.infer<typeof resendRegisterOtpSchema>;
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters').max(128, 'Password must not exceed 128 characters').regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/, 'Password must contain uppercase, lowercase, number, and special character'),
});

export const deleteAccountSchema = z.object({
  password: z.string().min(1, 'Password is required'),
  confirmDeletion: z.literal(true, {
    errorMap: () => ({ message: 'confirmDeletion must be true' }),
  }),
  reason: z.string().max(500).optional(),
  otp: z.string().min(4).max(12).optional(),
});

export const activeModeSchema = z.object({
  activeMode: z.nativeEnum(Role),
});

export const activeRoleAliasSchema = z.object({
  activeRole: z.nativeEnum(Role),
}).transform(({ activeRole }) => ({ activeMode: activeRole }));

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
export type ActiveModeInput = z.infer<typeof activeModeSchema>;

