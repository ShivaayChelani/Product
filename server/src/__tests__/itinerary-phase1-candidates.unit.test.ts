import { describe, expect, it } from 'vitest';
import { resolveCandidates, suggestionIds } from '../modules/trips/itinerary/candidates';
import { normalizeIntent } from '../modules/trips/itinerary/intent';
import { makeRecord, memStore, mumbaiPlaces } from './fixtures/itineraryPhase1Fixtures';

describe('candidate resolution (Phase 1)', () => {
  it('SELF_BUILD resolves exactly the selected set — no complements are ever added', async () => {
    const mumbai = mumbaiPlaces();
    const store = memStore([
      makeRecord({ id: 'mum-gateway', name: 'Gateway of India', category: 'landmark', lat: 18.9219, lng: 72.8346, city: 'Mumbai' }),
      makeRecord({ id: 'mum-museum', name: 'Museum', category: 'museum', lat: 18.9268, lng: 72.8325, city: 'Mumbai' }),
      makeRecord({ id: 'mum-seaweed', name: 'Bandra Bandstand', category: 'scenic', lat: 19.0368, lng: 72.8365, city: 'Mumbai', rating: 5 }),
    ]);
    const intent = normalizeIntent({
      destination: 'Mumbai',
      planningMode: 'SELF_BUILD',
      selectedPlaceIds: ['mum-gateway', 'mum-museum'],
    }).intent;

    const set = await resolveCandidates({ intent, store });
    expect(set.resolved.map((p) => p.id).sort()).toEqual(['mum-gateway', 'mum-museum']);
    expect(set.suggested).toHaveLength(0);
    expect(set.resolved.every((p) => p.state.selected)).toBe(true);
    void mumbai;
  });

  it('AI_BUILD resolves priority anchors and adds complementary destination pool', async () => {
    const store = memStore([
      makeRecord({ id: 'jpr-amber-fort', name: 'Amber Fort', category: 'fort', lat: 26.9855, lng: 75.8513, city: 'Jaipur', rating: 4.7 }),
      makeRecord({ id: 'jpr-hawa-mahal', name: 'Hawa Mahal', category: 'landmark', lat: 26.9239, lng: 75.8267, city: 'Jaipur', rating: 4.4 }),
      makeRecord({ id: 'jpr-city-palace', name: 'City Palace', category: 'palace', lat: 26.9258, lng: 75.8237, city: 'Jaipur', rating: 4.6 }),
    ]);
    const intent = normalizeIntent({
      destination: 'Jaipur',
      planningMode: 'AI_BUILD',
      priorityPlaceIds: ['jpr-amber-fort'],
    }).intent;

    const set = await resolveCandidates({ intent, store });
    const amber = set.resolved.find((p) => p.id === 'jpr-amber-fort');
    expect(amber).toBeDefined();
    expect(amber!.state.priorityAnchor).toBe(true);
    expect(set.resolved.length).toBe(3);
    expect(set.suggested.map((p) => p.id).sort()).toEqual(['jpr-city-palace', 'jpr-hawa-mahal']);
    expect(suggestionIds(set)).toHaveLength(2);
  });

  it('unresolvable explicit ids are dropped WITH disclosure, never silently', async () => {
    const store = memStore([
      makeRecord({ id: 'mum-gateway', name: 'Gateway of India', category: 'landmark', lat: 18.9219, lng: 72.8346, city: 'Mumbai' }),
    ]);
    const intent = normalizeIntent({
      destination: 'Mumbai',
      planningMode: 'SELF_BUILD',
      selectedPlaceIds: ['mum-gateway', 'mum-ghost'],
      priorityPlaceIds: ['mum-ghost'],
    }).intent;

    const set = await resolveCandidates({ intent, store });
    expect(set.resolved.map((p) => p.id)).toEqual(['mum-gateway']);
    expect(set.dropped).toHaveLength(0);
    // Explicit-but-missing ids surface as warnings (not hard plans).
    expect(set.warnings.some((w) => w.code === 'PRIORITY_PLACE_UNRESOLVED' && w.placeIds?.includes('mum-ghost'))).toBe(true);
  });

  it('excludePlaceIds are honoured everywhere (explicit and pool)', async () => {
    const store = memStore([
      makeRecord({ id: 'mum-gateway', name: 'Gateway of India', category: 'landmark', lat: 18.9219, lng: 72.8346, city: 'Mumbai' }),
      makeRecord({ id: 'mum-other', name: 'Chhatrapati Terminus', category: 'landmark', lat: 18.9398, lng: 72.8355, city: 'Mumbai' }),
    ]);
    const intent = normalizeIntent({
      destination: 'Mumbai',
      planningMode: 'AI_BUILD',
      priorityPlaceIds: ['mum-gateway'],
      excludePlaceIds: ['mum-other'],
    }).intent;
    const set = await resolveCandidates({ intent, store });
    expect(set.resolved.map((p) => p.id)).toEqual(['mum-gateway']);
  });

  it('explicit rows always win a location cluster (never outvoted by rating)', async () => {
    const store = memStore([
      {
        ...makeRecord({ id: 'explicit', name: 'Gateway of India', category: 'landmark', lat: 18.9219, lng: 72.8346, city: 'Mumbai', rating: 3.0 }),
      },
      makeRecord({ id: 'pool-dupe', name: 'Gateway of India Viewpoint', category: 'landmark', lat: 18.9220, lng: 72.8345, city: 'Mumbai', rating: 5.0 }),
    ]);
    const intent = normalizeIntent({
      destination: 'Mumbai',
      planningMode: 'AI_BUILD',
      priorityPlaceIds: ['explicit'],
    }).intent;
    const set = await resolveCandidates({ intent, store });
    const ids = set.resolved.map((p) => p.id);
    expect(ids).toContain('explicit');
    expect(ids).not.toContain('pool-dupe');
    expect(set.dropped.some((d) => d.placeId === 'pool-dupe' && d.reason === 'DUPLICATE_LOCATION')).toBe(true);
  });

  it('state flags are derived from intent (locked + fixed + priority)', async () => {
    const store = memStore([
      makeRecord({ id: 'jpr-amber-fort', name: 'Amber Fort', category: 'fort', lat: 26.9855, lng: 75.8513, city: 'Jaipur' }),
      makeRecord({ id: 'jpr-nahargarh', name: 'Nahargarh Fort', category: 'fort', lat: 26.9377, lng: 75.8464, city: 'Jaipur' }),
    ]);
    const intent = normalizeIntent({
      destination: 'Jaipur',
      planningMode: 'SELF_BUILD',
      selectedPlaceIds: ['jpr-amber-fort', 'jpr-nahargarh'],
      lockedPlaceIds: ['jpr-amber-fort'],
      fixedTimePlaces: [{ placeId: 'jpr-nahargarh', startTime: '17:30' }],
    }).intent;
    const set = await resolveCandidates({ intent, store });
    const byId = new Map(set.resolved.map((p) => [p.id, p]));
    expect(byId.get('jpr-amber-fort')!.state.lockedPosition).toBe(true);
    expect(byId.get('jpr-amber-fort')!.state.pinned).toBe(false);
    expect(byId.get('jpr-nahargarh')!.state.fixedTime).toBe(true);
    expect(byId.get('jpr-nahargarh')!.state.selected).toBe(true);
  });

  it('empty SELF_BUILD returns a warning and no candidates', async () => {
    const store = memStore([]);
    const intent = normalizeIntent({ destination: 'Mumbai', planningMode: 'SELF_BUILD' }).intent;
    const set = await resolveCandidates({ intent, store });
    expect(set.resolved).toHaveLength(0);
    expect(set.warnings.some((w) => w.code === 'EMPTY_SELF_BUILD')).toBe(true);
  });
});