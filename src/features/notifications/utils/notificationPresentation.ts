import type { InAppNotification } from '../../../services/api/notifications';

export type NotificationVisual = {
  icon: string;
  iconColor: string;
  iconBg: string;
  fallbackThumb?: string;
};

function dataField(n: InAppNotification, key: string): string | undefined {
  const d = n.data as Record<string, unknown> | null;
  if (!d) return undefined;
  const v = d[key];
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

export function notificationThumbnailUrl(n: InAppNotification): string | undefined {
  return (
    dataField(n, 'imageUrl')
    || dataField(n, 'thumbnailUrl')
    || dataField(n, 'image')
    || dataField(n, 'placeImageUrl')
    || dataField(n, 'coverUrl')
  );
}

export function notificationVisual(n: InAppNotification): NotificationVisual {
  const t = `${n.type} ${n.title} ${n.body || ''}`.toLowerCase();

  if (/points|palpoints|reward.*earn/.test(t)) {
    return { icon: 'logo-usd', iconColor: '#68756D', iconBg: 'rgba(183,121,31,0.18)' };
  }
  if (/offer|discount|coupon|25%/.test(t)) {
    return { icon: 'pricetag', iconColor: '#2E7D55', iconBg: 'rgba(22,163,74,0.12)' };
  }
  if (/hidden.?gem|place.*approv/.test(t)) {
    return { icon: 'location', iconColor: '#C94A4A', iconBg: 'rgba(220,38,38,0.12)' };
  }
  if (/ai|itinerary.*ready|sparkle/.test(t)) {
    return { icon: 'sparkles', iconColor: '#1F4D3A', iconBg: 'rgba(31,77,58,0.12)' };
  }
  if (/book|hotel|reservation/.test(t)) {
    return { icon: 'briefcase', iconColor: '#1F4D3A', iconBg: 'rgba(31,77,58,0.12)' };
  }
  if (/price drop|alert/.test(t)) {
    return { icon: 'notifications', iconColor: '#1F4D3A', iconBg: 'rgba(31,77,58,0.12)' };
  }
  if (/welcome|gift|system/.test(t)) {
    return { icon: 'gift', iconColor: '#1F4D3A', iconBg: 'rgba(31,77,58,0.12)' };
  }
  if (/payment|billing|invoice|subscription/.test(t)) {
    return { icon: 'wallet', iconColor: '#1F4D3A', iconBg: 'rgba(22,57,43,0.12)' };
  }
  if (/trip|travel|weather|traffic|festival/.test(t)) {
    return { icon: 'airplane', iconColor: '#16392B', iconBg: 'rgba(22,57,43,0.12)' };
  }
  if (/reel|creator|follow|comment|community/.test(t)) {
    return { icon: 'people', iconColor: '#1F4D3A', iconBg: 'rgba(183,121,31,0.16)' };
  }
  return { icon: 'notifications-outline', iconColor: '#1F4D3A', iconBg: 'rgba(183,121,31,0.14)' };
}

export function formatNotificationTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  if (date >= startOfToday) return time;
  if (date >= startOfYesterday) {
    return `Yesterday, ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export type DateSection = 'Today' | 'Yesterday' | 'Earlier';

export function notificationDateSection(iso: string): DateSection {
  const date = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  if (date >= startOfToday) return 'Today';
  if (date >= startOfYesterday) return 'Yesterday';
  return 'Earlier';
}

export function matchesSearchQuery(n: InAppNotification, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const d = n.data as Record<string, unknown> | null;
  const extra = d ? Object.values(d).join(' ') : '';
  return `${n.title} ${n.body || ''} ${n.type} ${extra}`.toLowerCase().includes(needle);
}
