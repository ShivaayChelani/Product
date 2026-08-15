import { describe, it, expect } from 'vitest';
import { reviewSchema } from '../modules/places/places.validation';
import { vendorReviewSchema } from '../modules/vendors/vendors.validation';

describe('place review rating validation', () => {
  it('still validates integer ratings 1–5 on the leftover place payload schema', () => {
    expect(reviewSchema.parse({ rating: 1, content: 'one star' }).rating).toBe(1);
    expect(reviewSchema.parse({ rating: 3, content: 'three stars' }).rating).toBe(3);
    expect(reviewSchema.parse({ rating: 5, content: 'five stars' }).rating).toBe(5);
  });

  it('rejects 0, 6, missing rating, and non-integers for place payloads', () => {
    expect(() => reviewSchema.parse({ rating: 0, content: 'bad' })).toThrow();
    expect(() => reviewSchema.parse({ rating: 6, content: 'bad' })).toThrow();
    expect(() => reviewSchema.parse({ content: 'no rating' })).toThrow();
    expect(() => reviewSchema.parse({ rating: 4.5, content: 'half' })).toThrow();
  });
});

describe('vendor review rating validation', () => {
  it('accepts integer ratings 1, 3, and 5', () => {
    expect(vendorReviewSchema.parse({ rating: 1, content: 'one star' }).rating).toBe(1);
    expect(vendorReviewSchema.parse({ rating: 3, content: 'three stars' }).rating).toBe(3);
    expect(vendorReviewSchema.parse({ rating: 5, content: 'five stars' }).rating).toBe(5);
  });

  it('rejects 0, 6, missing rating, and non-integers', () => {
    expect(() => vendorReviewSchema.parse({ rating: 0, content: 'bad' })).toThrow();
    expect(() => vendorReviewSchema.parse({ rating: 6, content: 'bad' })).toThrow();
    expect(() => vendorReviewSchema.parse({ content: 'no rating' })).toThrow();
    expect(() => vendorReviewSchema.parse({ rating: 4.5, content: 'half' })).toThrow();
  });
});
