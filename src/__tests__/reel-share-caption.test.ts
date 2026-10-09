import fs from 'fs';
import path from 'path';
import {
  normalizeReelCaption,
  reelUserFacingCaption,
} from '../components/reels/reelCaptionUtils';
import {
  PALSAFAR_WEB_ORIGIN,
  buildReelShareMessage,
  buildReelShareUrl,
} from '../services/sharing/shareLinks';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

const VENDOR_JSON = JSON.stringify({
  _isStructuredVendorReel: true,
  caption: '💃✨ Dance, Dhol & Non-Stop Garba Nights!',
  category: 'Events',
  settings: { showOnHome: true },
});

const REEL_ID = 'cmust41ma006kdv1vx0ljn6nj';

describe('normalizeReelCaption / reelUserFacingCaption', () => {
  it('preserves a normal caption string', () => {
    expect(normalizeReelCaption('Sunset at the fort')).toBe('Sunset at the fort');
    expect(reelUserFacingCaption('Sunset at the fort')).toBe('Sunset at the fort');
  });

  it('extracts only the caption from structured vendor reel JSON', () => {
    expect(normalizeReelCaption(VENDOR_JSON)).toBe('💃✨ Dance, Dhol & Non-Stop Garba Nights!');
    expect(reelUserFacingCaption(VENDOR_JSON, 'Promo title')).toBe(
      '💃✨ Dance, Dhol & Non-Stop Garba Nights!',
    );
    expect(normalizeReelCaption(VENDOR_JSON)).not.toContain('_isStructuredVendorReel');
    expect(normalizeReelCaption(VENDOR_JSON)).not.toContain('showOnHome');
  });

  it('preserves emoji, line breaks, and hashtags in ordinary captions', () => {
    const caption = 'Hidden gem 🌄\n#PalSafar #Jabalpur';
    expect(normalizeReelCaption(caption)).toBe(caption);
    expect(reelUserFacingCaption(caption)).toBe(caption);
  });

  it('returns empty for missing or blank captions', () => {
    expect(normalizeReelCaption(null)).toBe('');
    expect(normalizeReelCaption(undefined)).toBe('');
    expect(normalizeReelCaption('   ')).toBe('');
    expect(reelUserFacingCaption('', '')).toBe('');
  });

  it('does not crash on malformed structured JSON and never leaks keys', () => {
    const broken =
      '{"_isStructuredVendorReel":true,"caption":"Garba night","category":';
    expect(normalizeReelCaption(broken)).toBe('Garba night');
    expect(normalizeReelCaption('{not-json')).toBe('{not-json');
    expect(normalizeReelCaption('Meet us at {the cafe}')).toBe('Meet us at {the cafe}');
  });

  it('extracts caption from a plain object passed instead of a string', () => {
    const obj = {
      _isStructuredVendorReel: true,
      caption: '💃✨ Dance, Dhol & Non-Stop Garba Nights!',
      category: 'Events',
      settings: { showOnHome: true },
    };
    expect(normalizeReelCaption(obj)).toBe('💃✨ Dance, Dhol & Non-Stop Garba Nights!');
    expect(reelUserFacingCaption(obj)).toBe('💃✨ Dance, Dhol & Non-Stop Garba Nights!');
    expect(normalizeReelCaption(obj)).not.toContain('[object Object]');
  });
});

describe('buildReelShareMessage', () => {
  it('builds the canonical palsafar.in reel URL from the real reel id', () => {
    expect(buildReelShareUrl(REEL_ID)).toBe(`${PALSAFAR_WEB_ORIGIN}/reel/${REEL_ID}`);
  });

  it('shares a structured vendor reel as clean caption + one canonical URL', () => {
    const message = buildReelShareMessage({
      id: REEL_ID,
      status: 'APPROVED',
      description: VENDOR_JSON,
      title: 'Garba promo',
    });
    expect(message).toBe(
      [
        'Check out this Moment on PalSafar! 🎬',
        '💃✨ Dance, Dhol & Non-Stop Garba Nights!',
        `https://palsafar.in/reel/${REEL_ID}`,
      ].join('\n\n'),
    );
    expect(message).not.toContain('_isStructuredVendorReel');
    expect(message).not.toContain('showOnHome');
    expect(message).not.toContain('"category"');
    expect(message).not.toMatch(/undefined|null|\[object Object\]/);
    expect(message?.split(`https://palsafar.in/reel/${REEL_ID}`)).toHaveLength(2);
    expect(
      message?.split('💃✨ Dance, Dhol & Non-Stop Garba Nights!'),
    ).toHaveLength(2);
  });

  it('uses a generic intro when the caption is empty, still with the canonical URL', () => {
    const message = buildReelShareMessage({
      id: REEL_ID,
      status: 'APPROVED',
      description: '',
      title: '',
    });
    expect(message).toBe(
      `Check out this Moment on PalSafar! 🎬\n\nhttps://palsafar.in/reel/${REEL_ID}`,
    );
    expect(message).not.toContain('{');
  });

  it('does not duplicate the caption when title repeats the unwrapped text', () => {
    const caption = '💃✨ Dance, Dhol & Non-Stop Garba Nights!';
    const message = buildReelShareMessage({
      id: REEL_ID,
      status: 'APPROVED',
      description: VENDOR_JSON,
      title: caption,
    });
    expect(message?.split(caption)).toHaveLength(2);
  });

  it('does not append a second copy of the share URL', () => {
    const url = `https://palsafar.in/reel/${REEL_ID}`;
    const message = buildReelShareMessage({
      id: REEL_ID,
      status: 'APPROVED',
      description: `See this ${url}`,
    });
    expect(message?.split(url)).toHaveLength(2);
  });
});

describe('reel share handlers use the shared builder', () => {
  it('feed, detail, and shareReel all go through buildReelShareMessage', () => {
    const shareReel = read('services/sharing/shareReel.ts');
    const feed = read('screens/ReelsFeedScreen.tsx');
    const detail = read('screens/ReelDetailScreen.tsx');
    const card = read('components/reels/ReelCard.tsx');
    const links = read('services/sharing/shareLinks.ts');
    expect(shareReel).toMatch(/buildReelShareMessage\(reel\)/);
    expect(shareReel).toMatch(/Share\.share\(\{ message/);
    expect(feed).toMatch(/shareReelAndRecord\(reel\)/);
    expect(detail).toMatch(/shareReelAndRecord\(target\)/);
    expect(card).toMatch(/onShare\(reel\)/);
    expect(links).toMatch(/reelUserFacingCaption\(reel\.description, reel\.title\)/);
    expect(links).toMatch(/PALSAFAR_WEB_ORIGIN\}\/reel\//);
  });
});
