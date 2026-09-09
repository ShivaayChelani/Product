/**
 * ITINERARY HARDENING — Sections 10, 16, 19, 20:
 *   driving leg edge cases, route failure fallback, multi-stop consecutiveness,
 *   and the stale-generation race guard.
 */
import { useDrivingLegs, RouteLeg } from '../features/buildTrip/hooks/useDrivingLegs';
import { getOSRMRoute } from '../services/routing/osrmService';
import { useState, useEffect, useRef } from 'react';

jest.mock('../services/routing/osrmService', () => ({
  getOSRMRoute: jest.fn(),
}));

jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useState: jest.fn(),
  useEffect: jest.fn(),
  useRef: jest.fn(),
}));

const FALLBACK: RouteLeg = { minutes: 0, km: 0, steps: [], isRoad: false };

describe('Section 10 — driving leg edge cases', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns zero legs for 0 stops and 1 stop', async () => {
    const setLegs = jest.fn();
    (useState as jest.Mock).mockReturnValue([[], setLegs]);
    (useRef as jest.Mock).mockReturnValue({ current: 0 });

    let effectCb: any;
    (useEffect as jest.Mock).mockImplementation((cb) => { effectCb = cb; });

    useDrivingLegs([] as any);
    effectCb();
    expect(setLegs).toHaveBeenCalledWith([]);

    setLegs.mockClear();
    useDrivingLegs([{ id: '1' }] as any);
    effectCb();
    expect(setLegs).toHaveBeenCalledWith([]);
    expect(getOSRMRoute).not.toHaveBeenCalled();
  });

  it('missing place object on a stop yields a fallback leg, never a crash', async () => {
    const setLegs = jest.fn();
    (useState as jest.Mock).mockReturnValue([[], setLegs]);
    (useRef as jest.Mock).mockReturnValue({ current: 0 });
    let effectCb: any;
    (useEffect as jest.Mock).mockImplementation((cb) => { effectCb = cb; });

    useDrivingLegs([
      { id: '1', place: null },
      { id: '2', place: { latitude: 20, longitude: 20 } },
    ] as any);
    effectCb();
    await new Promise(r => setTimeout(r, 10));
    expect(setLegs).toHaveBeenCalledWith([FALLBACK]);
    expect(getOSRMRoute).not.toHaveBeenCalled();
  });

  it('null coordinates on the destination stop yield a fallback leg', async () => {
    const setLegs = jest.fn();
    (useState as jest.Mock).mockReturnValue([[], setLegs]);
    (useRef as jest.Mock).mockReturnValue({ current: 0 });
    let effectCb: any;
    (useEffect as jest.Mock).mockImplementation((cb) => { effectCb = cb; });

    useDrivingLegs([
      { id: '1', place: { latitude: 10, longitude: 10 } },
      { id: '2', place: { latitude: null, longitude: 20 } },
    ] as any);
    effectCb();
    await new Promise(r => setTimeout(r, 10));
    expect(setLegs).toHaveBeenCalledWith([FALLBACK]);
    expect(getOSRMRoute).not.toHaveBeenCalled();
  });
});

describe('Section 16 — route failure degrades to fallback', () => {
  beforeEach(() => jest.clearAllMocks());

  async function runWithRoute(result: any) {
    const setLegs = jest.fn();
    (useState as jest.Mock).mockReturnValue([[], setLegs]);
    (useRef as jest.Mock).mockReturnValue({ current: 0 });
    let effectCb: any;
    (useEffect as jest.Mock).mockImplementation((cb) => { effectCb = cb; });
    (getOSRMRoute as jest.Mock).mockImplementation(result);

    useDrivingLegs([
      { id: '1', place: { latitude: 10, longitude: 10 } },
      { id: '2', place: { latitude: 20, longitude: 20 } },
    ] as any);
    effectCb();
    await new Promise(r => setTimeout(r, 10));
    return setLegs;
  }

  it('NoRoute (null result) degrades to fallback leg', async () => {
    const setLegs = await runWithRoute(() => Promise.resolve(null));
    expect(setLegs).toHaveBeenCalledWith([FALLBACK]);
  });

  it('network failure inside routing degrades to fallback leg', async () => {
    const setLegs = await runWithRoute(() => Promise.reject(new TypeError('Network request failed')));
    expect(setLegs).toHaveBeenCalledWith([FALLBACK]);
  });

  it('fallback legs are marked non-road; routed legs are marked road', async () => {
    const setLegs = jest.fn();
    (useState as jest.Mock).mockReturnValue([[], setLegs]);
    (useRef as jest.Mock).mockReturnValue({ current: 0 });
    let effectCb: any;
    (useEffect as jest.Mock).mockImplementation((cb) => { effectCb = cb; });

    (getOSRMRoute as jest.Mock).mockImplementation(async (olat: number) => {
      if (olat === 10) return null; // first leg degrades
      return { durationSeconds: 900, distanceMeters: 9000, source: 'routing' };
    });

    useDrivingLegs([
      { id: '1', place: { latitude: 10, longitude: 10 } },
      { id: '2', place: { latitude: 20, longitude: 20 } },
      { id: '3', place: { latitude: 30, longitude: 30 } },
    ] as any);
    effectCb();
    await new Promise(r => setTimeout(r, 10));

    expect(setLegs).toHaveBeenCalledWith([
      FALLBACK,
      { minutes: 15, km: 9, steps: [], isRoad: true },
    ]);
  });
});

describe('Section 19 — consecutive legs A→B, B→C, C→D', () => {
  it('produces exactly stops.length - 1 legs in visit order', async () => {
    const setLegs = jest.fn();
    (useState as jest.Mock).mockReturnValue([[], setLegs]);
    (useRef as jest.Mock).mockReturnValue({ current: 0 });
    let effectCb: any;
    (useEffect as jest.Mock).mockImplementation((cb) => { effectCb = cb; });

    (getOSRMRoute as jest.Mock).mockImplementation(async (olat: number, _lng: number, dlat: number) => {
      const seconds = (dlat - olat) * 60; // 10→20: 600s, 20→30: 1200s, 30→40: 1800s
      return { durationSeconds: seconds, distanceMeters: seconds * 5, source: 'routing' };
    });

    useDrivingLegs([
      { id: 'a', place: { latitude: 10, longitude: 10 } },
      { id: 'b', place: { latitude: 20, longitude: 20 } },
      { id: 'c', place: { latitude: 30, longitude: 30 } },
      { id: 'd', place: { latitude: 40, longitude: 40 } },
    ] as any);
    effectCb();
    await new Promise(r => setTimeout(r, 10));

    expect(setLegs).toHaveBeenCalledWith([
      { minutes: 600 / 60, km: 3000 / 1000, steps: [], isRoad: true },
      { minutes: 1200 / 60, km: 6000 / 1000, steps: [], isRoad: true },
      { minutes: 1800 / 60, km: 9000 / 1000, steps: [], isRoad: true },
    ]);
  });

  it('a two-stop trip produces exactly one leg', async () => {
    const setLegs = jest.fn();
    (useState as jest.Mock).mockReturnValue([[], setLegs]);
    (useRef as jest.Mock).mockReturnValue({ current: 0 });
    let effectCb: any;
    (useEffect as jest.Mock).mockImplementation((cb) => { effectCb = cb; });
    (getOSRMRoute as jest.Mock).mockResolvedValue({ durationSeconds: 600, distanceMeters: 5000, source: 'routing' });

    useDrivingLegs([
      { id: 'a', place: { latitude: 10, longitude: 10 } },
      { id: 'b', place: { latitude: 20, longitude: 20 } },
    ] as any);
    effectCb();
    await new Promise(r => setTimeout(r, 10));

    expect(setLegs).toHaveBeenCalledWith([{ minutes: 10, km: 5, steps: [], isRoad: true }]);
  });
});

describe('Section 20 — stale generation race guard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('ignores a stale slower response when stops change mid-flight', async () => {
    const setLegs = jest.fn();
    const gen = { current: 0 };
    (useState as jest.Mock).mockReturnValue([[], setLegs]);
    (useRef as jest.Mock).mockReturnValue(gen);

    let effectCb: any;
    let firstCleanup: any;
    (useEffect as jest.Mock).mockImplementation((cb) => {
      const cleanup = cb();
      if (!firstCleanup) firstCleanup = cleanup;
      return () => {};
    });

    (getOSRMRoute as jest.Mock).mockImplementation(async (olat: number) => {
      if (olat === 10) await new Promise(r => setTimeout(r, 40)); // old A→B pair is slow
      return { durationSeconds: 600, distanceMeters: 5000, source: 'routing' };
    });

    // First render: A→B (slow).
    useDrivingLegs([
      { id: 'a', place: { latitude: 10, longitude: 10 } },
      { id: 'b', place: { latitude: 20, longitude: 20 } },
    ] as any);
    // Stops change (deps change) → cleanup cancels the first run.
    firstCleanup();
    // Second render: B→C (fast).
    useDrivingLegs([
      { id: 'b', place: { latitude: 20, longitude: 20 } },
      { id: 'c', place: { latitude: 30, longitude: 30 } },
    ] as any);

    await new Promise(r => setTimeout(r, 80));

    // Only the newest generation's legs are committed, exactly once.
    expect(setLegs).toHaveBeenCalledTimes(1);
    expect(setLegs).toHaveBeenCalledWith([{ minutes: 10, km: 5, steps: [], isRoad: true }]);
  });

  it('component unmount never commits pending legs', async () => {
    const setLegs = jest.fn();
    const gen = { current: 0 };
    (useState as jest.Mock).mockReturnValue([[], setLegs]);
    (useRef as jest.Mock).mockReturnValue(gen);

    let effectCb: any;
    let firstCleanup: any;
    (useEffect as jest.Mock).mockImplementation((cb) => {
      const cleanup = cb();
      if (!firstCleanup) firstCleanup = cleanup;
      return () => {};
    });
    (getOSRMRoute as jest.Mock).mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 20));
      return { durationSeconds: 600, distanceMeters: 5000, source: 'routing' };
    });

    useDrivingLegs([
      { id: 'a', place: { latitude: 10, longitude: 10 } },
      { id: 'b', place: { latitude: 20, longitude: 20 } },
    ] as any);
    firstCleanup(); // unmount
    await new Promise(r => setTimeout(r, 40));

    expect(setLegs).not.toHaveBeenCalled();
  });
});