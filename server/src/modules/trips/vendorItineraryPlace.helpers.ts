export function vendorPlaceExternalId(vendorId: string): string {
  return `vendor:${vendorId}`;
}

/** Keep vendor stops off the tourist Places map (shops/cafés/hotels). */
export function vendorBusinessTypeToPlaceCategory(businessType?: string | null): string {
  const t = String(businessType || '').toLowerCase();
  if (/\b(hotel|homestay|resort|lodge|stay)\b/.test(t)) return 'HOTEL';
  if (/\b(shop|shopping|store|market|boutique|mall)\b/.test(t)) return 'SHOPPING';
  return 'RESTAURANT';
}
