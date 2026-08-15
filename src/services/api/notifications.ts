import { apiClient } from './client';
import { API_CONFIG } from '../../config/api';

export interface RegisterDeviceTokenInput {
  token: string;
  platform?: 'ios' | 'android' | 'web' | 'unknown';
  appVersion?: string;
  buildNumber?: string;
}

export interface InAppNotification {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  read: boolean;
  createdAt: string;
}

export interface NotificationsListResponse {
  notifications: InAppNotification[];
  unreadCount: number;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export type NotificationListParams = {
  page?: number;
  limit?: number;
  category?: string;
  unread?: boolean;
  q?: string;
};

export const notificationsApi = {
  async registerToken(input: RegisterDeviceTokenInput) {
    const res = await apiClient.post(
      API_CONFIG.endpoints.notifications.registerToken,
      input,
    );
    return res.data;
  },

  async unregisterToken(token: string) {
    const res = await apiClient.delete(
      API_CONFIG.endpoints.notifications.unregisterToken,
      { token },
    );
    return res.data;
  },

  async list(page: number = 1, limit: number = 20, params?: Omit<NotificationListParams, 'page' | 'limit'>) {
    const qs = new URLSearchParams();
    qs.set('page', String(page));
    qs.set('limit', String(limit));
    if (params?.category) qs.set('category', params.category);
    if (params?.unread) qs.set('unread', 'true');
    if (params?.q?.trim()) qs.set('q', params.q.trim());
    const res = await apiClient.get<NotificationsListResponse>(
      `${API_CONFIG.endpoints.notifications.list}?${qs.toString()}`,
    );
    return {
      ...res.data,
      pagination: res.pagination ?? res.data.pagination,
    };
  },

  async markRead(notificationIds: string[]) {
    const res = await apiClient.patch(
      API_CONFIG.endpoints.notifications.markRead,
      { notificationIds },
    );
    return res.data;
  },

  async markAllRead() {
    const res = await apiClient.post(
      API_CONFIG.endpoints.notifications.markAllRead,
    );
    return res.data;
  },

  async deleteNotification(notificationId: string) {
    const res = await apiClient.delete<{ deleted: boolean }>(
      `${API_CONFIG.endpoints.notifications.list}/${notificationId}`,
    );
    return res.data;
  },

  async deleteNotifications(notificationIds: string[]) {
    const res = await apiClient.delete<{ deleted: number }>(
      API_CONFIG.endpoints.notifications.list,
      { notificationIds },
    );
    return res.data;
  },
};
