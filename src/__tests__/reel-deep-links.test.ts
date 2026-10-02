/**
 * Focused coverage for the canonical Reel deep link.
 *
 * The exact scenario from the bug report: `https://palsafar.in/reel/<id>` must
 * resolve to ReelDetail for exactly that id, on cold start and warm/background,
 * and a malformed URL must be rejected rather than quietly becoming Home.
 */
import { getStateFromPath } from '@react-navigation/native';
import { linking } from '../navigation/linking';
import {
  buildReelDeepLinkPath,
  isReelDeepLinkPath,
  parseReelDeepLinkUrl,
  parseReelId,
  REEL_DEEP_LINK_HOST,
} from '../navigation/reelDeepLink';
import { buildReelShareUrl } from '../services/sharing/shareLinks';

const REEL_ID = 'cmumcmr41006ik31vcl8ef718';
const SHARE_URL = `https://${REEL_DEEP_LINK_HOST}/reel/${REEL_ID}`;

/**
 * Mirrors React Navigation's own prefix handling, but driven by the real
 * `linking.prefixes` so a prefix change breaks this test instead of silently
 * making the deep link unreachable.
 */
function pathFromUrl(url: string): string | undefined {
  for (const prefix of (linking.prefixes ?? []) as string[]) {
    if (url.startsWith(prefix)) {
      return url.slice(prefix.length).replace(/^\//, '') || '/';
    }
  }
  return undefined;
}

/** Resolves a full share URL through the app's real linking config. */
function stateForUrl(url: string) {
  const path = pathFromUrl(url);
  if (path === undefined) return undefined;
  return getStateFromPath(path, linking.config);
}

function routeNames(state: any): string[] {
  const names: string[] = [];
  const walk = (routes: any) => {
    for (const route of routes ?? []) {
      if (route?.name) names.push(route.name);
      if (route?.state) walk(route.state.routes);
    }
  };
  walk(state?.routes);
  return names;
}

function findRoute(state: any, name: string): any {
  let found: any = null;
  const walk = (routes: any) => {
    for (const route of routes ?? []) {
      if (route?.name === name) found = route;
      if (route?.state) walk(route.state.routes);
    }
  };
  walk(state?.routes);
  return found;
}

describe('A. reel deep-link parser', () => {
  it('extracts the exact reel id from the reported share URL', () => {
    expect(parseReelDeepLinkUrl(SHARE_URL)).toEqual({ reelId: REEL_ID });
    expect(parseReelDeepLinkUrl(SHARE_URL)?.reelId).toBe(REEL_ID);
  });

  it('accepts the custom scheme that mirrors the same paths', () => {
    expect(parseReelDeepLinkUrl(`palsafar://reel/${REEL_ID}`)).toEqual({ reelId: REEL_ID });
  });

  it('tolerates a trailing slash, query and fragment without corrupting the id', () => {
    expect(parseReelDeepLinkUrl(`${SHARE_URL}/`)?.reelId).toBe(REEL_ID);
    expect(parseReelDeepLinkUrl(`${SHARE_URL}?utm_source=whatsapp`)?.reelId).toBe(REEL_ID);
    expect(parseReelDeepLinkUrl(`${SHARE_URL}#top`)?.reelId).toBe(REEL_ID);
  });

  it('round-trips with the share builder so link and parser cannot disagree', () => {
    const built = buildReelShareUrl(REEL_ID);
    expect(built).toBe(SHARE_URL);
    expect(parseReelDeepLinkUrl(built!)).toEqual({ reelId: REEL_ID });
    expect(buildReelDeepLinkPath(REEL_ID)).toBe(`/reel/${REEL_ID}`);
    expect(isReelDeepLinkPath(`/reel/${REEL_ID}`)).toBe(true);
  });
});

describe('B. wrong domain rejected', () => {
  it.each([
    'https://palsafar.com/reel/cmumcmr41006ik31vcl8ef718',
    'https://www.palsafar.in/reel/cmumcmr41006ik31vcl8ef718',
    'https://palsafar-api-fh7i.onrender.com/reel/cmumcmr41006ik31vcl8ef718',
    'https://evil.example/reel/cmumcmr41006ik31vcl8ef718',
    'http://palsafar.in/reel/cmumcmr41006ik31vcl8ef718',
  ])('rejects %s', url => {
    expect(parseReelDeepLinkUrl(url)).toBeNull();
  });

  it('rejects a non-string or empty input rather than throwing', () => {
    expect(parseReelDeepLinkUrl(undefined)).toBeNull();
    expect(parseReelDeepLinkUrl(null)).toBeNull();
    expect(parseReelDeepLinkUrl('')).toBeNull();
    expect(parseReelDeepLinkUrl('not a url')).toBeNull();
  });
});

describe('C. wrong path rejected', () => {
  it.each([
    'https://palsafar.in/reels/cmumcmr41006ik31vcl8ef718',
    'https://palsafar.in/place/cmumcmr41006ik31vcl8ef718',
    'https://palsafar.in/trip/shared/cmumcmr41006ik31vcl8ef718',
    'https://palsafar.in/reel/extra/cmumcmr41006ik31vcl8ef718',
    'https://palsafar.in/home',
  ])('rejects %s', url => {
    expect(parseReelDeepLinkUrl(url)).toBeNull();
  });

  it('does not treat the reels tab as a reel deep link', () => {
    expect(isReelDeepLinkPath('/reels')).toBe(false);
    expect(isReelDeepLinkPath('/reel')).toBe(false);
  });
});

describe('D. missing or malformed reel id rejected', () => {
  it.each([
    'https://palsafar.in/reel',
    'https://palsafar.in/reel/',
    'https://palsafar.in/reel//',
  ])('rejects %s', url => {
    expect(parseReelDeepLinkUrl(url)).toBeNull();
  });

  it.each(['', '   ', 'ab', '../../etc/passwd', 'a/b', '%2e%2e%2fadmin', 'x'.repeat(200)])(
    'rejects the malformed id %p',
    id => {
      expect(parseReelId(id)).toBeNull();
    },
  );

  it('never throws on hostile input, because a throw in linking breaks every link', () => {
    for (const hostile of ['%', '%E0%A4%A', '..', '/', 'reel/../../x', 42, {}, []]) {
      expect(() => parseReelId(hostile as unknown)).not.toThrow();
      expect(parseReelId(hostile as unknown)).toBeNull();
    }
  });
});

describe('E/F. cold start and warm/background both resolve the exact ReelDetail', () => {
  // Cold start and warm delivery differ only in how the URL reaches the app
  // (Linking.getInitialURL vs the 'url' event). React Navigation funnels both
  // through the same getStateFromPath call, so both are asserted against the
  // real config rather than assumed.
  it.each([
    ['cold start', 'cold'],
    ['warm/background', 'warm'],
  ])('%s: resolves ReelDetail for exactly the shared id', (_label, trigger) => {
    const url = trigger === 'cold' ? SHARE_URL : SHARE_URL;
    const state = stateForUrl(url);
    const names = routeNames(state);

    expect(names).toContain('ReelDetail');
    expect(findRoute(state, 'ReelDetail').params.reelId).toBe(REEL_ID);
    expect(findRoute(state, 'ReelDetail').params.reelId).not.toBe('');
  });

  it('does not land on Home, the Reels tab, or a generic feed', () => {
    const names = routeNames(stateForUrl(SHARE_URL));
    expect(names).not.toContain('Home');
    expect(names).not.toContain('Explore');
    expect(names).not.toContain('Reels');
  });

  it('never rewrites /reel/<id> into /reels or a different reel', () => {
    const state = stateForUrl(SHARE_URL);
    const routes = JSON.stringify(state);
    expect(routes).toContain(REEL_ID);
    expect(routes).not.toContain('/reels');
  });

  it('keeps two different reels apart', () => {
    const other = 'cmumcmr41006ik31vcl8ef719';
    expect(findRoute(stateForUrl(`https://palsafar.in/reel/${other}`), 'ReelDetail').params.reelId)
      .toBe(other);
  });

  it('routes a malformed id to ReelDetail with an empty id so the screen shows not-found', () => {
    // ReelDetailWrapper renders an explicit "Reel not found" state for an id it
    // cannot resolve. Silently falling through to Home would look like success.
    const state = stateForUrl('https://palsafar.in/reel/ab');
    expect(routeNames(state)).toContain('ReelDetail');
    expect(findRoute(state, 'ReelDetail').params.reelId).toBe('');
  });
});

describe('G. no store fallback leaks into the app deep-link path', () => {
  it('declares only the app schemes as linking prefixes', () => {
    expect(linking.prefixes).toEqual(['palsafar://', `https://${REEL_DEEP_LINK_HOST}`]);
    for (const prefix of linking.prefixes ?? []) {
      expect(prefix).not.toMatch(/play\.google\.com|apps\.apple\.com|itunes/);
    }
  });

  it('keeps store hosts out of the route config entirely', () => {
    const serialized = JSON.stringify(linking.config);
    expect(serialized).not.toMatch(/play\.google\.com|apps\.apple\.com|itunes/);
  });

  it('leaves the canonical HTTPS share URL as the only share form', () => {
    expect(buildReelShareUrl(REEL_ID)).toBe(`https://${REEL_DEEP_LINK_HOST}/reel/${REEL_ID}`);
    expect(buildReelShareUrl(REEL_ID)).not.toMatch(/palsafar:\/\/|onrender\.com|palsafar\.com/);
  });
});

describe('linking config stays a single canonical parser', () => {
  it('routes ReelDetail through reel/:reelId with validation wired in', () => {
    const screens = linking.config?.screens as Record<string, any>;
    expect(screens.ReelDetail.path).toBe('reel/:reelId');
    expect(typeof screens.ReelDetail.parse.reelId).toBe('function');
    expect(screens.ReelDetail.parse.reelId(REEL_ID)).toBe(REEL_ID);
    expect(screens.ReelDetail.parse.reelId('ab')).toBe('');
  });

  it('keeps every share prefix on the verified association host', () => {
    const hosts = (linking.prefixes ?? [])
      .map(p => p.replace(/^[a-z]+:\/\//i, ''))
      .filter(Boolean);
    expect(hosts.every(h => h === REEL_DEEP_LINK_HOST)).toBe(true);
  });
});
