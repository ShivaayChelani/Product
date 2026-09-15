/**
 * Unit tests for Phase 5 prompt place-mention resolution against approved
 * destination records. Pure and DB-free: resolution never invents places, and
 * unresolved mentions are always surfaced for disclosure.
 */

import { describe, it, expect } from 'vitest';
import { placeNameKey, resolvePromptPlaceMentions, collectPromptPlaceHints, type MentionResolvableRecord } from '../modules/trips/promptPlaceResolution';

function record(id: string, name: string, tags: string[] = []): MentionResolvableRecord {
  return { id, name, tags };
}

const JAIPUR = [
  record('r1', 'Amber Fort (Amer)', ['heritage', 'fort']),
  record('r2', 'Amber Fort', ['heritage', 'fort']),
  record('r3', 'Hawa Mahal', ['heritage', 'landmark']),
  record('r4', 'City Palace', ['heritage', 'palace']),
];

describe('placeNameKey', () => {
  it('normalizes case, diacritics, and separators', () => {
    expect(placeNameKey('  Hawa Mahal ')).toBe('hawa mahal');
    expect(placeNameKey('Café Rêve')).toBe('cafe reve');
    expect(placeNameKey('Johns  & Sons')).toBe('johns sons');
  });
});

describe('resolvePromptPlaceMentions', () => {
  it('resolves exact name matches', () => {
    const { placeIds, unresolved } = resolvePromptPlaceMentions(['hawa mahal'], JAIPUR);
    expect(placeIds).toEqual(['r3']);
    expect(unresolved).toEqual([]);
  });

  it('resolves a phrase inside a longer display name', () => {
    const { placeIds } = resolvePromptPlaceMentions(['amber fort'], JAIPUR);
    // First record whose normalized name contains the phrase wins.
    expect(placeIds).toEqual(['r2']);
    expect(JAIPUR.find((r) => r.id === 'r2')!.name).toBe('Amber Fort');
  });

  it('resolves a longer name inside the phrase (parenthetical dropped)', () => {
    const { placeIds } = resolvePromptPlaceMentions(['amber fort in jaipur'], JAIPUR);
    expect(placeIds).toEqual(['r2']);
  });

  it('resolves multi-word tags', () => {
    const { placeIds } = resolvePromptPlaceMentions(['hidden gem'], [record('r9', 'Some Street', ['hidden gem'])]);
    expect(placeIds).toEqual(['r9']);
  });

  it('does NOT resolve a bare single-word generic against a longer name', () => {
    // Single-word phrases require an exact name/tag match — "fort" can't match Amber Fort.
    const { placeIds, unresolved } = resolvePromptPlaceMentions(['fort'], JAIPUR);
    expect(placeIds).toEqual([]);
    expect(unresolved).toEqual(['fort']);
  });

  it('dedupes matches across candidates', () => {
    const { placeIds } = resolvePromptPlaceMentions(['amber fort', 'Amber Fort of Amer'], JAIPUR);
    expect(placeIds).toEqual(['r2']);
  });

  it('reports unmatched mentions so the user is told', () => {
    const { placeIds, unresolved } = resolvePromptPlaceMentions(['hawa mahal', 'totally fake site'], JAIPUR);
    expect(placeIds).toEqual(['r3']);
    expect(unresolved).toEqual(['totally fake site']);
  });

  it('never invents records — only ids from supplied records come back', () => {
    const { placeIds } = resolvePromptPlaceMentions(['aaaa bbbb cccc'], JAIPUR);
    expect(placeIds).toEqual([]);
  });

  it('matches nothing for empty candidates', () => {
    expect(resolvePromptPlaceMentions([], JAIPUR)).toEqual({ placeIds: [], unresolved: [] });
  });
});

describe('collectPromptPlaceHints (live engine pins)', () => {
  it('keeps both places from a Must visit X and Y prompt', () => {
    const hints = collectPromptPlaceHints(
      'Must visit Marble Rocks and Dhuandhar Falls',
      'Jabalpur',
    );
    const keys = hints.map(placeNameKey);
    expect(keys.some((k) => k.includes('marble'))).toBe(true);
    expect(keys.some((k) => k.includes('dhuandhar'))).toBe(true);
  });

  it('resolves those hints against approved destination records (never invents ids)', () => {
    const records = [
      record('m1', 'Marble Rocks'),
      record('d1', 'Dhuandhar Falls'),
    ];
    const hints = collectPromptPlaceHints('Must visit Marble Rocks and Dhuandhar Falls', 'Jabalpur');
    const { placeIds, unresolved } = resolvePromptPlaceMentions(hints, records);
    expect(placeIds.sort()).toEqual(['d1', 'm1']);
    expect(unresolved).toEqual([]);
  });
});