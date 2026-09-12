export type TreasureHuntLoadErrorKind =
  | 'NETWORK_ERROR'
  | 'AUTH_REQUIRED'
  | 'CITY_MISMATCH'
  | 'NO_HUNT'
  | 'GEOCODING_FAILED'
  | 'SERVER_ERROR'
  | 'UNKNOWN';

export interface TreasureHuntLoadErrorInfo {
  kind: TreasureHuntLoadErrorKind;
  message: string;
}

const FALLBACK_MESSAGE = 'Could not load treasure hunts. Please try again.';

/**
 * Maps an error thrown while loading the current-city Treasure Hunt to a
 * single user-facing message. The backend stays authoritative: this only
 * translates HTTP/abort outcomes into human wording, it never invents a city.
 */
export function classifyTreasureHuntLoadError(err: any): TreasureHuntLoadErrorInfo {
  const status = err?.status as number | undefined;
  const code = err?.code as string | undefined;
  const name = err?.name as string | undefined;
  const message = err?.message as string | undefined;

  if (message === 'Network request failed' || name === 'AbortError') {
    return { kind: 'NETWORK_ERROR', message: "Couldn't connect. Please check your internet connection." };
  }
  if (status === 401) {
    return { kind: 'AUTH_REQUIRED', message: 'Please log in to continue.' };
  }
  if (status === 403 || code === 'TREASURE_HUNT_CITY_MISMATCH') {
    return {
      kind: 'CITY_MISMATCH',
      message: "This Treasure Hunt isn't available in your current city.",
    };
  }
  if (status === 404) {
    return { kind: 'NO_HUNT', message: 'No Treasure Hunts Found' };
  }
  if (status === 400 && code === 'CITY_RESOLUTION_FAILED') {
    return {
      kind: 'GEOCODING_FAILED',
      message: 'Unable to determine your city right now. Please try again.',
    };
  }
  if (status != null && status >= 500) {
    return { kind: 'SERVER_ERROR', message: 'Something went wrong on our side. Please try again.' };
  }
  return { kind: 'UNKNOWN', message: message || FALLBACK_MESSAGE };
}