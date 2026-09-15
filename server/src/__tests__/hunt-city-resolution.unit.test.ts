import { describe, expect, it } from 'vitest';
import {
  MULTI_STATE_HUNT_KEYS,
  huntHomeStateKey,
  selectHuntsForCityKey,
  type HuntRow,
} from '../../src/modules/riddles/huntCityResolution';
import { canonicalCityKey } from '../../src/shared/utils/cityIdentity';
import { canonicalStateKey } from '../../src/shared/utils/stateIdentity';

function row(id: string, city: string, extra: Partial<HuntRow> = {}): HuntRow {
  return {
    id,
    city,
    title: city,
    description: null,
    rewardCoins: 20,
    status: 'ACTIVE',
    _count: { riddles: 4 },
    ...extra,
  };
}

describe('MULTI_STATE_HUNT_KEYS inventory', () => {
  it('covers the Places-verified same-name collisions and no others', () => {
    expect(Object.keys(MULTI_STATE_HUNT_KEYS).sort()).toEqual([
      'bilaspur',
      'bishnupur',
      'chitrakoot',
      'udaipur',
    ]);
    expect(MULTI_STATE_HUNT_KEYS.bilaspur.homeState).toBe('himachal pradesh');
    expect(MULTI_STATE_HUNT_KEYS.bishnupur.homeState).toBe('manipur');
    expect(MULTI_STATE_HUNT_KEYS.chitrakoot.homeState).toBe('uttar pradesh');
    expect(MULTI_STATE_HUNT_KEYS.udaipur.homeState).toBe('rajasthan');
  });
});

describe('selectHuntsForCityKey — state-aware collision', () => {
  const hp = row('bilaspur-hp', 'Bilaspur', { state: 'Himachal Pradesh' });
  const cg = row('bilaspur-cg', 'Bilaspur', { state: 'Chhattisgarh' });

  it('unambiguous city does not require geocoder state', () => {
    const jabalpur = row('jbp', 'Jabalpur');
    expect(selectHuntsForCityKey([jabalpur], 'jabalpur', null)).toEqual([jabalpur]);
  });

  it('Bilaspur HP geo selects only the HP hunt', () => {
    const picked = selectHuntsForCityKey([hp, cg], 'bilaspur', 'Himachal Pradesh');
    expect(picked).toEqual([hp]);
  });

  it('Bilaspur CG geo selects only the CG hunt', () => {
    const picked = selectHuntsForCityKey([hp, cg], 'bilaspur', 'Chhattisgarh');
    expect(picked).toEqual([cg]);
  });

  it('ambiguous city with no geocoder state fails closed', () => {
    expect(selectHuntsForCityKey([hp, cg], 'bilaspur', null)).toBe('AMBIGUOUS');
    expect(selectHuntsForCityKey([hp], 'bilaspur', null)).toBe('AMBIGUOUS');
  });

  it('production-shaped single HP hunt is not given to CG GPS', () => {
    const production = row('bilaspur-hp', 'Bilaspur');
    expect(huntHomeStateKey(production, 'bilaspur')).toBe('himachal pradesh');
    expect(selectHuntsForCityKey([production], 'bilaspur', 'Chhattisgarh')).toEqual([]);
    expect(selectHuntsForCityKey([production], 'bilaspur', 'Himachal Pradesh')).toEqual([production]);
  });

  it('state aliases (HP / CG) still disambiguate', () => {
    expect(selectHuntsForCityKey([hp, cg], 'bilaspur', 'HP')).toEqual([hp]);
    expect(selectHuntsForCityKey([hp, cg], 'bilaspur', 'CG')).toEqual([cg]);
  });
});

describe('curated aliases are exact, not fuzzy', () => {
  it('Mohali / SAS Nagar map to the stored hunt identity', () => {
    expect(canonicalCityKey('Sahibzada Ajit Singh Nagar')).toBe('sahibzada ajit singh nagar sas nagar');
    expect(canonicalCityKey('Mohali')).toBe('sahibzada ajit singh nagar sas nagar');
    expect(canonicalCityKey('Sahibzada Ajit Singh Nagar Sas Nagar')).toBe(
      'sahibzada ajit singh nagar sas nagar',
    );
  });

  it('Baloda Bazar spellings map to the stored hunt identity', () => {
    expect(canonicalCityKey('Baloda Bazar')).toBe('balodabazar bhatapara');
    expect(canonicalCityKey('Balodabazar')).toBe('balodabazar bhatapara');
    expect(canonicalCityKey('Balodabazar Bhatapara')).toBe('balodabazar bhatapara');
  });

  it('does not substring-match unrelated names', () => {
    expect(canonicalCityKey('Sahibzada')).not.toBe('sahibzada ajit singh nagar sas nagar');
    expect(canonicalCityKey('Baloda')).not.toBe('balodabazar bhatapara');
    expect(canonicalCityKey('Bhatapara')).not.toBe('balodabazar bhatapara');
    expect(canonicalCityKey('Nagar')).not.toBe('sahibzada ajit singh nagar sas nagar');
  });
});

describe('canonicalStateKey', () => {
  it('normalizes Indian state aliases without treating them as districts', () => {
    expect(canonicalStateKey('Himachal Pradesh')).toBe('himachal pradesh');
    expect(canonicalStateKey('HP')).toBe('himachal pradesh');
    expect(canonicalStateKey('Chhattisgarh')).toBe('chhattisgarh');
    expect(canonicalStateKey('CG')).toBe('chhattisgarh');
    expect(canonicalStateKey(null)).toBe('');
  });
});
