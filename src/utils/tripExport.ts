import type { TripPlan } from '../services/api/trips';

const CATEGORY_EMOJI: Record<string, string> = {
  nature: '🌿', waterfall: '💧', river: '🌊', riverfront: '🌊', viewpoint: '🌄',
  temple: '🛕', fort: '🏰', palace: '👑', museum: '🏛️',
  garden: '🌺', park: '🌳', wildlife: '🐅', heritage: '🏛️',
  spiritual: '🕉️', religious: '🕉️', adventure: '🎯', photography: '📸',
  cultural: '🎨', lake: '🌊', history: '📜', ghat: '🕉️',
  church: '⛪', mosque: '🕌', monument: '🏛️', cave: '🕳️',
  island: '🏝️', dam: '🌉', bridge: '🌉', beach: '🏖️',
  market: '🛒', shopping: '🛍️', food: '🍽️', cafe: '☕',
  hiking: '🥾', trekking: '🥾', resort: '🏨', stay: '🏨',
};

function formatCategory(raw?: string | null): string {
  if (!raw) return '';
  return raw.replace(/_/g, ' ').replace(/\s*\/\s*/g, ' / ').replace(/\s+/g, ' ').trim();
}

function categoryEmojis(raw?: string | null): string {
  if (!raw) return '';
  const parts = raw.replace(/_/g, ' ').split(/\s*\/\s*/).map(s => s.trim().toLowerCase());
  return parts.map(p => CATEGORY_EMOJI[p] || '📍').join(' • ');
}

function humanizeEnum(value?: string | null): string {
  if (!value) return '';
  const map: Record<string, string> = {
    SOLO: 'Solo', FAMILY: 'Family', COUPLE: 'Couple', FRIENDS: 'Friends',
    CUSTOM: 'Custom', LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High',
    BUDGET: 'Budget', LUXURY: 'Luxury',
  };
  return map[value.toUpperCase()] || value.charAt(0) + value.slice(1).toLowerCase();
}

function escapeWhatsApp(text: string): string {
  return text.replace(/([*_~`])/g, '\\$1');
}

function formatTime12h(time?: string | null) {
  if (!time) return null;
  const [h, m] = time.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${m} ${ampm}`;
}

function formatDuration(minutes?: number | null) {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h} hr${h > 1 ? 's' : ''}`;
  return `${m} min`;
}

/** Build a shareable plain-text itinerary (PDF apps can import from share sheet). */
export function buildTripExportText(trip: TripPlan): string {
  const lines: string[] = [];
  const title = trip.title || trip.destination || 'Trip';

  lines.push(`✨ *My ${escapeWhatsApp(title)}* — PalSafar`);
  lines.push('');
  if (trip.destination) lines.push(`📍 *${escapeWhatsApp(trip.destination)}*`);
  lines.push(`📅 *${trip.days} Day${trip.days !== 1 ? 's' : ''}*`);
  if (trip.travelers) lines.push(`👨‍👩‍👧‍👦 *${humanizeEnum(trip.travelers)}*`);
  if (trip.budget) lines.push(`💰 *${humanizeEnum(trip.budget)} Budget*`);
  if (trip.totalDistance) lines.push(`🚗 *${trip.totalDistance.toFixed(1)} km*`);

  const days = [...(trip.tripDays || [])].sort((a, b) => a.dayNumber - b.dayNumber);

  for (const day of days) {
    lines.push('');
    lines.push('━━━━━━━━━━━━━━');
    lines.push('');
    lines.push(`📅 *DAY ${day.dayNumber}*`);
    if (day.theme) lines.push(`*${escapeWhatsApp(day.theme)}*`);

    const stops = [...(day.stops || [])].sort((a, b) => a.order - b.order);
    if (stops.length === 0) {
      lines.push('');
      lines.push('(no stops)');
    }
    for (const stop of stops) {
      const p = stop.place;
      const fee = stop.entryFee != null ? (stop.entryFee <= 0 ? 'Free' : `₹${stop.entryFee}`) : null;
      const catLabel = formatCategory(p?.category);
      const catEmoji = categoryEmojis(p?.category);
      const timeRange = (stop.startTime || stop.endTime) ? 
        `🕘 ${formatTime12h(stop.startTime)}${stop.endTime ? ` – ${formatTime12h(stop.endTime)}` : ''}` : null;
      const durationStr = stop.duration ? `⏱️ ${formatDuration(stop.duration)}` : null;
      const distStr = (stop.order > 0 && stop.distanceFromPrev) ? 
        `🚗 ~${stop.distanceFromPrev % 1 === 0 ? stop.distanceFromPrev.toFixed(0) : stop.distanceFromPrev.toFixed(1)} km from previous stop` : null;

      lines.push('');
      lines.push(`📍 *${stop.order + 1}. ${escapeWhatsApp(p?.name || 'Place')}*`);
      if (timeRange) lines.push(timeRange);
      if (durationStr) lines.push(durationStr);
      if (distStr) lines.push(distStr);
      if (catLabel) lines.push(`${catEmoji} ${catLabel}`);
      if (fee) lines.push(`🎟️ Entry: *${fee}*`);
    }
  }

  lines.push('');
  lines.push('━━━━━━━━━━━━━━');
  lines.push('');
  lines.push('✨ *Planned with PalSafar*');

  return lines.join('\n');
}
