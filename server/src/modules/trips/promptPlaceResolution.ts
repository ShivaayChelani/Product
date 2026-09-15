/**
 * Prompt place-mention -> approved place resolution (Phase 5).
 *
 * extractPlaceNameCandidates (tripIntentParser) yields proper-noun phrases the
 * user asked to include ("Must visit Amber Fort"). This module resolves those
 * phrases against the destination pool WITHOUT trusting the prompt as a source
 * of ids/coordinates: a mention resolves only if an approved place record in
 * the destination matches by name/tag. Unmatched mentions are returned so the
 * caller can disclose them as warnings. Pure — no Prisma, no network.
 */

import { extractPlaceNameCandidates } from './tripIntentParser';
import { extractMustVisitHints } from '../../shared/utils/destination';

export interface MentionResolvableRecord {
  id: string;
  name: string;
  tags?: readonly string[];
}

/** Lowercase, accent-stripped, space-separated name key for fuzzy equality. */
export function placeNameKey(raw: string): string {
  return String(raw ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function recordNameKey(record: MentionResolvableRecord): { key: string; words: number } {
  const key = placeNameKey(record.name);
  return { key, words: key.split(' ').filter(Boolean).length };
}

const LEADING_INTENT_WORD = /^(must|should|please|definitely|also|then)\s+/i;

/**
 * Union of structured "must visit X" mentions and free-text landmark chunks,
 * with leading intent words stripped so "Must Marble Rocks" still matches
 * "Marble Rocks". Never invents names — phrases are clues only.
 */
export function collectPromptPlaceHints(
  prompt: string | null | undefined,
  destination = '',
): string[] {
  const raw = [
    ...extractPlaceNameCandidates(prompt),
    ...extractMustVisitHints(prompt, destination),
  ];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const phrase of raw) {
    let cleaned = String(phrase || '').trim();
    while (LEADING_INTENT_WORD.test(cleaned)) {
      cleaned = cleaned.replace(LEADING_INTENT_WORD, '').trim();
    }
    if (cleaned.length < 3) continue;
    const key = placeNameKey(cleaned);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out.slice(0, 12);
}

export interface PromptMentionResolution {
  /** Approved place ids that matched, in candidate order (deduped). */
  placeIds: string[];
  /** Original phrases that matched nothing — disclose to the user. */
  unresolved: string[];
}

/**
 * Match mention phrases against approved destination records. Single-word
 * phrases require an exact name match. Multi-word phrases also allow the
 * phrase to sit inside a longer display name ("amber fort" in
 * "Amber Fort (Amer)") or vice versa, and may equal a distinctive multi-word
 * tag ("hidden gem"). Bare single-word tags (fort, palace...) never pin an
 * anchor. Never invents records.
 */
export function resolvePromptPlaceMentions(
  candidates: readonly string[],
  records: readonly MentionResolvableRecord[],
): PromptMentionResolution {
  const placeIds: string[] = [];
  const unresolved: string[] = [];

  const indexed = records.map((record) => ({ record, key: recordNameKey(record) }));

  for (const candidate of candidates) {
    if (!candidate) continue;
    const cKey = placeNameKey(candidate);
    if (!cKey) {
      unresolved.push(candidate);
      continue;
    }
    const cWords = cKey.split(' ').filter(Boolean).length;

    let matched: MentionResolvableRecord | undefined;
    for (let pass = 0; pass < 3 && !matched; pass++) {
      for (const { record, key } of indexed) {
        if (pass === 0 && key.key === cKey) {
          matched = record; // exact name match wins.
          break;
        }
        if (
          pass === 1 &&
          (record.tags ?? []).some((t) => {
            const tagKey = placeNameKey(t);
            return tagKey.split(' ').filter(Boolean).length >= 2 && tagKey === cKey;
          })
        ) {
          matched = record;
          break;
        }
        if (pass === 2) {
          // Multi-word phrases may also sit inside a longer display name or
          // vice versa; single-word phrases never substring-match a name.
          if (cWords >= 2 && (key.key.includes(cKey) || (key.words >= 2 && cKey.includes(key.key)))) {
            matched = record;
            break;
          }
        }
      }
    }

    if (matched && !placeIds.includes(matched.id)) {
      placeIds.push(matched.id);
    } else if (!matched) {
      unresolved.push(candidate);
    }
  }

  return { placeIds, unresolved };
}