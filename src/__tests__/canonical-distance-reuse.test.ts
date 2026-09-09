import fs from 'fs';
import path from 'path';

describe('canonical distance reuse', () => {
  it('tripPlanner does not keep a second Haversine implementation', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../utils/tripPlanner.ts'),
      'utf8',
    );
    expect(src).toMatch(/haversineDistanceKm/);
    expect(src).not.toMatch(/Math\.sin\(dLat \/ 2\)/);
    expect(src).not.toMatch(/const R = 6371/);
  });

  it('itinerary driving legs use OSRM as the canonical routing provider', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../features/buildTrip/hooks/useDrivingLegs.ts'),
      'utf8',
    );
    // Legs now use OSRM backend (not Mapbox proxy)
    expect(src).toMatch(/getOSRMRoute/);
    // Must never call Mapbox directly
    expect(src).not.toMatch(/mapboxDirections/);
    // OSRM base URL must not be hardcoded in the legs hook
    expect(src).not.toMatch(/router\.project-osrm\.org/);
    // Must not use getMapboxRoute
    expect(src).not.toMatch(/getMapboxRoute/);
    // Must not use fetchDrivingRoute
    expect(src).not.toMatch(/fetchDrivingRoute/);
    // OSRM route result with distance and duration
    expect(src).toMatch(/distanceMeters/);
    expect(src).toMatch(/durationSeconds/);
  });
});