import {
  canonicalAiBuildEnabled,
  shouldUseCanonicalAiBuild,
  toAiBuildPlanInput,
} from '../features/aiTripPlanner/canonicalAiBuild';
import { ITINERARY_ENGINE_CONFIG } from '../config/itineraryEngine';

function makeInput(overrides: Record<string, any> = {}) {
  return {
    destination: 'Jaipur',
    days: 3,
    pace: 'BALANCED',
    travelers: 'COUPLE',
    budget: 'CUSTOM',
    customBudgetAmount: 12000,
    interests: ['heritage', 'food'],
    avoid: ['CROWDED'],
    transportation: ['CAR'],
    timePreference: 'FULL_DAY',
    prompt: 'Must visit Amber Fort, don\u2019t miss Hawa Mahal',
    ...overrides,
  } as any;
}

describe('Phase 5 canonical AI build client glue', () => {
  beforeEach(() => {
    ITINERARY_ENGINE_CONFIG.canonicalAiBuildEnabled = false;
  });

  afterEach(() => {
    ITINERARY_ENGINE_CONFIG.canonicalAiBuildEnabled = false;
  });

  it('flag defaults OFF so legacy ai-generate keeps its behavior', () => {
    expect(canonicalAiBuildEnabled()).toBe(false);
    expect(shouldUseCanonicalAiBuild({})).toBe(false);
    expect(shouldUseCanonicalAiBuild({ useCanonicalAiBuild: false })).toBe(false);
  });

  it('explicit navigation param routes to canonical AI_BUILD', () => {
    expect(shouldUseCanonicalAiBuild({ useCanonicalAiBuild: true })).toBe(true);
  });

  it('client config flag routes every invocation to canonical AI_BUILD', () => {
    ITINERARY_ENGINE_CONFIG.canonicalAiBuildEnabled = true;
    expect(shouldUseCanonicalAiBuild({})).toBe(true);
  });

  it('maps the legacy payload onto /trips/plan mode AI_BUILD', () => {
    const input = makeInput();
    const plan = toAiBuildPlanInput(input);
    expect(plan.mode).toBe('AI_BUILD');
    expect(plan.destination).toBe('Jaipur');
    expect(plan.days).toBe(3);
    expect(plan.pace).toBe('BALANCED');
    expect(plan.travelers).toBe('COUPLE');
    expect(plan.budget).toBe('CUSTOM');
    expect(plan.customBudgetAmount).toBe(12000);
    expect(plan.interests).toEqual(['heritage', 'food']);
    expect(plan.avoid).toEqual(['CROWDED']);
    expect(plan.transportation).toEqual(['CAR']);
    expect(plan.timePreference).toBe('FULL_DAY');
    expect(plan.prompt).toContain('Amber Fort');
  });

  it('forwards regeneration and trip metadata for regen calls', () => {
    const plan = toAiBuildPlanInput(
      makeInput({ tripId: 'trip-7', regenerateDayNumber: 2, variationSeed: 3, refresh: true }),
    );
    expect(plan.tripId).toBe('trip-7');
    expect(plan.regenerateDayNumber).toBe(2);
    expect(plan.variationSeed).toBe(3);
    expect(plan.refresh).toBe(true);
  });

  it('drops undefined/empty fields instead of sending garbage', () => {
    const plan = toAiBuildPlanInput(makeInput({ displaySkipped: undefined, plusCode: '' }));
    expect(Object.prototype.hasOwnProperty.call(plan, 'displaySkipped')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(plan, 'plusCode')).toBe(false);
  });

  it('never invents ids or coordinates client-side', () => {
    const plan = toAiBuildPlanInput(makeInput());
    expect(plan.selectedPlaceIds).toBeUndefined();
    expect(plan.pinnedPlaceIds).toBeUndefined();
    expect(plan.lockedPlaceIds).toBeUndefined();
    expect(plan.origin).toBeUndefined();
    expect(plan.mode).toBe('AI_BUILD');
  });

  it('maps manualPlaceIds onto selectedPlaceIds so server priorities user picks (BUG 2)', () => {
    const plan = toAiBuildPlanInput(makeInput({ manualPlaceIds: ['q-amber', 'q-hawa'] }));
    expect(plan.selectedPlaceIds).toEqual(['q-amber', 'q-hawa']);
    expect(plan.mode).toBe('AI_BUILD');
  });

  it('does not send selectedPlaceIds when the user picked nothing', () => {
    const plan = toAiBuildPlanInput(makeInput());
    expect(Object.prototype.hasOwnProperty.call(plan, 'selectedPlaceIds')).toBe(false);
  });
});