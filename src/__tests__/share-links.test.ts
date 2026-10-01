import fs from 'fs';
import path from 'path';
import {
  PALSAFAR_WEB_ORIGIN,
  buildReelShareUrl,
  buildSharedTripUrl,
  buildReelShareMessage,
  buildTripShareMessage,
  isPublicShareableReel,
  shareMessageContainsAuthToken,
} from '../services/sharing/shareLinks';

describe('canonical share links', () => {
  const reelId = 'clxyz0123456789';
  const tripId = 'cltrip987654321';
  const tripShareToken = 'eyJ2IjoxLCJ0cmlwSWQiOiJjbHRyaXA5ODc2NTQzMjEifQ.signature';

  it('builds a palsafar.com reel URL with the reel id and no auth token', () => {
    const url = buildReelShareUrl(reelId);
    expect(url).toBe(`${PALSAFAR_WEB_ORIGIN}/reel/${reelId}`);
    expect(url).toContain(reelId);
    expect(url).not.toMatch(/token|bearer|jwt/i);
    expect(url).not.toContain('localhost');
    expect(url).not.toContain('onrender.com');
  });

  it('builds a signed trip share URL with the server-issued token', () => {
    const url = buildSharedTripUrl(tripShareToken);
    expect(url).toBe(`${PALSAFAR_WEB_ORIGIN}/trip/shared/${tripShareToken}`);
    expect(url).not.toContain(`/trip/${tripId}`);
  });

  it('rejects invalid or empty ids instead of inventing a URL', () => {
    expect(buildReelShareUrl('')).toBeNull();
    expect(buildReelShareUrl('https://evil.example/x')).toBeNull();
    expect(buildSharedTripUrl('')).toBeNull();
    expect(buildSharedTripUrl('../secret')).toBeNull();
  });

  it('does not expose draft or hidden reels as public share URLs', () => {
    expect(isPublicShareableReel({ id: reelId, status: 'DRAFT' })).toBe(false);
    expect(isPublicShareableReel({ id: reelId, status: 'HIDDEN' })).toBe(false);
    expect(isPublicShareableReel({ id: reelId, status: 'PENDING' })).toBe(false);
    expect(isPublicShareableReel({ id: reelId, status: 'APPROVED' })).toBe(true);
    expect(buildReelShareMessage({ id: reelId, status: 'HIDDEN', title: 'x' })).toBeNull();
  });

  it('puts a clickable PalSafar URL in reel and trip share text', () => {
    const reelMsg = buildReelShareMessage({
      id: reelId,
      status: 'APPROVED',
      description: '🤣🤣🤣',
    });
    expect(reelMsg).toContain('https://palsafar.com/reel/');
    expect(reelMsg).toContain(reelId);
    expect(reelMsg).toContain('🤣🤣🤣');
    expect(shareMessageContainsAuthToken(reelMsg!)).toBe(false);

    const tripMsg = buildTripShareMessage({
      id: tripId,
      title: 'Trip to Jabalpur',
      destination: 'Jabalpur',
    }, tripShareToken);
    expect(tripMsg).toContain(`https://palsafar.com/trip/shared/${tripShareToken}`);
    expect(tripMsg).not.toContain(`/trip/${tripId}`);
    expect(tripMsg).toMatch(/Trip to Jabalpur/);
    expect(shareMessageContainsAuthToken(tripMsg!)).toBe(false);
  });

  it('registers ReelDetail and signed TripShared on canonical https://palsafar.com paths', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../navigation/linking.ts'),
      'utf8',
    );
    expect(src).toMatch(/ReelDetail:\s*'reel\/:reelId'/);
    expect(src).toMatch(/TripShared:\s*'trip\/shared\/:token'/);
    expect(src).not.toMatch(/TripDetail:\s*'trip\/:tripId'/);
    expect(src).toMatch(/https:\/\/palsafar\.com/);
  });
});
