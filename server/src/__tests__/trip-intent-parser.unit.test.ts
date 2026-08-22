import { describe, expect, it } from 'vitest';
import { parseTripIntent, hasGlobalIntentSignals } from '../modules/trips/tripIntentParser';

describe('tripIntentParser (deterministic NL intent)', () => {
  it('returns an empty intent for empty/missing prompts', () => {
    expect(parseTripIntent(null)).toEqual({ interests: [], removeHints: [] });
    expect(parseTripIntent('')).toEqual({ interests: [], removeHints: [] });
    const empty = parseTripIntent('Just a normal trip');
    expect(empty.pace).toBeUndefined();
    expect(empty.budgetTier).toBeUndefined();
    expect(empty.targetDayNumber).toBeUndefined();
  });

  it('detects relaxed pace requests', () => {
    expect(parseTripIntent('Make it less busy please').pace).toBe('RELAXED');
    expect(parseTripIntent('We want a relaxed trip').pace).toBe('RELAXED');
    expect(parseTripIntent('Take it easy, we are tired').pace).toBe('RELAXED');
    expect(parseTripIntent('very relaxed, minimal stops').pace).toBe('VERY_RELAXED');
  });

  it('detects faster pace requests', () => {
    expect(parseTripIntent('Pack as much as possible into each day').pace).toBe('QUICK');
    expect(parseTripIntent('fast-paced trip please').pace).toBe('QUICK');
  });

  it('does not false-positive pace on neutral text', () => {
    expect(parseTripIntent('Visit Bheraghat and Marble Rocks').pace).toBeUndefined();
  });

  it('detects cheaper / luxury budget hints', () => {
    expect(parseTripIntent('Make this day cheaper').budgetTier).toBe('LOW');
    expect(parseTripIntent('We want to save money on tickets').budgetTier).toBe('LOW');
    expect(parseTripIntent('Looking for a luxury experience').budgetTier).toBe('HIGH');
  });

  it('maps natural phrases to canonical interests', () => {
    expect(parseTripIntent('Add more nature').interests).toContain('nature');
    expect(parseTripIntent('Add a food experience').interests).toContain('food');
    expect(parseTripIntent('show me some hidden gems').interests).toContain('hidden gems');
    expect(parseTripIntent('more temples please').interests).toContain('temples');
    expect(parseTripIntent('Add another activity with waterfalls').interests).toContain('waterfalls');
  });

  it('parses explicit start times', () => {
    expect(parseTripIntent('Start after 10 AM').earliestStartMinutes).toBe(600);
    expect(parseTripIntent('start after 11:30 am').earliestStartMinutes).toBe(690);
    expect(parseTripIntent('Start after 2 pm').earliestStartMinutes).toBe(840);
    expect(parseTripIntent('lazy mornings, no rush').earliestStartMinutes).toBe(600);
  });

  it('clamps unreasonable start times', () => {
    const intent = parseTripIntent('start after 23');
    expect(intent.earliestStartMinutes).toBeLessThanOrEqual(18 * 60);
  });

  it('detects evening preference', () => {
    expect(parseTripIntent("we're evening people").timePreference).toBe('EVENING_FRIENDLY');
    expect(parseTripIntent('prefer evenings please').timePreference).toBe('EVENING_FRIENDLY');
    expect(parseTripIntent('early risers, start at sunrise').timePreference).toBe('MORNING_FOCUSED');
  });

  it('extracts day-scoped change requests', () => {
    expect(parseTripIntent('Make Day 2 less busy').targetDayNumber).toBe(2);
    expect(parseTripIntent('make day 3 easier').targetDayNumber).toBe(3);
    // Descriptive day mentions must NOT trigger scoping.
    expect(parseTripIntent('day 2 was nice last time').targetDayNumber).toBeUndefined();
    expect(parseTripIntent('I loved Day 4 of my last trip').targetDayNumber).toBeUndefined();
  });

  it('flags global signals so day-scoping is skipped when they exist', () => {
    const combined = parseTripIntent('Add more nature and make day 2 less busy');
    expect(combined.targetDayNumber).toBe(2);
    expect(hasGlobalIntentSignals(combined)).toBe(true);

    const dayOnly = parseTripIntent('Make Day 2 less busy');
    expect(dayOnly.targetDayNumber).toBe(2);
    expect(hasGlobalIntentSignals(dayOnly)).toBe(false);
  });

  it('mixed intent: pace rides with the day reference, time stays global', () => {
    // "Make Day 2 less busy" + "start after 10 AM" in one request — the pace
    // belongs to the day-scope, the start time is a whole-trip constraint.
    const mixed = parseTripIntent('Make Day 2 less busy. Also start after 10 AM.');
    expect(mixed.targetDayNumber).toBe(2);
    expect(mixed.dayScopedPace).toBe('RELAXED');
    expect(mixed.pace).toBeUndefined();
    expect(mixed.earliestStartMinutes).toBe(600);
    // Global start time means scoping must be skipped by the service layer.
    expect(hasGlobalIntentSignals(mixed)).toBe(true);
  });

  it('explicit regenerateDayNumber outranks NL day targets (service contract)', () => {
    // The service applies: input.regenerateDayNumber > intent.targetDayNumber.
    // Parser only reports what the text asked; this test locks that reporting.
    const explicit = parseTripIntent('make day 3 cheaper');
    expect(explicit.targetDayNumber).toBe(3);
    expect(explicit.dayScopedBudgetTier).toBe('LOW');
    expect(explicit.budgetTier).toBeUndefined();
  });

  it('unknown/neutral prompts produce no signals (no fabrication)', () => {
    const none = parseTripIntent('thanks!');
    expect(none.pace).toBeUndefined();
    expect(none.budgetTier).toBeUndefined();
    expect(none.timePreference).toBeUndefined();
    expect(none.earliestStartMinutes).toBeUndefined();
    expect(none.targetDayNumber).toBeUndefined();
    expect(none.removeHints).toEqual([]);
    expect(none.interests).toEqual([]);
  });

  it('extracts remove hints with place names', () => {
    expect(parseTripIntent('Remove Bhedaghat from the trip').removeHints).toContain('bhedaghat');
    expect(parseTripIntent('skip Dhuandhar Falls please').removeHints).toContain('dhuandhar falls');
    expect(parseTripIntent('replace the marble rocks with something else').removeHints).toContain('marble rocks');
  });

  it('ignores pronoun-only removals that cannot be resolved', () => {
    const intent = parseTripIntent('Remove this place');
    expect(intent.removeHints).toEqual([]);
  });
});
