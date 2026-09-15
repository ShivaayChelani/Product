import { prisma } from '../../config/database';
import {
  reverseGeocodeCandidates,
  primaryCandidateCity,
  type CityCandidates,
} from '../../shared/utils/reverseGeocode';
import { candidateCityKeys, canonicalCityKey, cityDisplayName } from '../../shared/utils/cityIdentity';
import { canonicalStateKey } from '../../shared/utils/stateIdentity';

export type HuntRow = {
  id: string;
  city: string;
  title: string;
  description: string | null;
  rewardCoins: number;
  status: string;
  /** Test-only / future field. Production TreasureHunt has no state column. */
  state?: string | null;
  _count: { riddles: number };
};

/**
 * Hunt city keys that PalSafar Places shows in 2+ Indian states
 * (≥2 approved places each). Home state is the existing hunt's import workbook
 * — not a guessed GPS radius and not a destructive rename.
 *
 * Catalog note: TreasureHunt.city is unique, so production currently has one
 * row per key. The selector still supports multiple rows (tests / future) and
 * fail-closes when the geocoder state cannot pick exactly one.
 */
export const MULTI_STATE_HUNT_KEYS: Record<string, { states: string[]; homeState: string }> = {
  bilaspur: { states: ['chhattisgarh', 'himachal pradesh'], homeState: 'himachal pradesh' },
  bishnupur: { states: ['manipur', 'west bengal'], homeState: 'manipur' },
  chitrakoot: { states: ['madhya pradesh', 'uttar pradesh'], homeState: 'uttar pradesh' },
  udaipur: { states: ['rajasthan', 'tripura'], homeState: 'rajasthan' },
};

export function huntHomeStateKey(hunt: HuntRow, cityKey: string): string | null {
  if (hunt.state) return canonicalStateKey(hunt.state) || null;
  return MULTI_STATE_HUNT_KEYS[cityKey]?.homeState ?? null;
}

function isAmbiguousCityKey(cityKey: string, matchingHunts: HuntRow[]): boolean {
  if (matchingHunts.length > 1) return true;
  if (MULTI_STATE_HUNT_KEYS[cityKey]) return true;
  const homes = new Set(
    matchingHunts.map((h) => huntHomeStateKey(h, cityKey)).filter((s): s is string => Boolean(s)),
  );
  return homes.size > 1;
}

function candidateTypeForKey(candidates: CityCandidates, key: string): 'district' | 'settlement' {
  if (candidates.district && canonicalCityKey(candidates.district) === key) return 'district';
  return 'settlement';
}

/**
 * Filter playable hunts for one canonical city key.
 * Unambiguous keys keep current district-first behaviour.
 * Ambiguous keys require a geocoder state and an exact home-state match.
 */
export function selectHuntsForCityKey(
  hunts: HuntRow[],
  cityKey: string,
  geoState: string | null,
): HuntRow[] | 'AMBIGUOUS' {
  const playable = hunts.filter((h) => h.status === 'ACTIVE' && (h._count?.riddles ?? 0) > 0);
  if (playable.length === 0) return [];

  const ambiguous = isAmbiguousCityKey(cityKey, playable);
  if (!ambiguous) return [playable[0]];

  const geo = canonicalStateKey(geoState);
  if (!geo) return 'AMBIGUOUS';

  const matched = playable.filter((h) => huntHomeStateKey(h, cityKey) === geo);
  if (matched.length === 1) return matched;
  if (matched.length === 0) return [];
  return 'AMBIGUOUS';
}

export type ResolvedLocationHunt = {
  displayCity: string;
  hunt: HuntRow | null;
  matchedCandidate: string | null;
  candidateType: 'district' | 'settlement' | null;
};

/**
 * Authoritative GPS → hunt resolution. Listing and the location gate MUST
 * consume this exact result so they cannot disagree.
 */
export async function resolveCurrentHuntFromLocation(
  lat: number,
  lng: number,
): Promise<ResolvedLocationHunt | null> {
  const candidates = await reverseGeocodeCandidates(lat, lng);
  if (!candidates) return null;
  const displayRaw = primaryCandidateCity(candidates);
  if (!displayRaw) return null;

  const displayCity = cityDisplayName(displayRaw);
  const keys = candidateCityKeys(candidates);
  const geoState = candidates.state ?? null;

  const allActive = (await prisma.treasureHunt.findMany({
    where: { status: 'ACTIVE' },
    include: { _count: { select: { riddles: { where: { status: 'ACTIVE' } } } } },
  })) as HuntRow[];

  for (const key of keys) {
    const hunts = allActive.filter((h) => canonicalCityKey(h.city) === key);
    const picked = selectHuntsForCityKey(hunts, key, geoState);
    const candidateType = candidateTypeForKey(candidates, key);

    if (picked === 'AMBIGUOUS') {
      return {
        displayCity,
        hunt: null,
        matchedCandidate: key,
        candidateType,
      };
    }
    if (picked.length === 1) {
      return {
        displayCity,
        hunt: picked[0],
        matchedCandidate: key,
        candidateType,
      };
    }
  }

  return {
    displayCity,
    hunt: null,
    matchedCandidate: null,
    candidateType: null,
  };
}
