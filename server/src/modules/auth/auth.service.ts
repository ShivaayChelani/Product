import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import { Role, RoleAssignmentStatus, VendorStatus } from '@prisma/client';
import {
  getBrevoEmailVerificationTemplateId,
  getBrevoPasswordResetTemplateId,
} from '../../shared/email/smtp.config';
import {
  isBrevoApiConfigured,
  isSmtpConfigured,
  sendTransactionalEmail,
  type SendEmailInput,
} from '../../shared/email/email.service';
import { buildVerificationEmail } from '../../shared/email/email.templates';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { ApiError } from '../../shared/utils/ApiError';
import { RegisterInput, LoginInput } from './auth.validation';
import { eventBus, AppEvents } from '../../config/events';
import { awardDailyReward } from './daily-rewards';
import {
  assertCanActivate,
  enrichUserWithRoles,
  healSpecialtyRolesFromDomain,
  ensureBaseUserRole,
  listApprovedRoles,
} from '../../shared/utils/specialtyRoles';
import { roleTransitionService } from '../../shared/services/roleTransition.service';
import { findUserByEmail, normalizeEmail } from '../../shared/utils/userEmailLookup';
import { ADMIN_ROLES } from '../../middleware/auth';

const ACCESS_TOKEN_EXPIRY = (env.jwt.expiresIn || '1h') as SignOptions['expiresIn'];
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function lookupRefreshToken(plainToken: string) {
  return prisma.refreshToken.findUnique({
    where: { token: hashRefreshToken(plainToken) },
  });
}

async function revokeAllRefreshTokens(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

const EMAIL_UNAVAILABLE_MESSAGE =
  'Password reset email could not be sent. Check SMTP credentials and that SMTP_FROM_EMAIL is a verified sender in Brevo (Render env vars).';

/**
 * Resolve a Brevo template ID for a purpose. When the Brevo HTTPS API is the
 * active transport but the template ID env var is missing, fail loudly with a
 * configuration error instead of silently sending a stale locally generated
 * email (the pre-migration behaviour that made Brevo dashboard edits useless).
 */
function resolveBrevoTemplateId(templateId: number | null, envVar: string): number | null {
  if (!isBrevoApiConfigured()) return null;
  if (!templateId) {
    logger.error({ envVar }, 'Brevo template ID is not configured — refusing to send template-based email');
    throw new ApiError(503, `Email template is not configured. Set ${envVar} in the server environment.`);
  }
  return templateId;
}

function brevoTemplateParams(code: string): Record<string, string> {
  return { code, appUrl: env.clientUrl.replace(/\/+$/, '') };
}

function loginOtpStorageKey(canonicalEmail: string): string {
  return `login-otp:${canonicalEmail}`;
}

function registerOtpStorageKey(canonicalEmail: string): string {
  return `register-otp:${canonicalEmail}`;
}

function generateVerificationCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  let code = '';
  for (let i = 0; i < 8; i++) code += alphabet[bytes[i]! % alphabet.length];
  return code;
}

async function userHasAdminDashboardAccess(userId: string): Promise<boolean> {
  await ensureBaseUserRole(userId);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { permission: true },
  });
  if (!user) return false;
  const adminRoleSet = new Set<Role>(ADMIN_ROLES);
  if (adminRoleSet.has(user.permission)) return true;
  const approved = await listApprovedRoles(userId);
  return approved.some((role) => adminRoleSet.has(role));
}

const loginUserInclude = {
  vendor: {
    select: { id: true, businessName: true, status: true, vendorCode: true },
  },
  _count: {
    select: {
      reviews: true,
    },
  },
  checkIns: {
    select: {
      placeId: true,
    },
  },
  creatorProfile: {
    select: {
      id: true,
      username: true,
      fullName: true,
      bio: true,
      travelCategories: true,
      instagramUrl: true,
      youtubeUrl: true,
      sampleReelUrl: true,
      applicationReason: true,
      status: true,
      rejectionReason: true,
      followerCount: true,
      totalViews: true,
      verified: true,
    },
  },
} as const;

async function createLoginSession(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: loginUserInclude,
  });
  if (!user) {
    throw new ApiError(401, 'Invalid email or password.');
  }

  const { password: _password, ...userWithoutPassword } = user;
  await ensureBaseUserRole(user.id);
  const enriched = await enrichUserWithRoles(userWithoutPassword);
  const accessToken = generateAccessToken(enriched);
  const refreshToken = await createRefreshToken(user.id);

  try {
    await awardDailyReward(user.id);
  } catch (err) {
    logger.error({ err, userId: user.id }, 'Failed to award daily login reward');
  }

  eventBus.emit(AppEvents.USER_LOGIN, { userId: user.id });

  return { user: enriched, accessToken, refreshToken };
}

async function sendVerificationEmailOrThrow(
  input: SendEmailInput,
  context: { email: string; purpose: string },
): Promise<void> {
  const sent = await sendTransactionalEmail(input);
  if (!sent) {
    logger.error(context, 'Verification email send failed — check Render logs for SMTP errors');
    throw new ApiError(503, EMAIL_UNAVAILABLE_MESSAGE);
  }
  logger.info(context, 'Verification code email sent');
}

async function issueRegisterOtpEmail(canonicalEmail: string): Promise<void> {
  if (!isSmtpConfigured()) {
    throw new ApiError(503, 'Email verification is unavailable. SMTP is not configured.');
  }

  const templateId = resolveBrevoTemplateId(
    getBrevoEmailVerificationTemplateId(),
    'BREVO_EMAIL_VERIFICATION_TEMPLATE_ID',
  );

  const code = generateVerificationCode();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  const hashedToken = crypto.createHash('sha256').update(code).digest('hex');
  const storageKey = registerOtpStorageKey(canonicalEmail);

  await prisma.passwordResetToken.upsert({
    where: { email: storageKey },
    update: { token: hashedToken, expiresAt },
    create: { email: storageKey, token: hashedToken, expiresAt },
  });

  const mail = buildVerificationEmail(code, 'register_otp');
  const input: SendEmailInput = {
    to: canonicalEmail,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  };
  if (templateId) {
    input.templateId = templateId;
    input.params = brevoTemplateParams(code);
  }
  await sendVerificationEmailOrThrow(
    input,
    { email: canonicalEmail, purpose: 'register_otp' },
  );
}

export const authService = {
  async register(input: RegisterInput) {
    const email = normalizeEmail(input.email);
    const existing = await findUserByEmail(email);

    // Unverified signup in progress — resume instead of "already exists"
    if (existing) {
      const full = await prisma.user.findUnique({
        where: { id: existing.id },
        select: { id: true, email: true, name: true, emailVerified: true },
      });
      if (full?.emailVerified) {
        throw new ApiError(
          400,
          'Unable to complete registration. If you already have an account, try signing in.',
        );
      }

      const hashedPassword = await bcrypt.hash(input.password, 12);
      const updated =       await prisma.user.update({
        where: { id: existing.id },
        data: {
          password: hashedPassword,
          name: input.name,
          emailVerified: false,
        },
        select: { email: true, name: true },
      });

      if (process.env.NODE_ENV === 'test') {
        await prisma.user.update({ where: { id: existing.id }, data: { emailVerified: true } });
        return createLoginSession(existing.id);
      }

      await issueRegisterOtpEmail(email);

      return {
        requiresEmailVerification: true as const,
        email: updated.email,
        name: updated.name,
      };
    }

    if (process.env.NODE_ENV !== 'test' && !isSmtpConfigured()) {
      throw new ApiError(503, 'Email verification is unavailable. SMTP is not configured.');
    }

    const hashedPassword = await bcrypt.hash(input.password, 12);

    // Create user + base USER role + wallet (email not verified yet — no session tokens)
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          password: hashedPassword,
          name: input.name,
          emailVerified: false,
          permission: Role.USER,
          activeMode: Role.USER,
        },
        select: { id: true, email: true, name: true, permission: true, activeMode: true, createdAt: true, emailVerified: true },
      });
      await ensureBaseUserRole(created.id, tx);
      return created;
    });

    try {
      await prisma.wallet.upsert({
        where: { userId: user.id },
        update: {},
        create: { userId: user.id, palPoints: 0, lifetimeEarned: 0, lifetimeSpent: 0 },
      });
    } catch (err) {
      logger.warn({ err, userId: user.id }, 'Failed to create wallet at registration — will be created lazily');
    }

    if (process.env.NODE_ENV === 'test') {
      await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } });
      return createLoginSession(user.id);
    }

    await issueRegisterOtpEmail(email);

    return {
      requiresEmailVerification: true as const,
      email: user.email,
      name: user.name,
    };
  },

  async verifyRegisterEmail(emailRaw: string, otp: string) {
    const email = normalizeEmail(emailRaw);
    const user = await findUserByEmail(email);
    if (!user) {
      throw new ApiError(400, 'Invalid or expired verification code.');
    }

    const full = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, emailVerified: true },
    });
    if (!full) {
      throw new ApiError(400, 'Invalid or expired verification code.');
    }

    if (full.emailVerified) {
      return createLoginSession(full.id);
    }

    const storageKey = registerOtpStorageKey(email);
    const record = await prisma.passwordResetToken.findUnique({ where: { email: storageKey } });
    const hashedInputToken = crypto.createHash('sha256').update(otp.toUpperCase()).digest('hex');
    if (!record || record.token !== hashedInputToken || record.expiresAt < new Date()) {
      throw new ApiError(400, 'Invalid or expired verification code.');
    }

    await prisma.$transaction([
      prisma.user.update({ where: { id: full.id }, data: { emailVerified: true } }),
      prisma.passwordResetToken.delete({ where: { email: storageKey } }),
    ]);

    return createLoginSession(full.id);
  },

  async resendRegisterOtp(emailRaw: string) {
    const email = normalizeEmail(emailRaw);
    const user = await findUserByEmail(email);
    // Soft-success to avoid email enumeration
    if (!user) {
      return { success: true };
    }

    const full = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, email: true, emailVerified: true },
    });
    if (!full || full.emailVerified) {
      return { success: true };
    }

    await issueRegisterOtpEmail(full.email);

    return { success: true };
  },

  async login(input: LoginInput) {
    const email = normalizeEmail(input.email);

    const matched = await findUserByEmail(email);

    if (!matched) {
      throw new ApiError(401, 'Invalid email or password.');
    }

    const user = await prisma.user.findUnique({
      where: { id: matched.id },
      include: loginUserInclude,
    });

    if (!user?.password) {
      throw new ApiError(401, 'Invalid email or password.');
    }

    const valid = await bcrypt.compare(input.password, user.password);

    if (!valid) {
      throw new ApiError(401, 'Invalid email or password.');
    }

    if (!user.emailVerified) {
      try {
        await issueRegisterOtpEmail(user.email);
      } catch (err) {
        logger.warn({ err, email: user.email }, 'Failed to resend register OTP on unverified login');
      }
      throw new ApiError(
        401,
        'Invalid email or password.',
        true,
        'EMAIL_NOT_VERIFIED',
        { requiresEmailVerification: true },
      );
    }

    return createLoginSession(user.id);
  },

  async requestLoginOtp(email: string) {
    const user = await findUserByEmail(normalizeEmail(email));
    if (!user || !(await userHasAdminDashboardAccess(user.id))) {
      logger.info({ email }, 'Login OTP requested for non-admin or missing account');
      return { success: true };
    }

    const canonicalEmail = user.email;

    if (!isSmtpConfigured()) {
      // Soft-success to avoid revealing whether the admin account exists.
      logger.error({ email: canonicalEmail }, 'Login OTP requested but SMTP is not configured');
      return { success: true };
    }

    const code = generateVerificationCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const hashedToken = crypto.createHash('sha256').update(code).digest('hex');
    const storageKey = loginOtpStorageKey(canonicalEmail);

    await prisma.passwordResetToken.upsert({
      where: { email: storageKey },
      update: { token: hashedToken, expiresAt },
      create: { email: storageKey, token: hashedToken, expiresAt },
    });

    const mail = buildVerificationEmail(code, 'login_otp');
    const sent = await sendTransactionalEmail({
      to: canonicalEmail,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
    if (!sent) {
      // Soft-success: do not leak account existence via 503.
      logger.error({ email: canonicalEmail, purpose: 'login_otp' }, 'Login OTP email send failed');
      return { success: true };
    }
    logger.info({ email: canonicalEmail, purpose: 'login_otp' }, 'Verification code email sent');

    return { success: true };
  },

  async loginWithOtp(email: string, otp: string) {
    const normalizedEmail = normalizeEmail(email);
    const user = await findUserByEmail(normalizedEmail);
    const storageKey = loginOtpStorageKey(user?.email ?? normalizedEmail);
    const record = await prisma.passwordResetToken.findUnique({ where: { email: storageKey } });
    const hashedInputToken = crypto.createHash('sha256').update(otp.toUpperCase()).digest('hex');
    if (!record || record.token !== hashedInputToken || record.expiresAt < new Date()) {
      throw new ApiError(401, 'Invalid or expired verification code.');
    }
    if (!user || !(await userHasAdminDashboardAccess(user.id))) {
      throw new ApiError(401, 'Invalid or expired verification code.');
    }

    await prisma.passwordResetToken.delete({ where: { email: storageKey } }).catch(() => {});

    return createLoginSession(user.id);
  },

  async refresh(refreshTokenStr: string) {
    const stored = await lookupRefreshToken(refreshTokenStr);

    if (!stored || stored.expiresAt < new Date()) {
      throw new ApiError(401, 'Invalid or expired refresh token.');
    }

    // Reuse of an already-rotated refresh token → revoke the whole session family.
    if (stored.revokedAt) {
      await revokeAllRefreshTokens(stored.userId);
      throw new ApiError(401, 'Invalid or expired refresh token.');
    }

    // Rotate: revoke current atomically (conditional update prevents race)
    const revoked = await prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (revoked.count === 0) {
      await revokeAllRefreshTokens(stored.userId);
      throw new ApiError(401, 'Refresh token already used.');
    }

    const user = await prisma.user.findUnique({
      where: { id: stored.userId },
      select: { id: true, email: true, name: true, permission: true, activeMode: true },
    });
    if (!user) {
      throw new ApiError(401, 'User not found.');
    }

    await ensureBaseUserRole(user.id);
    await healSpecialtyRolesFromDomain(user.id);
    // Re-read permission/activeMode after possible heal
    const fresh = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, email: true, name: true, permission: true, activeMode: true },
    });
    if (!fresh) {
      throw new ApiError(401, 'User not found.');
    }
    const enriched = await enrichUserWithRoles(fresh);
    const accessToken = generateAccessToken(enriched);
    const refreshToken = await createRefreshToken(user.id);

    return { accessToken, refreshToken };
  },

  async logout(refreshTokenStr: string) {
    const stored = await lookupRefreshToken(refreshTokenStr);

    if (stored && !stored.revokedAt) {
      await prisma.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      });
    }
  },

  async getProfile(userId: string) {
    await ensureBaseUserRole(userId);
    // Promote UserRole when Vendor/Creator domain is already APPROVED (admin UI vs JWT desync).
    await healSpecialtyRolesFromDomain(userId);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        permission: true,
        activeMode: true,
        bio: true,
        interests: true,
        avatarStyle: true,
        avatar: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            reviews: true,
          },
        },
        checkIns: {
          select: {
            placeId: true,
          },
        },
        creatorProfile: {
          select: {
            id: true,
            username: true,
            fullName: true,
            bio: true,
            travelCategories: true,
            instagramUrl: true,
            youtubeUrl: true,
            sampleReelUrl: true,
            applicationReason: true,
            status: true,
            rejectionReason: true,
            followerCount: true,
            totalViews: true,
            verified: true,
          },
        },
        vendor: {
          select: { id: true, businessName: true, status: true, vendorCode: true },
        },
      },
    });
    if (!user) {
      throw new ApiError(404, 'User not found.');
    }
    return enrichUserWithRoles(user);
  },

  async forgotPassword(
    email: string,
    purpose: 'password_reset' | 'account_deletion' = 'password_reset',
  ) {
    // Resolved before the user lookup so a missing template config yields the
    // same 503 for existing and non-existing addresses (no enumeration signal).
    const templateId =
      purpose === 'password_reset'
        ? resolveBrevoTemplateId(
            getBrevoPasswordResetTemplateId(),
            'BREVO_PASSWORD_RESET_TEMPLATE_ID',
          )
        : null;

    const user = await findUserByEmail(email);
    if (!user) {
      logger.info({ email, purpose }, 'Verification code requested for non-existent email');
      return { success: true };
    }

    const canonicalEmail = user.email;

    if (!isSmtpConfigured()) {
      logger.error({ email: canonicalEmail, purpose }, 'Verification code requested but SMTP is not configured');
      // Authenticated deletion flow needs an actionable error; public reset must not enumerate.
      if (purpose === 'account_deletion') {
        throw new ApiError(503, EMAIL_UNAVAILABLE_MESSAGE);
      }
      return { success: true };
    }

    // ~48 bits of entropy, typeable 8-char code (Crockford alphabet, no ambiguous chars)
    const code = generateVerificationCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const hashedToken = crypto.createHash('sha256').update(code).digest('hex');

    await prisma.passwordResetToken.upsert({
      where: { email: canonicalEmail },
      update: { token: hashedToken, expiresAt },
      create: { email: canonicalEmail, token: hashedToken, expiresAt },
    });

    const mail = buildVerificationEmail(code, purpose);
    const input: SendEmailInput = {
      to: canonicalEmail,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    };
    if (templateId) {
      input.templateId = templateId;
      input.params = brevoTemplateParams(code);
    }
    if (purpose === 'account_deletion') {
      await sendVerificationEmailOrThrow(
        input,
        { email: canonicalEmail, purpose },
      );
    } else {
      const sent = await sendTransactionalEmail(input);
      if (!sent) {
        logger.error({ email: canonicalEmail, purpose }, 'Verification email send failed — check Render logs for SMTP errors');
        // Soft-success for public forgot-password (anti-enumeration).
        return { success: true };
      }
      logger.info({ email: canonicalEmail, purpose }, 'Verification code email sent');
    }

    return { success: true };
  },

  async resetPassword(email: string, token: string, passwordStr: string) {
    const user = await findUserByEmail(email);
    if (!user) throw new ApiError(400, 'Invalid or expired verification code.');

    const canonicalEmail = user.email;
    const hashedInputToken = crypto.createHash('sha256').update(token.trim()).digest('hex');

    const deleted = await prisma.passwordResetToken.deleteMany({
      where: {
        email: canonicalEmail,
        token: hashedInputToken,
        expiresAt: { gt: new Date() },
      },
    });

    if (deleted.count === 0) {
      throw new ApiError(400, 'Invalid or expired verification code.');
    }

    const hashedPassword = await bcrypt.hash(passwordStr, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    await revokeAllRefreshTokens(user.id);

    return { success: true };
  },

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { password: true } });
    if (!user) throw new ApiError(404, 'User not found.');

    const valid = user.password ? await bcrypt.compare(currentPassword, user.password) : false;
    if (!valid) throw new ApiError(400, 'Current password is incorrect.');

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: userId }, data: { password: hashedPassword } });

    await revokeAllRefreshTokens(userId);

    return { success: true };
  },

  async getDeletionInfo(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        permission: true,
        wallet: { select: { palPoints: true } },
        vendor: { select: { id: true, status: true, businessName: true } },
        creatorProfile: { select: { id: true, status: true, username: true } },
        _count: {
          select: {
            redemptions: { where: { status: 'PENDING' } },
          },
        },
      },
    });
    if (!user) throw new ApiError(404, 'User not found.');

    const isAdmin = await userHasAdminDashboardAccess(userId);

    return {
      palPoints: user.wallet?.palPoints ?? 0,
      pendingRedemptions: user._count.redemptions,
      vendor: user.vendor
        ? { id: user.vendor.id, status: user.vendor.status, businessName: user.vendor.businessName }
        : null,
      creator: user.creatorProfile
        ? {
            id: user.creatorProfile.id,
            status: user.creatorProfile.status,
            username: user.creatorProfile.username,
          }
        : null,
      canSelfDelete: !isAdmin,
    };
  },

  async requestAccountDeletionCode(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user) throw new ApiError(404, 'User not found.');
    if (await userHasAdminDashboardAccess(userId)) {
      throw new ApiError(403, 'Admin accounts cannot be deleted from the app.');
    }
    return this.forgotPassword(user.email, 'account_deletion');
  },

  async verifyResetOtp(email: string, otp: string) {
    const user = await findUserByEmail(email);
    if (!user) throw new ApiError(400, 'Invalid or expired verification code.');

    const record = await prisma.passwordResetToken.findUnique({ where: { email: user.email } });
    const hashedInputToken = crypto.createHash('sha256').update(otp.toUpperCase()).digest('hex');
    if (!record || record.token !== hashedInputToken || record.expiresAt < new Date()) {
      throw new ApiError(400, 'Invalid or expired verification code.');
    }

    // Consume OTP immediately — reset step must use the issued reset session token.
    const resetSessionToken = crypto.randomUUID();
    const resetSessionHash = crypto.createHash('sha256').update(resetSessionToken).digest('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await prisma.passwordResetToken.update({
      where: { email: user.email },
      data: { token: resetSessionHash, expiresAt },
    });

    return { valid: true, resetSessionToken };
  },

  async verifyDeletionOtp(email: string, otp: string) {
    return this.verifyResetOtp(email, otp);
  },

  async deleteAccount(userId: string, password: string, confirmDeletion: boolean, otp?: string) {
    if (!confirmDeletion) {
      throw new ApiError(400, 'Account deletion must be explicitly confirmed.');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        password: true,
        permission: true,
        wallet: { select: { palPoints: true } },
        vendor: { select: { id: true } },
        creatorProfile: { select: { id: true } },
        _count: { select: { redemptions: { where: { status: 'PENDING' } } } },
      },
    });
    if (!user) throw new ApiError(404, 'User not found.');
    if (await userHasAdminDashboardAccess(userId)) {
      throw new ApiError(403, 'Admin accounts cannot be deleted from the app.');
    }

    const valid = user.password ? await bcrypt.compare(password, user.password) : false;
    if (!valid) throw new ApiError(400, 'Password is incorrect.');

    if (otp) {
      await this.verifyDeletionOtp(user.email, otp);
      await prisma.passwordResetToken.delete({ where: { email: user.email } }).catch(() => {});
    }

    const forfeitedPalPoints = user.wallet?.palPoints ?? 0;
    const cancelledPendingRedemptions = user._count.redemptions;

    // Permanent delete — schema has no soft-delete column; related rows cascade or null per Prisma.
    await prisma.$transaction(async (tx) => {
      await tx.redemption.updateMany({
        where: { userId, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.user.delete({ where: { id: userId } });
    }, { maxWait: 10_000, timeout: 20_000 });

    return {
      deleted: true,
      forfeitedPalPoints,
      cancelledPendingRedemptions,
      vendorRemoved: !!user.vendor,
      creatorRemoved: !!user.creatorProfile,
    };
  },

  async updateProfile(userId: string, data: any) {
    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.bio !== undefined) updateData.bio = data.bio;
    if (data.interests !== undefined) updateData.interests = data.interests;
    if (data.avatarStyle !== undefined) updateData.avatarStyle = data.avatarStyle;
    if (data.avatar !== undefined) updateData.avatar = data.avatar;

    const updated = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        permission: true,
        activeMode: true,
        bio: true,
        interests: true,
        avatarStyle: true,
        avatar: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            reviews: true,
          },
        },
        checkIns: {
          select: {
            placeId: true,
          },
        },
        creatorProfile: {
          select: {
            id: true,
            username: true,
            fullName: true,
            bio: true,
            travelCategories: true,
            instagramUrl: true,
            youtubeUrl: true,
            sampleReelUrl: true,
            applicationReason: true,
            status: true,
            rejectionReason: true,
            followerCount: true,
            totalViews: true,
            verified: true,
          },
        },
        vendor: {
          select: { id: true, businessName: true, status: true, vendorCode: true },
        },
      },
    });

    return enrichUserWithRoles(updated);
  },

  async setActiveMode(userId: string, activeMode: Role) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        permission: true,
        activeMode: true,
      },
    });
    if (!user) throw new ApiError(404, 'User not found.');

    await ensureBaseUserRole(userId);
    await assertCanActivate(userId, activeMode);

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { activeMode },
      select: {
        id: true,
        email: true,
        name: true,
        permission: true,
        activeMode: true,
        creatorProfile: {
          select: {
            id: true,
            username: true,
            fullName: true,
            bio: true,
            travelCategories: true,
            instagramUrl: true,
            youtubeUrl: true,
            sampleReelUrl: true,
            applicationReason: true,
            rejectionReason: true,
            status: true,
            followerCount: true,
            totalViews: true,
            verified: true,
          },
        },
        vendor: {
          select: { id: true, businessName: true, status: true, vendorCode: true },
        },
      },
    });
    const enriched = await enrichUserWithRoles(updated);
    return {
      user: enriched,
      accessToken: generateAccessToken(enriched),
    };
  },

  async setupVendor(emailOverride?: string) {
    const email = emailOverride || process.env.SEED_VENDOR_EMAIL || 'streetstory@palsafar.com';
    const password = process.env.SEED_VENDOR_PASSWORD || 'Vendor@123';
    const name = 'Madan Mahal Heritage Cafe';

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.upsert({
      where: { email },
      update: {
        name,
        permission: Role.VENDOR,
        activeMode: Role.VENDOR,
        ...(process.env.NODE_ENV !== 'production' ? { password: hashedPassword } : {}),
      },
      create: {
        email,
        name,
        permission: Role.VENDOR,
        activeMode: Role.VENDOR,
        password: hashedPassword,
      },
    });

    let vendor = await prisma.vendor.findUnique({ where: { userId: user.id } });
    if (!vendor) {
      const admin = await prisma.user.findFirst({ where: { permission: Role.ADMIN } });
      vendor = await prisma.vendor.create({
        data: {
          userId: user.id,
          businessName: name,
          businessType: 'restaurant',
          phone: '+91 98765 43200',
          address: 'Street No. 1, Near Center, Jabalpur',
          city: 'Jabalpur',
          state: 'Madhya Pradesh',
          latitude: 23.161,
          longitude: 79.902,
          description: 'A cozy cafe near the historic Madan Mahal Fort serving delicious snacks.',
          imageUrl: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=480',
          operatingHours: '09:00 AM - 10:00 PM',
          status: VendorStatus.APPROVED,
          reviewedById: admin?.id ?? null,
          reviewedAt: new Date(),
          showOnMap: true,
          showContact: true,
          showWebsite: true,
          showImages: true,
          showOffers: true,
          showReels: true,
          showNavigation: true,
        },
      });
    }

    await roleTransitionService.applyVerificationOutcome({
      userId: user.id,
      role: Role.VENDOR,
      status: RoleAssignmentStatus.APPROVED,
    });

    const refreshed = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { id: true, email: true, name: true, permission: true, activeMode: true },
    });

    return {
      ...(await enrichUserWithRoles(refreshed)),
      vendorId: vendor.id,
      vendorStatus: vendor.status,
    };
  },
};

export function generateAccessToken(user: {
  id: string;
  email: string;
  permission: Role;
  activeMode: Role;
  name: string;
  roles?: Role[];
  approvedRoles?: Role[];
}): string {
  const roles = user.approvedRoles ?? user.roles ?? (
    user.permission === Role.ADMIN
      ? [Role.ADMIN]
      : user.permission === Role.USER
        ? [Role.USER]
        : [Role.USER, user.permission]
  );

  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      permission: user.permission,
      activeMode: user.activeMode,
      roles,
      role: user.permission,
      activeRole: user.activeMode,
      name: user.name,
      jti: crypto.randomUUID(),
    },
    env.jwt.secret,
    { expiresIn: ACCESS_TOKEN_EXPIRY, algorithm: 'HS256' },
  );
}

async function createRefreshToken(userId: string): Promise<string> {
  const token = crypto.randomUUID();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

  await prisma.refreshToken.create({
    data: { token: hashRefreshToken(token), userId, expiresAt },
  });

  return token;
}


