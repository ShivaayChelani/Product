export function isInIndia(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return lat >= 6 && lat <= 36 && lng >= 68 && lng <= 98;
}

export function isInBluSmartRegion(lat: number, lng: number): boolean {
  const regions = [
    { minLat: 28.4, maxLat: 28.9, minLng: 76.8, maxLng: 77.6 },
    { minLat: 12.8, maxLat: 13.2, minLng: 77.4, maxLng: 77.8 },
    { minLat: 18.9, maxLat: 19.3, minLng: 72.7, maxLng: 73.1 },
  ];
  return regions.some(r => lat >= r.minLat && lat <= r.maxLat && lng >= r.minLng && lng <= r.maxLng);
}
