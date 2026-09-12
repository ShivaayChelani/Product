import { describe, expect, it } from 'vitest';
import { isAnswerMatch, normalizeAnswerText, levenshteinDistance } from '../../src/shared/utils/answerMatch';

describe('answerMatch — conservative Treasure Hunt answer matching', () => {
  it('normalizes case, whitespace and punctuation (Unicode aware)', () => {
    expect(normalizeAnswerText('  VICTORIA   MEMORIAL. ')).toBe('victoria memorial');
    expect(normalizeAnswerText('Victoria, Memorial…!')).toBe('victoria memorial');
    expect(normalizeAnswerText('हुगली  नदी ')).toBe('हुगली नदी');
    expect(normalizeAnswerText('हुगली नदी!')).toBe('हुगली नदी');
  });

  it('accepts the documented good examples', () => {
    expect(isAnswerMatch('Madan Mahaal', 'Madan Mahal')).toBe(true); // dist-1 insertion
    expect(isAnswerMatch('Victora Memorial', 'Victoria Memorial')).toBe(true); // dist-1 insertion
    expect(isAnswerMatch('MANDAN MAHAL', 'Madan Mahal')).toBe(true); // normalization
    expect(isAnswerMatch('  Madan   Mahal  ', 'Madan Mahal')).toBe(true); // whitespace
    expect(isAnswerMatch('Madan, Mahal.', 'Madan Mahal')).toBe(true); // punctuation
    expect(isAnswerMatch('howrah brdige', 'Howrah Bridge')).toBe(true); // transposition (dist 2, longer token)
  });

  it('rejects partial, missing-word and unrelated answers', () => {
    expect(isAnswerMatch('Madan', 'Madan Mahal')).toBe(false); // missing word
    expect(isAnswerMatch('Mahal', 'Madan Mahal')).toBe(false); // missing word
    expect(isAnswerMatch('Madan Mahal Nagar', 'Madan Mahal')).toBe(false); // extra word
    expect(isAnswerMatch('Mahal Madan', 'Madan Mahal')).toBe(false); // reordered words
    expect(isAnswerMatch('Bhopal', 'Madan Mahal')).toBe(false); // unrelated single
    expect(isAnswerMatch('Gateway of India', 'Victoria Memorial')).toBe(false); // unrelated
    expect(isAnswerMatch('Victoria Memorial Garden', 'Victoria Memorial')).toBe(false); // extra word
  });

  it('rejects multi-word answers with more than one wrong word', () => {
    expect(isAnswerMatch('Victora Memrl', 'Victoria Memorial')).toBe(false); // two typos
    expect(isAnswerMatch('Garden Memorial', 'Victoria Memorial')).toBe(false); // one wrong word, not a typo of Victoria
    expect(isAnswerMatch('Victra Memrial', 'Victoria Memorial')).toBe(false); // two typos
  });

  it('single-word answers tolerate only a small typo', () => {
    expect(isAnswerMatch('Howrah', 'Howrah')).toBe(true);
    expect(isAnswerMatch('Hawrah', 'Howrah')).toBe(true); // dist 1
    expect(isAnswerMatch('Howarh', 'Howrah')).toBe(true); // transposition, dist 2; longer token len 6 >= threshold
    expect(isAnswerMatch('felx', 'flex')).toBe(false); // transposition, dist 2; both tokens < 6 chars -> declined
    expect(isAnswerMatch('Bhopal', 'Howrah')).toBe(false); // unrelated
  });

  it('Hindi follows the same conservative rule', () => {
    expect(isAnswerMatch('हुगली नदी', 'हुगली नदी')).toBe(true);
    expect(isAnswerMatch('हुगली नदि', 'हुगली नदी')).toBe(true); // vowel-sign/matra typo, dist 1
    expect(isAnswerMatch('हुगला नदी', 'हुगली नदी')).toBe(true); // dist 1
    expect(isAnswerMatch('नदी', 'हुगली नदी')).toBe(false); // missing word
    expect(isAnswerMatch('गंगा नदी', 'हुगली नदी')).toBe(false); // unrelated first word
  });

  it('does not auto-translate or cross-match languages', () => {
    expect(isAnswerMatch('विक्टोरिया मेमोरियल', 'Victoria Memorial')).toBe(false);
    expect(isAnswerMatch('Hooghly river', 'हुगली नदी')).toBe(false);
  });

  it('levenshteinDistance is the expected edit distance', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
    expect(levenshteinDistance('howrah', 'hoorah')).toBe(1);
    expect(levenshteinDistance('madam', 'madam')).toBe(0);
  });
});