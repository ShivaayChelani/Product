/**
 * Community Event → map marker projection.
 *
 * The map already has one marker pipeline for places and vendors, so Events
 * reuse it rather than introducing a second marker renderer. The server's
 * `marker.icon` / `marker.label` are carried through unchanged so the Events
 * layer speaks the same vocabulary on web and mobile.
 */
import type { CommunityEventMapItem } from '../../services/api/events';
import { eventHasCoordinates, eventImage, eventTypeLabel } from './eventFormat';

export type EventMarker = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** Raw EventType key; the Leaflet layer normalizes it like any other category. */
  category: string;
  type: 'event';
  image: string | null;
  description: string;
  city: string;
  state: string;
  color: string;
  emoji: string;
  sublabel: string;
  /** ISO instant, for the detail card's "when" line. */
  startDate: string;
  startTime: string | null;
  endTime: string | null;
  isFeatured: boolean;
  /** Slug or cuid — what EventDetail and share links need. */
  eventIdOrSlug: string;
};

const EVENT_MARKER_COLOR = '#1F4D3A';

/** Drops events with no usable position; never fabricates a 0,0 pin. */
export function toEventMarkers(events: CommunityEventMapItem[]): EventMarker[] {
  const markers: EventMarker[] = [];
  for (const event of events) {
    if (!eventHasCoordinates(event)) continue;
    const lat = Number(event.latitude);
    const lng = Number(event.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    markers.push({
      id: event.id,
      name: event.title,
      lat,
      lng,
      category: event.eventType,
      type: 'event',
      image: eventImage(event),
      description: event.description || '',
      city: event.city || '',
      state: event.state || '',
      color: EVENT_MARKER_COLOR,
      emoji: event.marker?.icon || 'event',
      sublabel: event.marker?.label || eventTypeLabel(event.eventType),
      startDate: event.startDate,
      startTime: event.startTime,
      endTime: event.endTime,
      isFeatured: Boolean(event.isFeatured),
      eventIdOrSlug: event.slug || event.id,
    });
  }
  return markers;
}