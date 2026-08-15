/** Server-side filter matching mobile notification tabs. */
export function notificationCategoryWhere(category: string | undefined, unread?: boolean) {
  const readFilter = unread ? { read: false } : {};

  if (!category || category === 'all') {
    return readFilter;
  }

  const c = category.toLowerCase();
  const orBlocks: Array<{ type?: { contains: string; mode: 'insensitive' }; title?: { contains: string; mode: 'insensitive' }; body?: { contains: string; mode: 'insensitive' } }> = [];

  const push = (tokens: string[]) => {
    for (const token of tokens) {
      orBlocks.push({ type: { contains: token, mode: 'insensitive' } });
      orBlocks.push({ title: { contains: token, mode: 'insensitive' } });
      orBlocks.push({ body: { contains: token, mode: 'insensitive' } });
    }
  };

  switch (c) {
    case 'unread':
      return { read: false };
    case 'payments':
      push(['payment', 'billing', 'invoice', 'subscription', 'wallet', 'premium', 'refund']);
      break;
    case 'offers':
      push(['offer', 'coupon', 'discount', 'deal']);
      break;
    case 'rewards':
      push(['points', 'reward', 'redeem', 'campaign', 'challenge', 'referral', 'leaderboard']);
      break;
    case 'bookings':
      push(['booking', 'hotel', 'ride', 'reservation']);
      break;
    case 'trips':
      push(['trip', 'itinerary', 'planner', 'weather', 'traffic', 'festival', 'attraction']);
      break;
    case 'community':
      push(['hidden_gem', 'review', 'comment', 'follow', 'creator', 'reel']);
      break;
    case 'system':
      push(['system', 'security', 'password', 'login', 'update', 'maintenance', 'welcome', 'admin']);
      break;
    default:
      return readFilter;
  }

  return {
    ...readFilter,
    OR: orBlocks,
  };
}

export function notificationSearchWhere(q: string | undefined) {
  const needle = q?.trim();
  if (!needle) return {};
  return {
    OR: [
      { title: { contains: needle, mode: 'insensitive' as const } },
      { body: { contains: needle, mode: 'insensitive' as const } },
      { type: { contains: needle, mode: 'insensitive' as const } },
    ],
  };
}
