import { classifyTreasureHuntLoadError } from '../features/treasureHunt/treasureHuntErrors';

function makeErr(partial: Partial<{ status: number; code: string; name: string; message: string }>) {
  return partial;
}

describe('classifyTreasureHuntLoadError', () => {
  it('maps network failure to a connection message', () => {
    const info = classifyTreasureHuntLoadError(makeErr({ message: 'Network request failed' }));
    expect(info.kind).toBe('NETWORK_ERROR');
    expect(info.message).toContain('internet');
  });

  it('maps an AbortError (timeout) to a connection message', () => {
    const info = classifyTreasureHuntLoadError(makeErr({ name: 'AbortError' }));
    expect(info.kind).toBe('NETWORK_ERROR');
    expect(info.message).toContain('internet');
  });

  it('maps 401 to an auth-required message', () => {
    const info = classifyTreasureHuntLoadError(makeErr({ status: 401 }));
    expect(info.kind).toBe('AUTH_REQUIRED');
    expect(info.message).toBe('Please log in to continue.');
  });

  it('maps 403 TREASURE_HUNT_CITY_MISMATCH to a city-unavailable message', () => {
    const info = classifyTreasureHuntLoadError(makeErr({ status: 403, code: 'TREASURE_HUNT_CITY_MISMATCH' }));
    expect(info.kind).toBe('CITY_MISMATCH');
    expect(info.message).toContain("isn't available in your current city");
  });

  it('maps 403 without the code to a city-unavailable message', () => {
    const info = classifyTreasureHuntLoadError(makeErr({ status: 403 }));
    expect(info.kind).toBe('CITY_MISMATCH');
  });

  it('maps 404 to a no-hunt message', () => {
    const info = classifyTreasureHuntLoadError(makeErr({ status: 404 }));
    expect(info.kind).toBe('NO_HUNT');
    expect(info.message).toBe('No Treasure Hunts Found');
  });

  it('maps 400 CITY_RESOLUTION_FAILED to a geocoding-failed message (not a generic one)', () => {
    const info = classifyTreasureHuntLoadError(makeErr({ status: 400, code: 'CITY_RESOLUTION_FAILED' }));
    expect(info.kind).toBe('GEOCODING_FAILED');
    expect(info.message).toBe('Unable to determine your city right now. Please try again.');
  });

  it('maps a 5xx to a server-error message', () => {
    const info = classifyTreasureHuntLoadError(makeErr({ status: 500 }));
    expect(info.kind).toBe('SERVER_ERROR');
    expect(info.message).toContain('our side');
  });

  it('maps other 4xx to the backend message when available', () => {
    const info = classifyTreasureHuntLoadError(makeErr({ status: 400, message: 'Anything else' }));
    expect(info.kind).toBe('UNKNOWN');
    expect(info.message).toBe('Anything else');
  });

  it('falls back to a generic message when nothing is usable', () => {
    const info = classifyTreasureHuntLoadError(makeErr({}));
    expect(info.kind).toBe('UNKNOWN');
    expect(info.message).toBeTruthy();
  });
});