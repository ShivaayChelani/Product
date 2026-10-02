import fs from 'fs';
import path from 'path';
import {
  PALSAFAR_WEB_ORIGIN,
  buildReelShareUrl,
  buildSharedTripUrl,
  buildReelShareMessage,
  buildTripShareMessage,
  buildCreatorShareUrl,
  isPublicShareableReel,
  shareMessageContainsAuthToken,
} from '../services/sharing/shareLinks';

describe('canonical share links', () => {
  const reelId = 'clxyz0123456789';
  const tripId = 'cltrip987654321';
  const tripShareToken = 'eyJ2IjoxLCJ0cmlwSWQiOiJjbHRyaXA5ODc2NTQzMjEifQ.signature';

  it('builds a palsafar.in reel URL with the reel id and no auth token', () => {
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
    expect(reelMsg).toContain('https://palsafar.in/reel/');
    expect(reelMsg).toContain(reelId);
    expect(reelMsg).toContain('🤣🤣🤣');
    expect(shareMessageContainsAuthToken(reelMsg!)).toBe(false);

    const tripMsg = buildTripShareMessage({
      id: tripId,
      title: 'Trip to Jabalpur',
      destination: 'Jabalpur',
    }, tripShareToken);
    expect(tripMsg).toContain(`https://palsafar.in/trip/shared/${tripShareToken}`);
    expect(tripMsg).not.toContain(`/trip/${tripId}`);
    expect(tripMsg).toMatch(/Trip to Jabalpur/);
    expect(shareMessageContainsAuthToken(tripMsg!)).toBe(false);
  });

  it('registers ReelDetail and signed TripShared on canonical https://palsafar.in paths', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../navigation/linking.ts'),
      'utf8',
    );
    expect(src).toMatch(/ReelDetail:\s*'reel\/:reelId'/);
    expect(src).toMatch(/TripShared:\s*'trip\/shared\/:token'/);
    expect(src).not.toMatch(/TripDetail:\s*'trip\/:tripId'/);
    expect(src).toContain('https://palsafar.in');
    expect(src).not.toContain('palsafar.com');
  });
});

describe('creator share links', () => {
  const profileId = 'clcreator1234567890abcdef';

  it('prefers the stable profile id over the username', () => {
    const url = buildCreatorShareUrl({ id: profileId, username: 'palsafarin' });
    expect(url).toBe(`https://palsafar.in/creator/${profileId}`);
    expect(url).not.toContain('palsafar.com');
    expect(url).not.toContain('onrender.com');
  });

  it('falls back to a clean username when no id is available', () => {
    expect(buildCreatorShareUrl({ username: 'palsafarin' }))
      .toBe('https://palsafar.in/creator/palsafarin');
    expect(buildCreatorShareUrl({ id: '', username: 'palsafarin' }))
      .toBe('https://palsafar.in/creator/palsafarin');
  });

  it('uses the id even when the legacy username holds a pasted Instagram URL', () => {
    // The regression: these rows stored a pasted Instagram profile in
    // `username`, so sharing `username` emitted an unreadable link. The id is
    // stable and the server resolves it, so it wins.
    const url = buildCreatorShareUrl({
      id: profileId,
      username: 'httpswwwinstagramcompalsafarin',
    });
    expect(url).toBe(`https://palsafar.in/creator/${profileId}`);
    expect(url).not.toContain('instagram');
  });

  it('passes a stored username through verbatim rather than deriving a handle from it', () => {
    expect(buildCreatorShareUrl({ username: 'httpswwwinstagramcompalsafarin' }))
      .toBe('https://palsafar.in/creator/httpswwwinstagramcompalsafarin');
  });

  it('rejects empty and unsafe identifiers', () => {
    expect(buildCreatorShareUrl({})).toBeNull();
    expect(buildCreatorShareUrl({ username: '../secret' })).toBeNull();
    expect(buildCreatorShareUrl({ username: 'a/b' })).toBeNull();
    expect(buildCreatorShareUrl({ username: 'https://instagram.com/palsafarin' })).toBeNull();
    expect(buildCreatorShareUrl({ username: 'ab' })).toBeNull();
    expect(buildCreatorShareUrl({ username: 'x'.repeat(31) })).toBeNull();
  });

  it('never shares the placeholder fallback handle', () => {
    expect(buildCreatorShareUrl({ username: 'creator' }))
      .toBe('https://palsafar.in/creator/creator');
  });
});
