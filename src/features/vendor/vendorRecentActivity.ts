export type VendorActivityKind = 'redemption' | 'offer' | 'reel';

export type VendorRecentActivityItem = {
  id: string;
  kind: VendorActivityKind;
  title: string;
  subtitle: string;
  badge: string;
  createdAt: number;
};

function toTime(value?: string | number | Date | null): number {
  if (value == null || value === '') return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

export function formatActivityWhen(at: number, now = Date.now()): string {
  if (!at) return '';
  const date = new Date(at);
  const time = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  const startYesterday = new Date(startToday);
  startYesterday.setDate(startYesterday.getDate() - 1);
  if (at >= startToday.getTime()) return `Today, ${time}`;
  if (at >= startYesterday.getTime()) return `Yesterday, ${time}`;
  const day = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  return `${day}, ${time}`;
}

export function buildVendorRecentActivity(input: {
  redemptions?: Array<{
    id: string;
    userName?: string;
    pointsSpent?: number;
    offerTitle?: string;
    redeemedAt?: string;
    createdAt?: string;
    status?: string;
    discountReceived?: number;
  }>;
  offers?: Array<{
    id: string;
    offerTitle?: string;
    title?: string;
    isActive?: boolean;
    isApproved?: boolean;
    createdAt?: string;
    pausedAt?: string | null;
  }>;
  reels?: Array<{
    id: string;
    title?: string | null;
    createdAt?: string;
  }>;
  limit?: number;
}): VendorRecentActivityItem[] {
  const items: VendorRecentActivityItem[] = [];

  for (const r of input.redemptions || []) {
    const at = toTime(r.redeemedAt || r.createdAt);
    if (!at) continue;
    const points = Number(r.pointsSpent) || 0;
    const who = (r.userName || '').trim() || 'A traveler';
    const offer = (r.offerTitle || '').trim();
    const status = String(r.status || '').toLowerCase();
    const badge =
      status === 'verified' || status === 'completed' ? 'Completed'
        : status === 'cancelled' ? 'Cancelled'
          : 'Pending';
    items.push({
      id: `redemption:${r.id}`,
      kind: 'redemption',
      title: `${who} redeemed ${points} PalPoints`,
      subtitle: [offer, formatActivityWhen(at)].filter(Boolean).join(' • '),
      badge,
      createdAt: at,
    });
  }

  for (const o of input.offers || []) {
    const at = toTime(o.pausedAt || o.createdAt);
    if (!at) continue;
    const title = (o.offerTitle || o.title || '').trim();
    if (!title) continue;
    const paused = Boolean(o.pausedAt) || o.isActive === false;
    const active = o.isActive !== false && o.isApproved !== false && !o.pausedAt;
    items.push({
      id: `offer:${o.id}`,
      kind: 'offer',
      title,
      subtitle: `${paused ? 'Offer paused' : active ? 'Offer activated' : 'Offer created'} • ${formatActivityWhen(at)}`,
      badge: paused ? 'Paused' : active ? 'Active' : 'Created',
      createdAt: at,
    });
  }

  for (const reel of input.reels || []) {
    const at = toTime(reel.createdAt);
    if (!at) continue;
    items.push({
      id: `reel:${reel.id}`,
      kind: 'reel',
      title: (reel.title || '').trim() || 'Promotion reel',
      subtitle: `Published successfully • ${formatActivityWhen(at)}`,
      badge: 'Published',
      createdAt: at,
    });
  }

  const limit = input.limit && input.limit > 0 ? input.limit : 8;
  return items.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
}
