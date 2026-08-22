import { TravelPace, TimePreference } from '@prisma/client';

/**
 * Deterministic natural-language intent parsing for itinerary refinement.
 *
 * Converts free-text requests ("Make Day 2 less busy", "Start after 10 AM",
 * "Add more nature", "Remove Bhedaghat") into STRUCTURED changes that are
 * applied by the deterministic itinerary engine. This module never touches
 * the database and never invents places — it only classifies user intent.
 *
 * Signals expressed in the same sentence as a day reference ("Make Day 2
 * less busy") are attributed as DAY-SCOPED; signals in other sentences are
 * GLOBAL. AI (Gemini) remains a polish layer; this parser is pure regex so
 * behavior is predictable, testable, and safe as the sole interpreter when
 * no key is configured.
 */

export interface ParsedTripIntent {
  /** GLOBAL pace override, e.g. "make the trip slower" -> RELAXED. */
  pace?: TravelPace;
  /** Pace expressed inside the day-target sentence ("Make Day 2 less busy"). */
  dayScopedPace?: TravelPace;
  /** GLOBAL budget tier hint, e.g. "make it cheaper" -> LOW. */
  budgetTier?: 'LOW' | 'MEDIUM' | 'HIGH';
  /** Budget hint expressed inside the day-target sentence ("make day 3 cheaper"). */
  dayScopedBudgetTier?: 'LOW' | 'MEDIUM' | 'HIGH';
  /** GLOBAL interest keys merged into the request interests. */
  interests: string[];
  /** Morning/evening preference hint (always global). */
  timePreference?: TimePreference;
  /** "Start after 10 AM" -> earliest allowed day-start minutes (clamped 05:00-18:00). */
  earliestStartMinutes?: number;
  /**
   * Day-scoped change target like "Make Day 2 less busy". Only extracted when
   * the sentence pairs a day reference with an explicit change word so
   * descriptive mentions ("good for day 2") never trigger it.
   */
  targetDayNumber?: number;
  /** Place-name fragments to remove/replace, e.g. "Remove Bhedaghat". */
  removeHints: string[];
}

/** Canonical interest keys — must match INTEREST_CATEGORY_MAP in itineraryEngine.ts. */
const KNOWN_INTERESTS = new Set([
  'temples', 'heritage', 'history', 'waterfalls', 'nature', 'food',
  'adventure', 'shopping', 'hidden gems', 'hidden_gems',
  'local culture', 'local_culture',
]);

const INTEREST_PATTERNS: Array<{ key: string; pattern: RegExp }> = [
  { key: 'nature', pattern: /\b(nature|natural(?!ly)|greenery|green spots?|parks?|gardens?|lakes?|scenic)\b/i },
  { key: 'waterfalls', pattern: /\b(waterfalls?|falls?)\b/i },
  { key: 'temples', pattern: /\b(temples?|mandirs?|spiritual|pilgrimage|religious places?)\b/i },
  { key: 'heritage', pattern: /\b(heritage|forts?|palaces?|monuments?)\b/i },
  { key: 'history', pattern: /\b(history|historical|museums?)\b/i },
  { key: 'food', pattern: /\b(food|foods|foodie|eat|eating|cuisine|street food|restaurants?|cafes?|local dishes?)\b/i },
  { key: 'adventure', pattern: /\b(adventure(s)?|adventurous|treks?|trekking|hikes?|hiking|wildlife)\b/i },
  { key: 'shopping', pattern: /\b(shopping|shop|bazaars?|souvenirs?)\b/i },
  { key: 'hidden gems', pattern: /\b(hidden gems?|offbeat|off the beaten (path|track)|undiscovered|lesser[- ]known|secret spots?)\b/i },
  { key: 'local culture', pattern: /\b(culture|cultural|local life|authentic experiences?|traditions?)\b/i },
];

function detectPace(text: string): TravelPace | undefined {
  if (/\b(very relaxed|super chill|super relaxed|minimal stops|as slow as possible|take it very easy)\b/i.test(text)) {
    return 'VERY_RELAXED';
  }
  if (/\b(less busy|fewer stops|less crowded days?|slower pace|slow down|relax(ed)?|take it easy|not rushed|unhurried|easier days?)\b/i.test(text)) {
    return 'RELAXED';
  }
  if (/\b(pack as much|see as much|see more|more stops|fast[- ]paced|action[- ]packed|maximi[sz]e (my |the |our )?(time|day)|cover more)\b/i.test(text)) {
    return 'QUICK';
  }
  return undefined;
}

function detectBudgetTier(text: string): 'LOW' | 'MEDIUM' | 'HIGH' | undefined {
  if (/\b(cheap(er)?|save money|budget[- ]friendly|low budget|tight budget|spend less|free things?|no entry fees?)\b/i.test(text)) {
    return 'LOW';
  }
  if (/\b(luxur(y|ious)|premium|high[- ]end|splurge|upscale|5[- ]star)\b/i.test(text)) {
    return 'HIGH';
  }
  return undefined;
}

function detectTimePreference(text: string): TimePreference | undefined {
  if (/\b(evening (?:persons?|people)|prefer evenings?|evenings? (are|is) better|more of an evening|night ?owl)\b/i.test(text)) {
    return 'EVENING_FRIENDLY';
  }
  if (/\b(early (start|morning|risers?)|sunrise start|first thing in the morning|start (at|by) sunrise)\b/i.test(text)) {
    return 'MORNING_FOCUSED';
  }
  return undefined;
}

function detectEarliestStartMinutes(text: string): number | undefined {
  // Explicit clock time: "start after 10", "start after 10:30 am", "not before 9 am".
  const clockMatch = text.match(
    /\b(?:start|begin(?:ning)?)\s+(?:after|post|not\s+before|no\s+earlier\s+than)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i,
  ) || text.match(/\b(?:after|not before)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (clockMatch) {
    let hour = parseInt(clockMatch[1], 10);
    const minute = clockMatch[2] ? parseInt(clockMatch[2], 10) : 0;
    const meridiem = (clockMatch[3] || '').toLowerCase();
    if (Number.isNaN(hour)) return undefined;
    if (meridiem === 'pm' && hour < 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
    const minutes = hour * 60 + minute;
    return Math.max(5 * 60, Math.min(18 * 60, minutes));
  }
  if (/\b(late starts?|lazy mornings?|slow mornings?|leisurely mornings?|not a morning person|don't want early mornings?|no early mornings?)\b/i.test(text)) {
    return 10 * 60; // 10:00 AM
  }
  return undefined;
}

const CHANGE_INTENT_RE = /\b(make|redo|replan|regenerate|rebuild|rework|change|replace|less busy|relax|easier|slower|cheaper|shorter|longer|better|lighter|fuller|busier)\b/i;

const HINT_STOPWORDS = new Set([
  'the', 'a', 'an', 'this', 'that', 'these', 'those', 'it', 'its', 'them',
  'place', 'places', 'stop', 'stops', 'spot', 'spots', 'attraction', 'attractions',
  'one', 'all', 'everything', 'anything', 'something', 'trip', 'itinerary', 'day',
  'from', 'and', 'or', 'please', 'my', 'our',
]);

function cleanHint(raw: string): string | null {
  let hint = raw.trim().toLowerCase();
  // Strip leading articles/filler.
  hint = hint.replace(/^(the|a|an|this|that|these|those)\s+/i, '');
  // Strip trailing filler like "place from the trip".
  hint = hint.replace(/\s+(?:from|on|in|of)\s+.*$/i, '');
  hint = hint.replace(/\s+(?:place|places|stop|stops)$/i, '');
  hint = hint.replace(/[?.!]+$/g, '').trim();
  if (!hint) return null;
  const hasContent = hint
    .split(/\s+/)
    .some((w) => !HINT_STOPWORDS.has(w) && w.replace(/[^a-z0-9]/gi, '').length >= 3);
  if (!hasContent) return null;
  return hint;
}

function detectRemoveHints(text: string): string[] {
  const hints: string[] = [];
  const pattern = /\b(remove|drop|skip|delete|exclude|take out|leave out|cut|replace)\s+(?:out\s+)?(?:the\s+|a\s+|an\s+|this\s+|that\s+)?([a-z0-9'&.\-\s]{3,60}?)(?=\s+(?:from|and|then|because|please|with|for)\b|[.,;!?\n]|$)/gi;
  for (const match of text.matchAll(pattern)) {
    const cleaned = cleanHint(match[2]);
    // Pronoun-only removals ("remove this place") carry no resolvable name.
    if (cleaned && /[a-z]{3}/i.test(cleaned) && !/^(it|them|all|everything|that place|this place)$/.test(cleaned)) {
      hints.push(cleaned);
    }
  }
  return hints;
}

export function parseTripIntent(prompt: string | null | undefined): ParsedTripIntent {
  const intent: ParsedTripIntent = { interests: [], removeHints: [] };
  if (!prompt || typeof prompt !== 'string') return intent;

  const text = prompt.slice(0, 2000); // mirror aiGenerateSchema max length

  intent.removeHints = detectRemoveHints(text);

  // Sentence-level attribution: signals riding on the same sentence as the
  // day reference are DAY-scoped; all other sentences carry GLOBAL signals.
  const sentences = text.split(/[.!?\n;]+/).map((s) => s.trim()).filter(Boolean);
  const globalSentences: string[] = [];
  let daySentence: string | undefined;
  for (const sentence of sentences) {
    const dayMatch = sentence.match(/\bday\s*(\d{1,2})\b/i);
    if (dayMatch && CHANGE_INTENT_RE.test(sentence) && !intent.targetDayNumber) {
      const n = parseInt(dayMatch[1], 10);
      if (n >= 1 && n <= 21) {
        intent.targetDayNumber = n;
        daySentence = sentence;
        continue;
      }
    }
    globalSentences.push(sentence);
  }

  if (daySentence) {
    intent.dayScopedPace = detectPace(daySentence);
    intent.dayScopedBudgetTier = detectBudgetTier(daySentence);
  }

  const globalText = globalSentences.join('. ') || '';
  intent.pace = detectPace(globalText);
  intent.budgetTier = detectBudgetTier(globalText);
  // Time hints and interests are additive/global by nature ("Add more nature
  // AND make Day 2 less busy") — they are detected over the full prompt.
  intent.timePreference = detectTimePreference(text);
  intent.earliestStartMinutes = detectEarliestStartMinutes(text);

  for (const { key, pattern } of INTEREST_PATTERNS) {
    if (pattern.test(text) && KNOWN_INTERESTS.has(key)) {
      intent.interests.push(key);
    }
  }

  return intent;
}

/**
 * True when the parsed intent carries any GLOBAL signal (pace/budget/time/
 * interests). Used to decide whether a detected day target should scope the
 * regeneration to a single day — day-scoped pace/budget do not count because
 * they only make sense together with that day.
 */
export function hasGlobalIntentSignals(intent: ParsedTripIntent): boolean {
  return !!(
    intent.pace
    || intent.budgetTier
    || intent.timePreference
    || intent.earliestStartMinutes != null
    || intent.interests.length > 0
  );
}
