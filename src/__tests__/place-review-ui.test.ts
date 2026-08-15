import fs from 'fs';
import path from 'path';

const spotDetail = fs.readFileSync(
  path.join(__dirname, '../screens/SpotDetailScreen.tsx'),
  'utf8',
);
const placesApi = fs.readFileSync(
  path.join(__dirname, '../services/api/places.ts'),
  'utf8',
);

describe('Place review UI and client path', () => {
  it('does not render place review/rating copy on SpotDetailScreen', () => {
    expect(spotDetail).not.toMatch(/Write a Review/);
    expect(spotDetail).not.toMatch(/Rate this Place/);
    expect(spotDetail).not.toMatch(/Review this Place/);
    expect(spotDetail).not.toMatch(/User Reviews/);
    expect(spotDetail).not.toMatch(/placesApi\.addReview/);
    expect(spotDetail).not.toMatch(/placesApi\.getReviews/);
    expect(spotDetail).not.toMatch(/placesApi\.markReviewHelpful/);
  });

  it('does not expose a place review submission client method', () => {
    expect(placesApi).not.toMatch(/addReview/);
    expect(placesApi).not.toMatch(/markReviewHelpful/);
    expect(placesApi).not.toMatch(/\/reviews/);
  });
});
