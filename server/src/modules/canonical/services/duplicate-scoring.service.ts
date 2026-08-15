import { nameSimilarityScore, normalizeForMatch } from '../../../shared/utils/canonicalText';
import { haversineDistance } from '../../../shared/utils/geo';

export type DuplicateSignals = {
  nameScore: number;
  aliasScore: number;
  distanceM: number;
  stateMatch: boolean;
  districtMatch: boolean;
  categoryMatch: boolean;
};

const MERGE_THRESHOLD = 0.86;
const BLOCK_THRESHOLD = 0.72;

export function scoreDuplicatePair(input: {
  nameA: string;
  nameB: string;
  aliasesB?: string[];
  latA: number;
  lngA: number;
  latB: number;
  lngB: number;
  stateA?: string;
  stateB?: string;
  districtA?: string;
  districtB?: string;
  categoryA?: string;
  categoryB?: string;
}): { confidence: number; signals: DuplicateSignals; action: 'MERGE' | 'REVIEW' | 'DISTINCT' } {
  const nameScore = nameSimilarityScore(input.nameA, input.nameB);
  let aliasScore = 0;
  for (const a of input.aliasesB ?? []) {
    aliasScore = Math.max(aliasScore, nameSimilarityScore(input.nameA, a));
  }

  const distanceM = haversineDistance(input.latA, input.lngA, input.latB, input.lngB);
  const stateMatch = !input.stateA || !input.stateB
    || normalizeForMatch(input.stateA) === normalizeForMatch(input.stateB);
  const districtMatch = !input.districtA || !input.districtB
    || normalizeForMatch(input.districtA) === normalizeForMatch(input.districtB);
  const categoryMatch = !input.categoryA || !input.categoryB
    || normalizeForMatch(input.categoryA) === normalizeForMatch(input.categoryB);

  let confidence = Math.max(nameScore, aliasScore);
  if (distanceM < 400) confidence += 0.08;
  else if (distanceM < 1200) confidence += 0.04;
  if (stateMatch) confidence += 0.03;
  if (districtMatch) confidence += 0.03;
  if (categoryMatch) confidence += 0.02;
  confidence = Math.min(1, Math.round(confidence * 100) / 100);

  const signals: DuplicateSignals = {
    nameScore,
    aliasScore,
    distanceM: Math.round(distanceM),
    stateMatch,
    districtMatch,
    categoryMatch,
  };

  let action: 'MERGE' | 'REVIEW' | 'DISTINCT' = 'DISTINCT';
  if (confidence >= MERGE_THRESHOLD) action = 'MERGE';
  else if (confidence >= BLOCK_THRESHOLD) action = 'REVIEW';

  return { confidence, signals, action };
}
