/**
 * ITINERARY DISTANCE UNITS — regression (pre-launch audit, BUG 1).
 *
 * `TripPlanStop.distanceFromPrev` is KILOMETRES everywhere: backend LLM
 * (normalized), backend canonical schedule builder, mobile self-build
 * (buildLocalTripPlan) and the preview summary. This test pins the mobile
 * self-build to km and catches a regression back to meters.
 */
import { buildLocalTripPlan } from '../utils/tripPlanner';
import { haversineDistanceKm } from '../services/location/distance';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));

const SPOTS = [
  { id: 'a', name: 'Sangram Sagar Lake', latitude: 23.1495, longitude: 79.9048, category: 'lake', city: 'Jabalpur', state: 'Madhya Pradesh', rating: 4.8, estimatedDurationMinutes: 90 },
  { id: 'b', name: 'Madan Mahal Fort',   latitude: 23.1517, longitude: 79.9056, category: 'fort', city: 'Jabalpur', state: 'Madhya Pradesh', rating: 4.7, estimatedDurationMinutes: 90 },
  { id: 'c', name: 'Bali Ka Teela',      latitude: 23.1460, longitude: 79.9110, category: 'heritage', city: 'Jabalpur', state: 'Madhya Pradesh', rating: 4.6, estimatedDurationMinutes: 60 },
] as any;

describe('buildLocalTripPlan distance units (BUG 1 — km, not meters)', () => {
  it('stores distanceFromPrev in km (true consecutive distance ~0.26)', () => {
    const plan = buildLocalTripPlan({ location: 'Jabalpur', days: 1, pace: 'fast', places: SPOTS });
    const stops = plan.days[0].stops;
    expect(stops.length).toBeGreaterThanOrEqual(2);
    const leg = stops.find((s) => s.name === 'Madan Mahal Fort')?.distanceFromPrev ?? 0;
    // In km this is ~0.26; a meters regression would be ~260.
    expect(leg).toBeGreaterThan(0.1);
    expect(leg).toBeLessThan(0.5);
  });

  it('first stop of the day has distanceFromPrev 0', () => {
    const plan = buildLocalTripPlan({ location: 'Jabalpur', days: 1, pace: 'fast', places: SPOTS });
    expect(plan.days[0].stops[0].distanceFromPrev).toBe(0);
  });

  it('distanceFromPrev equals the consecutive-stop haversine (A→B→C semantics)', () => {
    const plan = buildLocalTripPlan({ location: 'Jabalpur', days: 1, pace: 'fast', places: SPOTS });
    const stops = plan.days[0].stops;
    stops.forEach((stop, i) => {
      if (i === 0) {
        expect(stop.distanceFromPrev).toBe(0);
        return;
      }
      const prev = stops[i - 1];
      const expected = Math.round(haversineDistanceKm(
        prev.latitude, prev.longitude, stop.latitude, stop.longitude,
      ) * 100) / 100;
      expect(stop.distanceFromPrev).toBe(expected);
    });
  });
});