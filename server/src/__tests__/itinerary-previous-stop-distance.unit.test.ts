/**
 * Consecutive previous-stop distance is kilometres along FINAL itinerary order.
 * First stop of a day has no previous-stop distance.
 */
import { describe, expect, it } from 'vitest';
import {
  distancesForOrderedStops,
  distanceFromPreviousStopKm,
  haversineKm,
  roundKm,
} from '../modules/trips/stopDistance';

const A = { latitude: 23.1495, longitude: 79.9048 };
const B = { latitude: 23.1517, longitude: 79.9056 };
const C = { latitude: 23.1460, longitude: 79.9110 };

describe('previous-stop distance (BUG 1)', () => {
  it('A has no previous-stop distance; B = A→B; C = B→C', () => {
    const distances = distancesForOrderedStops([A, B, C]);
    expect(distances[0]).toBeNull();
    expect(distances[1]).toBe(roundKm(haversineKm(A.latitude, A.longitude, B.latitude, B.longitude)));
    expect(distances[2]).toBe(roundKm(haversineKm(B.latitude, B.longitude, C.latitude, C.longitude)));
    expect(distances[1]).toBeGreaterThan(0.1);
    expect(distances[1]).toBeLessThan(0.5);
  });

  it('manual reorder A,C,B changes the previous-stop distance for each later stop', () => {
    const original = distancesForOrderedStops([A, B, C]);
    const reordered = distancesForOrderedStops([A, C, B]);
    expect(reordered[0]).toBeNull();
    expect(reordered[1]).toBe(roundKm(haversineKm(A.latitude, A.longitude, C.latitude, C.longitude)));
    expect(reordered[2]).toBe(roundKm(haversineKm(C.latitude, C.longitude, B.latitude, B.longitude)));
    expect(reordered[1]).not.toBe(original[1]);
    expect(reordered).not.toEqual(original);
  });

  it('returns null when either coordinate is missing', () => {
    expect(distanceFromPreviousStopKm(A, { latitude: null, longitude: 79.9 })).toBeNull();
    expect(distanceFromPreviousStopKm(null, B)).toBeNull();
  });
});
