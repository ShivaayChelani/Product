import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { ApiError } from '../../shared/utils/ApiError';
import {
  DEFAULT_APPEARANCE,
  DEFAULT_NOTIFICATIONS,
  DEFAULT_PRIVACY,
  DEFAULT_SECURITY,
  normalizeUserAppSettings,
  type UserAppSettingsPayload,
} from './user-app.types';

async function ensurePreferences(userId: string) {
  return prisma.userAppPreference.upsert({
    where: { userId },
    create: {
      userId,
      privacy: DEFAULT_PRIVACY,
      notifications: DEFAULT_NOTIFICATIONS,
      security: DEFAULT_SECURITY,
      appearance: DEFAULT_APPEARANCE,
      language: 'auto',
    },
    update: {},
  });
}

export const userAppService = {
  async getSettings(userId: string): Promise<UserAppSettingsPayload> {
    const row = await ensurePreferences(userId);
    return normalizeUserAppSettings(row);
  },

  async patchSettings(userId: string, patch: Partial<UserAppSettingsPayload>): Promise<UserAppSettingsPayload> {
    const current = await ensurePreferences(userId);
    const data: {
      privacy?: object;
      notifications?: object;
      security?: object;
      appearance?: object;
      language?: string;
    } = {};

    if (patch.privacy) {
      data.privacy = { ...mergeJson(DEFAULT_PRIVACY, current.privacy), ...patch.privacy };
    }
    if (patch.notifications) {
      data.notifications = { ...mergeJson(DEFAULT_NOTIFICATIONS, current.notifications), ...patch.notifications };
    }
    if (patch.security) {
      data.security = { ...mergeJson(DEFAULT_SECURITY, current.security), ...patch.security };
    }
    if (patch.appearance) {
      data.appearance = { ...mergeJson(DEFAULT_APPEARANCE, current.appearance), ...patch.appearance };
    }
    if (patch.language) {
      data.language = patch.language;
    }

    const updated = await prisma.userAppPreference.update({
      where: { userId },
      data,
    });
    return normalizeUserAppSettings(updated);
  },

  async listBlocks(userId: string) {
    const rows = await prisma.userBlock.findMany({
      where: { blockerId: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        blocked: {
          select: { id: true, name: true, email: true, avatar: true, verificationStatus: true },
        },
      },
    });
    return rows.map(r => ({
      id: r.id,
      blockedUser: r.blocked,
      createdAt: r.createdAt.toISOString(),
    }));
  },

  async blockUser(blockerId: string, blockedId: string) {
    if (blockerId === blockedId) throw new ApiError(400, 'You cannot block yourself.');
    const target = await prisma.user.findUnique({ where: { id: blockedId }, select: { id: true } });
    if (!target) throw new ApiError(404, 'User not found.');
    try {
      await prisma.userBlock.create({ data: { blockerId, blockedId } });
    } catch {
      throw new ApiError(409, 'User is already blocked.');
    }
    return { blocked: true };
  },

  async unblockUser(blockerId: string, blockId: string) {
    const row = await prisma.userBlock.findFirst({ where: { id: blockId, blockerId } });
    if (!row) throw new ApiError(404, 'Block not found.');
    await prisma.userBlock.delete({ where: { id: blockId } });
    return { unblocked: true };
  },

  async exportPersonalData(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        bio: true,
        interests: true,
        avatar: true,
        verificationStatus: true,
        createdAt: true,
        updatedAt: true,
        checkIns: { select: { placeId: true, createdAt: true } },
        reviews: { select: { placeId: true, rating: true, content: true, createdAt: true } },
        tripPlans: { select: { id: true, title: true, status: true, createdAt: true } },
        wallet: { select: { palPoints: true, lifetimeEarned: true, lifetimeSpent: true } },
        userAppPreference: true,
      },
    });
    if (!user) throw new ApiError(404, 'User not found.');
    return {
      exportedAt: new Date().toISOString(),
      profile: user,
    };
  },

  async deletePersonalData(userId: string) {
    await prisma.$transaction(async tx => {
      await tx.review.deleteMany({ where: { userId } });
      await tx.checkIn.deleteMany({ where: { userId } });
      await tx.userBlock.deleteMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] } });
      await tx.userAppPreference.upsert({
        where: { userId },
        create: {
          userId,
          privacy: DEFAULT_PRIVACY,
          notifications: DEFAULT_NOTIFICATIONS,
          security: DEFAULT_SECURITY,
          appearance: DEFAULT_APPEARANCE,
          language: 'auto',
        },
        update: {
          privacy: DEFAULT_PRIVACY,
          notifications: DEFAULT_NOTIFICATIONS,
          security: DEFAULT_SECURITY,
          appearance: DEFAULT_APPEARANCE,
          language: 'auto',
        },
      });
    });
    return { cleared: true };
  },

  async listSessions(userId: string) {
    const tokens = await prisma.refreshToken.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true, expiresAt: true },
    });
    return tokens.map(t => ({
      id: t.id,
      createdAt: t.createdAt.toISOString(),
      expiresAt: t.expiresAt.toISOString(),
    }));
  },

  async revokeSession(userId: string, sessionId: string) {
    const token = await prisma.refreshToken.findFirst({
      where: { id: sessionId, userId, revokedAt: null },
    });
    if (!token) throw new ApiError(404, 'Session not found.');
    await prisma.refreshToken.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
    return { revoked: true };
  },

  async revokeOtherSessions(userId: string, currentRefreshToken?: string | null) {
    let keepId: string | null = null;
    if (currentRefreshToken) {
      const current = await prisma.refreshToken.findUnique({
        where: { token: currentRefreshToken },
        select: { id: true, userId: true, revokedAt: true },
      });
      if (current && current.userId === userId && !current.revokedAt) keepId = current.id;
    }
    await prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(keepId ? { id: { not: keepId } } : {}),
      },
      data: { revokedAt: new Date() },
    });
    return { revokedOthers: true };
  },

  async submitFeedback(userId: string | null, category: string, message: string, metadata?: Record<string, unknown>) {
    const row = await prisma.appFeedback.create({
      data: {
        userId: userId ?? undefined,
        category,
        message,
        metadata: metadata != null ? (metadata as Prisma.InputJsonValue) : undefined,
      },
    });
    return { id: row.id, createdAt: row.createdAt.toISOString() };
  },
};

function mergeJson<T extends Record<string, unknown>>(defaults: T, raw: unknown): T {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...defaults };
  return { ...defaults, ...(raw as Partial<T>) };
}
