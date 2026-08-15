import { type MulticastMessage } from 'firebase-admin/messaging';
import { Role, RoleAssignmentStatus } from '@prisma/client';
import { prisma } from '../../config/database';
import { logger } from '../../config/logger';
import { getMessagingInstance, isFirebaseReady } from '../../config/firebase';
import { ApiError } from '../../shared/utils/ApiError';
import { ADMIN_ROLES } from '../../middleware/auth';
import {
  DEFAULT_NOTIFICATIONS,
  type UserNotificationSettings,
} from '../user-app/user-app.types';
import { notificationCategoryWhere, notificationSearchWhere } from './notificationCategoryFilter';

const PERMANENT_FCM_ERRORS = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
  'messaging/invalid-argument',
]);

const FCM_MULTICAST_LIMIT = 500;
const BROADCAST_USER_BATCH = 500;

/** Never copy these into FCM / stored push data (lock-screen / shade exposure). */
const SENSITIVE_DATA_KEYS = new Set([
  'vendorCode',
  'newVendorCode',
  'password',
  'otp',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
]);

function resolveAndroidChannel(type?: string): string {
  const t = String(type || 'system').toLowerCase();
  if (/reward|points|redeem/.test(t)) return 'rewards';
  if (/vendor|redemption|scanner/.test(t)) return 'vendor';
  if (/creator|reel|collab/.test(t)) return 'creator';
  if (/trip|itinerary|planner/.test(t)) return 'trips';
  if (/offer/.test(t)) return 'offers';
  if (/marketing|promo|announce/.test(t)) return 'marketing';
  if (/system|admin|account|legal/.test(t)) return 'system';
  return 'default';
}

function enrichPushData(
  type: string,
  data?: Record<string, unknown>,
  notificationId?: string,
): Record<string, string> {
  const base = data ? { ...data } : {};
  const t = type || String(base.type || 'system');
  const entityId = base.entityId || base.placeId || base.tripId || base.reelId || base.vendorId || base.offerId;

  const screenMap: Record<string, string> = {
    hidden_gem_approved: 'SpotDetail',
    hidden_gem_rejected: 'MyContributions',
    hidden_gem_merged: 'SpotDetail',
    riddle_approved: 'RiddleHunt',
    riddle_rejected: 'RiddleHunt',
    points_earned: 'Wallet',
    points_spent: 'Wallet',
    offer_approved: 'VendorOffers',
    offer_rejected: 'VendorOffers',
    offer_disabled: 'VendorOffers',
    redemption_created: 'VendorCustomers',
    redemption_refunded: 'Wallet',
    vendor_code_reset: 'VendorSettings',
    fraud_alert: 'Notifications',
    redemption_verified: 'Rewards',
    reel_comment: 'ReelDetail',
    collab_request_new: 'CollaborationDetail',
    collab_request_sent: 'CollaborationDetail',
    collab_accepted: 'CollaborationDetail',
    collab_rejected: 'CollaborationDetail',
    collab_cancelled: 'CollaborationDetail',
    collab_expired: 'CollaborationDetail',
    collab_reel_uploaded: 'CollaborationReview',
    collab_reel_approved: 'CollaborationDetail',
    collab_reel_published: 'ReelDetail',
    vendor_tagged_reel: 'VendorTabs',
    vendor_tagged_reel_allowed: 'ReelDetail',
    vendor_tagged_reel_rejected: 'ReelDetail',
    collab_revision_requested: 'CollaborationDetail',
    collab_reel_rejected: 'CollaborationDetail',
    collab_completed: 'CollaborationDetail',
    collab_suspended: 'CollaborationDetail',
  };

  const screen = base.screen || screenMap[t] || 'Notifications';
  const payload: Record<string, string> = {
    type: String(t),
    screen: String(screen),
  };
  if (entityId) payload.entityId = String(entityId);
  if (notificationId) payload.notificationId = notificationId;
  if (base.params) payload.params = typeof base.params === 'string' ? base.params : JSON.stringify(base.params);

  for (const [k, v] of Object.entries(base)) {
    if (v == null || k in payload) continue;
    if (SENSITIVE_DATA_KEYS.has(k)) continue;
    payload[k] = String(v);
  }
  return payload;
}

function sanitizeNotificationData(data?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!data) return undefined;
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (SENSITIVE_DATA_KEYS.has(k)) continue;
    clean[k] = v;
  }
  return clean;
}

function mergeNotificationPrefs(raw: unknown): UserNotificationSettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_NOTIFICATIONS };
  return { ...DEFAULT_NOTIFICATIONS, ...(raw as Partial<UserNotificationSettings>) };
}

/** Transactional alerts always store in-app; category prefs primarily gate push. */
function isTransactionalType(type: string): boolean {
  const t = type.toLowerCase();
  return (
    t.startsWith('redemption_') ||
    t.startsWith('collab_') ||
    t.startsWith('hidden_gem_') ||
    t.startsWith('vendor_tagged_reel') ||
    t === 'fraud_alert' ||
    t === 'vendor_code_reset' ||
    t === 'points_spent'
  );
}

function shouldCreateInApp(prefs: UserNotificationSettings, type: string): boolean {
  if (isTransactionalType(type)) return true;
  const t = type.toLowerCase();
  if (/offer|coupon|deal|vendor_offer/.test(t)) return prefs.offerAlerts !== false;
  if (/points|reward|redeem|refund|wallet|campaign/.test(t)) return prefs.rewardNotifications !== false;
  if (/trip|itinerary|planner|travel/.test(t)) return prefs.travelAlerts !== false;
  if (/system|admin|welcome|announce|security|password|login/.test(t)) return prefs.systemNotifications !== false;
  return true;
}

function shouldSendPush(prefs: UserNotificationSettings, type: string): boolean {
  if (prefs.pushEnabled === false) return false;
  if (isTransactionalType(type)) return true;
  const t = type.toLowerCase();
  if (/offer|coupon|deal|vendor_offer/.test(t)) return prefs.offerAlerts !== false;
  if (/points|reward|redeem|refund|wallet|campaign/.test(t)) return prefs.rewardNotifications !== false;
  if (/trip|itinerary|planner|travel/.test(t)) return prefs.travelAlerts !== false;
  if (/system|admin|welcome|announce|security|password|login/.test(t)) return prefs.systemNotifications !== false;
  return true;
}

async function getPrefsForUser(userId: string): Promise<UserNotificationSettings> {
  const row = await prisma.userAppPreference.findUnique({
    where: { userId },
    select: { notifications: true },
  });
  return mergeNotificationPrefs(row?.notifications);
}

async function getPrefsMap(userIds: string[]): Promise<Map<string, UserNotificationSettings>> {
  const map = new Map<string, UserNotificationSettings>();
  for (const id of userIds) map.set(id, { ...DEFAULT_NOTIFICATIONS });
  if (userIds.length === 0) return map;
  const rows = await prisma.userAppPreference.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, notifications: true },
  });
  for (const row of rows) {
    map.set(row.userId, mergeNotificationPrefs(row.notifications));
  }
  return map;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export const notificationService = {
  async registerDeviceToken(userId: string, token: string, platform: string = 'unknown') {
    const existing = await prisma.deviceToken.findUnique({ where: { token } });
    if (existing) {
      if (existing.userId !== userId || existing.platform !== platform) {
        await prisma.deviceToken.update({
          where: { token },
          data: { userId, platform },
        });
      } else {
        await prisma.deviceToken.update({
          where: { token },
          data: { platform },
        });
      }
      return existing;
    }

    return prisma.deviceToken.create({
      data: { userId, token, platform },
    });
  },

  async unregisterDeviceToken(userId: string, token: string) {
    const existing = await prisma.deviceToken.findUnique({ where: { token } });
    if (!existing) return null;
    if (existing.userId !== userId) {
      throw new ApiError(403, 'Token does not belong to this user');
    }
    return prisma.deviceToken.delete({ where: { token } });
  },

  async unregisterAllUserTokens(userId: string) {
    return prisma.deviceToken.deleteMany({ where: { userId } });
  },

  async sendToUser(userId: string, title: string, body?: string, data?: Record<string, unknown>, type: string = 'system') {
    const prefs = await getPrefsForUser(userId);
    const safeData = sanitizeNotificationData(data);

    if (!shouldCreateInApp(prefs, type)) {
      logger.debug({ userId, type }, 'Skipped in-app notification due to user preferences');
      return null;
    }

    const tokens = await prisma.deviceToken.findMany({
      where: { userId },
      select: { token: true, platform: true },
    });

    if (tokens.length === 0) {
      logger.debug({ userId, title }, 'No device tokens found for user');
    }

    const notification = await prisma.inAppNotification.create({
      data: {
        userId,
        type,
        title,
        body: body || null,
        data: safeData ? JSON.parse(JSON.stringify(safeData)) : undefined,
      },
    });

    if (tokens.length > 0 && shouldSendPush(prefs, type)) {
      const unreadCount = await prisma.inAppNotification.count({
        where: { userId, read: false },
      });
      this.sendPushToTokens(
        tokens.map((t) => t.token),
        title,
        body,
        { ...(safeData || {}), type },
        type,
        unreadCount,
        notification.id,
      ).catch((err) => {
        logger.error({ err, userId }, 'Failed to send push notification');
      });
    }

    return notification;
  },

  async sendToMultipleUsers(userIds: string[], title: string, body?: string, data?: Record<string, unknown>, type: string = 'system') {
    const uniqueIds = [...new Set(userIds.filter(Boolean))];
    if (uniqueIds.length === 0) return;

    const prefsMap = await getPrefsMap(uniqueIds);
    const recipients = uniqueIds.filter((id) => shouldCreateInApp(prefsMap.get(id) || DEFAULT_NOTIFICATIONS, type));
    if (recipients.length === 0) return;

    const safeData = sanitizeNotificationData(data);

    for (const batch of chunkArray(recipients, BROADCAST_USER_BATCH)) {
      await prisma.inAppNotification.createMany({
        data: batch.map((userId) => ({
          userId,
          type,
          title,
          body: body || null,
          data: (safeData || undefined) as any,
        })),
      });
    }

    const pushRecipients = recipients.filter((id) =>
      shouldSendPush(prefsMap.get(id) || DEFAULT_NOTIFICATIONS, type),
    );
    if (pushRecipients.length === 0) return;

    const tokens = await prisma.deviceToken.findMany({
      where: { userId: { in: pushRecipients } },
      select: { token: true },
    });

    if (tokens.length > 0) {
      this.sendPushToTokens(
        tokens.map((t) => t.token),
        title,
        body,
        { ...(safeData || {}), type },
        type,
        0,
      ).catch((err) => {
        logger.error({ err, userIdCount: pushRecipients.length }, 'Failed to send bulk push notification');
      });
    }
  },

  async sendToAll(title: string, body?: string, data?: Record<string, unknown>, type: string = 'admin') {
    const safeData = sanitizeNotificationData(data);
    let cursor: string | undefined;

    // Cursor through users — never materialize the full user id list in memory.
    for (;;) {
      const users = await prisma.user.findMany({
        select: { id: true },
        orderBy: { id: 'asc' },
        take: BROADCAST_USER_BATCH,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      if (users.length === 0) break;

      const userIds = users.map((u) => u.id);
      await this.sendToMultipleUsers(userIds, title, body, safeData, type);

      cursor = users[users.length - 1]?.id;
      if (users.length < BROADCAST_USER_BATCH) break;
    }
  },

  async sendPushToTokens(
    tokens: string[],
    title: string,
    body?: string,
    data?: Record<string, unknown>,
    type: string = 'system',
    badgeCount = 0,
    notificationId?: string,
  ) {
    if (!isFirebaseReady() || tokens.length === 0) return;

    const messaging = getMessagingInstance();
    if (!messaging) return;

    const pushData = enrichPushData(type, sanitizeNotificationData(data), notificationId);
    const channelId = resolveAndroidChannel(type);
    const uniqueTokens = [...new Set(tokens.filter(Boolean))];

    for (const tokenChunk of chunkArray(uniqueTokens, FCM_MULTICAST_LIMIT)) {
      const message: MulticastMessage = {
        tokens: tokenChunk,
        notification: {
          title,
          body: body || undefined,
        },
        data: pushData,
        android: {
          priority: 'high',
          notification: {
            channelId,
            priority: 'high',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: Math.max(0, badgeCount),
              contentAvailable: true,
              category: type,
            },
          },
        },
      };

      const response = await messaging.sendEachForMulticast(message);

      if (response.failureCount > 0) {
        const failedTokens: string[] = [];
        response.responses.forEach((resp: { success: boolean; error?: { code?: string } }, idx: number) => {
          if (!resp.success) {
            const code = resp.error?.code || '';
            if (PERMANENT_FCM_ERRORS.has(code)) {
              failedTokens.push(tokenChunk[idx]);
            }
            logger.warn({ error: resp.error, token: '[REDACTED]' }, 'FCM send failed');
          }
        });

        if (failedTokens.length > 0) {
          await prisma.deviceToken.deleteMany({
            where: { token: { in: failedTokens } },
          });
          logger.info({ removedCount: failedTokens.length }, 'Removed invalid device tokens');
        }
      }
    }
  },

  async getUserNotifications(
    userId: string,
    page: number = 1,
    limit: number = 20,
    options?: { category?: string; unread?: boolean; q?: string },
  ) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
    const skip = (safePage - 1) * safeLimit;
    const category = options?.category;
    const unreadOnly = options?.unread === true;
    const where = {
      userId,
      AND: [
        notificationCategoryWhere(category, unreadOnly),
        notificationSearchWhere(options?.q),
      ],
    };

    const [data, total] = await Promise.all([
      prisma.inAppNotification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeLimit,
      }),
      prisma.inAppNotification.count({ where }),
    ]);

    const unreadCount = await prisma.inAppNotification.count({
      where: { userId, read: false },
    });

    const totalPages = Math.ceil(total / safeLimit) || 1;

    return {
      data,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages,
        hasNext: safePage < totalPages,
        hasPrev: safePage > 1,
      },
      unreadCount,
    };
  },

  async markAsRead(userId: string, notificationIds: string[]) {
    await prisma.inAppNotification.updateMany({
      where: { id: { in: notificationIds }, userId },
      data: { read: true },
    });
  },

  async markAllAsRead(userId: string) {
    await prisma.inAppNotification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
  },

  async deleteNotification(userId: string, notificationId: string) {
    const row = await prisma.inAppNotification.findFirst({
      where: { id: notificationId, userId },
      select: { id: true },
    });
    if (!row) throw new ApiError(404, 'Notification not found');
    await prisma.inAppNotification.delete({ where: { id: notificationId } });
    return { deleted: true };
  },

  async deleteNotifications(userId: string, notificationIds: string[]) {
    const result = await prisma.inAppNotification.deleteMany({
      where: { userId, id: { in: notificationIds } },
    });
    return { deleted: result.count };
  },

  // ── Admin: Send targeted notifications ──
  async sendToRole(role: string, title: string, body?: string, data?: Record<string, unknown>, type: string = 'admin') {
    const normalized = String(role || '').toUpperCase();
    // 'ADMIN' targets all dashboard admin capabilities (not only legacy permission=ADMIN).
    const permissions: Role[] =
      normalized === 'ADMIN' || normalized === 'SUPER_ADMIN'
        ? [...ADMIN_ROLES]
        : [normalized as Role];

    const users = await prisma.user.findMany({
      where: {
        OR: [
          { permission: { in: permissions as any } },
          {
            userRoles: {
              some: {
                role: { in: permissions as any },
                status: { in: [RoleAssignmentStatus.APPROVED, RoleAssignmentStatus.ACTIVE] },
              },
            },
          },
        ],
      },
      select: { id: true },
    });
    const userIds = [...new Set(users.map((u) => u.id))];
    if (userIds.length === 0) return;

    await this.sendToMultipleUsers(userIds, title, body, data, type);
  },

  async sendToCity(city: string, title: string, body?: string, data?: Record<string, unknown>, type: string = 'admin') {
    const users = await prisma.user.findMany({
      where: {
        checkIns: { some: { place: { city } } },
      },
      select: { id: true },
    });
    const userIds = [...new Set(users.map((u) => u.id))];
    if (userIds.length === 0) return;
    await this.sendToMultipleUsers(userIds, title, body, data, type);
  },

  async sendToCategory(category: string, title: string, body?: string, data?: Record<string, unknown>, type: string = 'admin') {
    const users = await prisma.user.findMany({
      where: {
        checkIns: { some: { place: { category } } },
      },
      select: { id: true },
    });
    const userIds = [...new Set(users.map((u) => u.id))];
    if (userIds.length === 0) return;
    await this.sendToMultipleUsers(userIds, title, body, data, type);
  },

  // ── Notification Templates ──
  async listTemplates() {
    return prisma.notificationTemplate.findMany({ orderBy: { name: 'asc' } });
  },

  async createTemplate(input: { name: string; title: string; body?: string; type?: string; category?: string; variables?: string[] }) {
    return prisma.notificationTemplate.create({
      data: {
        name: input.name,
        title: input.title,
        body: input.body || null,
        type: input.type || 'system',
        category: input.category || 'general',
        variables: input.variables || [],
      },
    });
  },

  async updateTemplate(id: string, input: Partial<{ name: string; title: string; body: string; type: string; category: string; variables: string[] }>) {
    const data: any = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.title !== undefined) data.title = input.title;
    if (input.body !== undefined) data.body = input.body;
    if (input.type !== undefined) data.type = input.type;
    if (input.category !== undefined) data.category = input.category;
    if (input.variables !== undefined) data.variables = input.variables;
    return prisma.notificationTemplate.update({ where: { id }, data });
  },

  async deleteTemplate(id: string) {
    return prisma.notificationTemplate.delete({ where: { id } });
  },

  async sendFromTemplate(templateId: string, target: { type: 'all' | 'role' | 'city' | 'category' | 'user'; value?: string }, variables?: Record<string, string>) {
    const template = await prisma.notificationTemplate.findUnique({ where: { id: templateId } });
    if (!template) throw new ApiError(404, 'Template not found');

    let title = template.title;
    let body = template.body || '';

    if (variables) {
      for (const [key, val] of Object.entries(variables)) {
        title = title.replace(`{{${key}}}`, val);
        body = body.replace(`{{${key}}}`, val);
      }
    }

    const notifData = { templateId: template.id };

    switch (target.type) {
      case 'all':
        await this.sendToAll(title, body, notifData, template.type);
        break;
      case 'role':
        await this.sendToRole(target.value || 'USER', title, body, notifData, template.type);
        break;
      case 'user':
        if (target.value) await this.sendToUser(target.value, title, body, notifData, template.type);
        break;
      case 'city':
        await this.sendToCity(target.value || '', title, body, notifData, template.type);
        break;
      case 'category':
        await this.sendToCategory(target.value || '', title, body, notifData, template.type);
        break;
    }
  },

  async listAdminNotifications(page: number = 1, limit: number = 20) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
    const skip = (safePage - 1) * safeLimit;
    const [data, total] = await Promise.all([
      prisma.inAppNotification.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeLimit,
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
      prisma.inAppNotification.count(),
    ]);

    return {
      data,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit) || 1,
        hasNext: safePage * safeLimit < total,
        hasPrev: safePage > 1,
      },
    };
  },
};
