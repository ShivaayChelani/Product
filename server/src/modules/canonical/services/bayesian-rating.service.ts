/**
 * Bayesian average for display rating (anti-fraud smoothing).
 * m = prior mean, C = minimum reviews before full trust, R = avg rating, v = review count.
 */
export function bayesianRating(params: {
  averageRating: number | null;
  reviewCount: number;
  globalMean?: number;
  minimumReviews?: number;
}): number | null {
  const { averageRating, reviewCount } = params;
  if (reviewCount <= 0 || averageRating == null) return null;

  const m = params.globalMean ?? 4.0;
  const C = params.minimumReviews ?? 10;
  const R = averageRating;
  const v = reviewCount;

  const score = (v / (v + C)) * R + (C / (v + C)) * m;
  return Math.round(score * 10) / 10;
}

/** Simple fraud flag: extreme rating with very few reviews. */
export function detectRatingAnomaly(averageRating: number, reviewCount: number): boolean {
  if (reviewCount >= 20) return false;
  return averageRating >= 4.95 || averageRating <= 1.5;
}
