export type LocationSuggestionKind = 'place' | 'vendor';

export interface LocationSuggestion {
  kind: LocationSuggestionKind;
  id: string;
  name: string;
  subtitle: string;
  latitude?: number | null;
  longitude?: number | null;
}

function unwrapList(payload: unknown): any[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  const data = (payload as { data?: unknown }).data;
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object' && Array.isArray((data as { data?: unknown }).data)) {
    return (data as { data: unknown[] }).data;
  }
  return [];
}

/** Case-insensitive match score so "cafe" still finds "River View Cafe". */
export function locationQueryScore(name: string, query: string): number {
  const n = String(name || '').trim().toLowerCase();
  const q = String(query || '').trim().toLowerCase();
  if (!q || !n) return 0;
  if (n === q) return 3;
  if (n.startsWith(q)) return 2;
  if (n.includes(q)) return 1;
  return 0;
}

export function mapPlaceSuggestion(place: any): LocationSuggestion | null {
  if (!place?.id || !place?.name) return null;
  const city = place.city || place.state || '';
  return {
    kind: 'place',
    id: String(place.id),
    name: String(place.name),
    subtitle: city ? `Place · ${city}` : 'Place',
    latitude: place.latitude ?? place.lat ?? null,
    longitude: place.longitude ?? place.lng ?? null,
  };
}

export function mapVendorSuggestion(vendor: any): LocationSuggestion | null {
  const id = vendor?.id;
  const name = vendor?.businessName || vendor?.name;
  if (!id || !name) return null;
  const city = vendor.city || vendor.state || vendor.address || '';
  return {
    kind: 'vendor',
    id: String(id),
    name: String(name),
    subtitle: city ? `Vendor · ${city}` : 'Vendor',
    latitude: vendor.latitude ?? vendor.lat ?? null,
    longitude: vendor.longitude ?? vendor.lng ?? null,
  };
}

export function mergeLocationSuggestions(
  placesPayload: unknown,
  vendorsPayload: unknown,
  limit = 8,
  query = '',
): LocationSuggestion[] {
  const places = unwrapList(placesPayload).map(mapPlaceSuggestion).filter(Boolean) as LocationSuggestion[];
  const vendors = unwrapList(vendorsPayload).map(mapVendorSuggestion).filter(Boolean) as LocationSuggestion[];
  const merged: LocationSuggestion[] = [];
  const seen = new Set<string>();
  const push = (item: LocationSuggestion) => {
    const key = `${item.kind}:${item.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(item);
  };
  const byQuery = (items: LocationSuggestion[]) =>
    [...items].sort((a, b) => locationQueryScore(b.name, query) - locationQueryScore(a.name, query));

  const rankedVendors = byQuery(vendors);
  const rankedPlaces = byQuery(places);
  // Subscribed businesses that match the typed name stay visible even when many places also match.
  rankedVendors.filter((item) => locationQueryScore(item.name, query) > 0).forEach(push);
  rankedPlaces.forEach(push);
  rankedVendors.forEach(push);
  return merged.slice(0, limit);
}
