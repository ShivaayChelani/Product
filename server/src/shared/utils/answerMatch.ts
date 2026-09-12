/**
 * Conservative answer matching for Treasure Hunt riddles.
 *
 * The rule is deliberately strict so "looks right" is never enough — a wrong
 * but similar-sounding answer must NOT pass, while a genuine one-word typo
 * should. The same rule applies to English and Hindi input (any Unicode
 * script), and there is no auto-translation: English answers match against
 * `answerEnglish`, Hindi answers against `answerHindi`, nothing else.
 *
 * The rule, in order:
 *
 *  1. Normalize both sides: lowercase, strip punctuation/symbols (Unicode
 *     aware, so Devanagari and other scripts survive), collapse whitespace,
 *     trim. A normalized exact match is a correct answer.
 *  2. Tokenize on whitespace. The token count must be identical — missing
 *     words, extra words and partial answers are rejected outright
 *     ("Madan" is NOT accepted for "Madan Mahal").
 *  3. At most ONE token may differ, and only when it is a small typo:
 *     Levenshtein distance <= 1, or distance <= 2 when the longer token is at
 *     least MIN_LONG_TYPO_LEN characters (allows a single transposition in a
 *     longer word). More than one differing token is always rejected.
 *  4. Tokens shorter than MIN_TOKEN_LEN never tolerate a typo (too easy to
 *     'correct' the answer into something else).
 *
 * Examples:
 *   accepted  "Victora Memorial"  vs "Victoria Memorial"   (1 token, dist 1)
 *   accepted  "Madan Mahaal"      vs "Madan Mahal"         (1 token, dist 1)
 *   accepted  "VICTORIA  MEMORIAL." vs "Victoria Memorial" (normalization)
 *   rejected  "Madan"             vs "Madan Mahal"         (missing word)
 *   rejected  "Bhopal"            vs "Madan Mahal"         (unrelated)
 *   rejected  "Gateway of India"  vs "Victoria Memorial"   (unrelated)
 *   rejected  "Mandan Mahaal"     vs "Madan Mahal"         (2 tokens differ)
 */

/** Tokens at or above this length may tolerate a typo. */
const MIN_TOKEN_LEN = 3;

/** Longer tokens may tolerate a 2-edit distance (e.g. one transposition). */
const MIN_LONG_TYPO_LEN = 6;
const LONG_TYPO_DIST = 2;
const SHORT_TYPO_DIST = 1;

/** Lowercase, strip symbols/punctuation (keep letters, digits, combining
 *  marks such as Devanagari vowel signs, and spaces), collapse, trim. */
export function normalizeAnswerText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\u00a0/g, ' ')
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Classic dynamic-programming Levenshtein edit distance (Unicode code points). */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  if (m > n) return levenshteinDistance(b, a);
  let prev = new Array<number>(m + 1);
  let curr = new Array<number>(m + 1);
  for (let i = 0; i <= m; i++) prev[i] = i;
  for (let j = 1; j <= n; j++) {
    curr[0] = j;
    for (let i = 1; i <= m; i++) {
      const sub = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[i] = Math.min(prev[i] + 1, curr[i - 1] + 1, prev[i - 1] + sub);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[m];
}

/** Single-token fuzzy rule: only a small typo passes. */
function tokenMatches(user: string, expected: string): boolean {
  if (user === expected) return true;
  if (expected.length < MIN_TOKEN_LEN) return false;
  const maxLen = Math.max(user.length, expected.length);
  const dist = levenshteinDistance(user, expected);
  const limit = maxLen >= MIN_LONG_TYPO_LEN ? LONG_TYPO_DIST : SHORT_TYPO_DIST;
  return dist > 0 && dist <= limit;
}

/** Decide whether a user's answer matches the expected answer. */
export function isAnswerMatch(userAnswer: string, expectedAnswer: string): boolean {
  const user = normalizeAnswerText(userAnswer);
  const expected = normalizeAnswerText(expectedAnswer);
  if (user === expected) return true;

  const userTokens = user.split(' ');
  const expectedTokens = expected.split(' ').filter((t) => t.length > 0);
  const userFiltered = userTokens.filter((t) => t.length > 0);
  if (userFiltered.length !== expectedTokens.length) return false;

  let differingTokens = 0;
  for (let i = 0; i < expectedTokens.length; i++) {
    if (userFiltered[i] === expectedTokens[i]) continue;
    if (!tokenMatches(userFiltered[i], expectedTokens[i])) return false;
    differingTokens++;
  }
  return differingTokens <= 1;
}