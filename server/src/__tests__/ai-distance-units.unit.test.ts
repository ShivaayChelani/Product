/**
 * ITINERARY DISTANCE UNITS — regression (4-bug pre-launch audit, BUG 1).
 *
 * `distanceFromPrev` is stored and displayed in KILOMETRES. Gemini was asked
 * for meters and on some paths returned metric values; the server now
 * recomputes every LLM distance from consecutive-stop coordinates so stored
 * values are always km (never meters).
 */
import { describe, expect, it } from 'vitest';
import { aiService } from '../modules/ai/ai.service';

describe('aiService.normalizeLlmDistancesToKm (BUG 1 — km, not meters)', () => {
  it('recomputes LLM distances in km from consecutive-stop coordinates', () => {
    // Sangram Sagar Lake -> Madan Mahal Fort (Jabalpur), true ~0.26 km.
    const itinerary = {
      days: [
        {
          day: 1,
          theme: 'Heritage',
          stops: [
            { placeId: 'a', latitude: 23.1495, longitude: 79.9048, distanceFromPrev: 0 },
            { placeId: 'b', latitude: 23.1517, longitude: 79.9056, distanceFromPrev: 1354 },
          ],
        },
      ],
    };
    const out: any = aiService.normalizeLlmDistancesToKm(itinerary);
    const d2 = out.days[0].stops[1].distanceFromPrev;
    expect(d2).toBeGreaterThan(0.1);
    expect(d2).toBeLessThan(0.5);
    expect(d2).toBeCloseTo(0.26, 1);
  });

  it('sets the first stop of each day to 0', () => {
    const itinerary = {
      days: [
        { day: 1, stops: [{ placeId: 'a', latitude: 23.1, longitude: 79.9, distanceFromPrev: 999 }] },
      ],
    };
    const out: any = aiService.normalizeLlmDistancesToKm(itinerary);
    expect(out.days[0].stops[0].distanceFromPrev).toBe(0);
  });

  it('handles missing or malformed days without throwing', () => {
    expect(() => aiService.normalizeLlmDistancesToKm(null)).not.toThrow();
    expect(() => aiService.normalizeLlmDistancesToKm({})).not.toThrow();
    expect(() => aiService.normalizeLlmDistancesToKm({ days: 'nope' })).not.toThrow();
  });
});