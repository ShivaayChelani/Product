import { useDrivingLegs } from '../features/buildTrip/hooks/useDrivingLegs';
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

describe('useDrivingLegs tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('handles 0 stops and 1 stop', () => {
    const setLegs = jest.fn();
    (useState as jest.Mock).mockReturnValue([[], setLegs]);
    (useRef as jest.Mock).mockReturnValue({ current: 0 });
    (useEffect as jest.Mock).mockImplementation((cb) => cb());

    useDrivingLegs([]);
    expect(setLegs).toHaveBeenCalledWith([]);

    useDrivingLegs([{ id: '1' }] as any);
    expect(setLegs).toHaveBeenCalledWith([]);
  });

  it('computes legs for 3 stops (2 legs)', async () => {
    const setLegs = jest.fn();
    (useState as jest.Mock).mockReturnValue([[], setLegs]);
    (useRef as jest.Mock).mockReturnValue({ current: 1 });
    
    // Call the effect callback immediately but wait for its internal promises
    let effectCb: any;
    (useEffect as jest.Mock).mockImplementation((cb) => {
      effectCb = cb;
    });

    (getOSRMRoute as jest.Mock).mockImplementation(async (olat, olng, dlat, dlng) => {
      if (olat === 10 && dlat === 20) {
        return { durationSeconds: 600, distanceMeters: 5000, source: 'routing' };
      }
      if (olat === 20 && dlat === 30) {
        return { durationSeconds: 1200, distanceMeters: 10000, source: 'routing' };
      }
      return null;
    });

    useDrivingLegs([
      { id: '1', place: { latitude: 10, longitude: 10 } },
      { id: '2', place: { latitude: 20, longitude: 20 } },
      { id: '3', place: { latitude: 30, longitude: 30 } },
    ] as any);

    effectCb();

    // Give promises time to resolve
    await new Promise(r => setTimeout(r, 50));

    expect(setLegs).toHaveBeenCalledWith([
      { minutes: 10, km: 5, steps: [], isRoad: true },
      { minutes: 20, km: 10, steps: [], isRoad: true }
    ]);
  });
});
