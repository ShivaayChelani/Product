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

  it('itinerary driving legs reuse the canonical driving-route helper', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../features/buildTrip/hooks/useOsrmLegs.ts'),
      'utf8',
    );
    expect(src).toMatch(/fetchDrivingRoute/);
    expect(src).not.toMatch(/router\.project-osrm\.org/);
  });
});
