/** Maps in-app notification types to UI filter tabs. */
export type NotificationFilterTab =
  | 'All'
  | 'Unread'
  | 'Payments'
  | 'Offers'
  | 'Rewards'
  | 'Bookings'
  | 'Trips'
  | 'Nearby'
  | 'Creator'
  | 'Vendor'
  | 'Community'
  | 'System';

export const NOTIFICATION_FILTER_TABS: NotificationFilterTab[] = [
  'All',
  'Unread',
  'Payments',
  'Offers',
  'Rewards',
  'Bookings',
  'Trips',
  'Nearby',
  'Creator',
  'Vendor',
  'Community',
  'System',
];

function haystack(n: { type?: string; title?: string; body?: string | null }): string {
  return `${n.type || ''} ${n.title || ''} ${n.body || ''}`.toLowerCase();
}

export function matchesNotificationTab(
  n: { type?: string; title?: string; body?: string | null; read?: boolean },
  tab: NotificationFilterTab,
): boolean {
  if (tab === 'All') return true;
  if (tab === 'Unread') return !n.read;
  const t = haystack(n);
  const type = (n.type || '').toLowerCase();

  switch (tab) {
    case 'Payments':
      return /pay|billing|subscription|invoice|refund|premium|wallet|razorpay/.test(t) || /payment|billing/.test(type);
    case 'Offers':
      return /offer|coupon|discount|deal|vendor.?promo|nearby.?deal/.test(t) || /offer/.test(type);
    case 'Rewards':
      return /palpoints|points|reward|redeem|campaign|challenge|referral|leaderboard|badge/.test(t)
        || /points_earned|reward|campaign|challenge/.test(type);
    case 'Bookings':
      return /book|hotel|ride|reservation|check.?in|invoice/.test(t) || /booking/.test(type);
    case 'Trips':
      return /trip|itinerary|ai|planner|weather|traffic|festival|nearby|attraction|reminder/.test(t)
        || /trip|itinerary/.test(type);
    case 'Nearby':
      return /nearby|hidden.?gem|attraction|spot/.test(t) || /nearby|hidden_gem/.test(type);
    case 'Creator':
      return /creator|reel|trending|approved|audience/.test(t) || /creator|reel/.test(type);
    case 'Vendor':
      return /vendor|redemption|scanner/.test(t) || /vendor|redemption/.test(type);
    case 'Community':
      return /review|comment|follow|liked/.test(t) || /comment|follow/.test(type);
    case 'System':
      return /system|security|password|login|version|update|maintenance|welcome|account|legal|admin/.test(t)
        || /system|security|maintenance/.test(type);
    default:
      return true;
  }
}

export function buildServerCategoryParam(tab: NotificationFilterTab): string | undefined {
  if (tab === 'All') return undefined;
  return tab.toLowerCase();
}
