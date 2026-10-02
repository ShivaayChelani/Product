import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  APP_LINK_PATHS,
  buildAppleAppSiteAssociation,
  buildAssetLinks,
  escapeHtml,
  isSafePublicId,
  parseCertFingerprints,
  renderReelLandingPage,
  renderTripLandingPage,
  SHARE_HOSTS,
} from '../modules/app-link/appLink.associations';

const ROOT = path.join(__dirname, '..', '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const FINGERPRINT =
  '56:95:12:C3:4C:74:41:D2:E5:3B:AE:AE:BA:0F:EA:68:01:A6:FE:C3:89:7D:E3:94:B8:45:D0:69:14:23:60:D9';

describe('parseCertFingerprints', () => {
  it('accepts a colon-separated fingerprint unchanged', () => {
    expect(parseCertFingerprints(FINGERPRINT)).toEqual([FINGERPRINT]);
  });

  it('normalises dash-separated and bare hex forms', () => {
    const dashed = FINGERPRINT.replace(/:/g, '-');
    expect(parseCertFingerprints(dashed)).toEqual([FINGERPRINT]);
    expect(parseCertFingerprints(FINGERPRINT.replace(/:/g, ''))).toEqual([FINGERPRINT]);
  });

  it('accepts a comma or whitespace separated list', () => {
    const second = FINGERPRINT.replace(/^56/, 'AA');
    expect(parseCertFingerprints(`${FINGERPRINT}, ${second}`)).toHaveLength(2);
  });

  it('drops junk instead of emitting an invalid statement', () => {
    expect(parseCertFingerprints('')).toEqual([]);
    expect(parseCertFingerprints('TEAMID')).toEqual([]);
    expect(parseCertFingerprints('not:a:fingerprint')).toEqual([]);
    expect(parseCertFingerprints(undefined as unknown as string)).toEqual([]);
  });
});

describe('buildAssetLinks', () => {
  it('emits the delegate relation for the configured package', () => {
    const statements = buildAssetLinks({
      packageName: 'com.palsasafar',
      certFingerprints: FINGERPRINT,
    });
    expect(statements).toHaveLength(1);
    expect(statements[0].relation).toEqual(['delegate_permission/common.handle_all_urls']);
    expect(statements[0].target.namespace).toBe('android_app');
    expect(statements[0].target.package_name).toBe('com.palsasafar');
    expect(statements[0].target.sha256_cert_fingerprints).toEqual([FINGERPRINT]);
  });

  it('returns nothing usable rather than a statement Android cannot verify', () => {
    // An empty fingerprint array makes the Play verifier log a failure that
    // looks like an app bug, so the file must be honest instead.
    expect(buildAssetLinks({ packageName: 'com.palsasafar', certFingerprints: '' })).toEqual([]);
    expect(buildAssetLinks({ packageName: '', certFingerprints: FINGERPRINT })).toEqual([]);
  });
});

describe('buildAppleAppSiteAssociation', () => {
  it('associates the real Team ID when it is configured', () => {
    const aasa = buildAppleAppSiteAssociation({ teamId: 'ABCDE12345', bundleId: 'com.palsasafar' });
    expect(aasa.applinks.apps).toEqual([]);
    expect(aasa.applinks.details[0].appID).toBe('ABCDE12345.com.palsasafar');
    expect(aasa.applinks.details[0].paths).toEqual([...APP_LINK_PATHS]);
    expect(aasa.applinks.details[0].paths).toContain('/reel/*');
  });

  it('claims nothing when the Team ID is unknown', () => {
    // Shipping a literal "TEAMID." placeholder makes iOS reject the file and
    // disables Universal Links outright.
    const aasa = buildAppleAppSiteAssociation({ teamId: '', bundleId: 'com.palsasafar' });
    expect(aasa.applinks.details).toEqual([]);
    expect(JSON.stringify(aasa)).not.toMatch(/TEAMID/);
  });
});

describe('isSafePublicId', () => {
  it('accepts a cuid and rejects anything path-like', () => {
    expect(isSafePublicId('cmujljnz3004zfk1v5mu8qa3x')).toBe(true);
    expect(isSafePublicId('../../etc/passwd')).toBe(false);
    expect(isSafePublicId('a/b')).toBe(false);
    expect(isSafePublicId('https://evil.example')).toBe(false);
    expect(isSafePublicId('')).toBe(false);
    expect(isSafePublicId(undefined)).toBe(false);
  });
});

describe('renderReelLandingPage', () => {
  const base = { reelId: 'cmujljnz3004zfk1v5mu8qa3x', origin: 'https://palsafar.in' };

  it('renders the canonical URL and the custom-scheme app link', () => {
    const html = renderReelLandingPage(base);
    expect(html).toMatch(
      /<link rel="canonical" href="https:\/\/palsafar\.in\/reel\/cmujljnz3004zfk1v5mu8qa3x" \/>/,
    );
    expect(html).toMatch(/href="palsafar:\/\/reel\/cmujljnz3004zfk1v5mu8qa3x"/);
  });

  it('normalises a trailing slash on the origin', () => {
    const html = renderReelLandingPage({ ...base, origin: 'https://palsafar.in/' });
    expect(html).toMatch(/href="https:\/\/palsafar\.in\/reel\//);
    expect(html).not.toMatch(/palsafar\.in\/\/reel/);
  });

  it('emits Open Graph and Twitter card tags for link previews', () => {
    const html = renderReelLandingPage({
      ...base,
      meta: {
        title: 'Sunrise at Coorg',
        description: 'A quiet morning trail.',
        creatorName: '@asha',
        thumbnailUrl: 'https://res.cloudinary.com/demo/image/upload/cover.jpg',
        videoUrl: 'https://res.cloudinary.com/demo/video/upload/reel.mp4',
        views: 1200,
        likes: 84,
      },
    });
    expect(html).toMatch(/<meta property="og:title" content="Sunrise at Coorg" \/>/);
    expect(html).toMatch(/<meta property="og:type" content="video\.other" \/>/);
    expect(html).toMatch(/<meta name="twitter:card" content="player" \/>/);
    expect(html).toMatch(/<video class="player" src="https:\/\/res\.cloudinary\.com/);
    expect(html).toMatch(/1,200 views/);
  });

  it('still renders a usable page when the Reel is missing or private', () => {
    const html = renderReelLandingPage({ ...base, meta: null });
    expect(html).toMatch(/Watch this reel on PalSafar/);
    expect(html).toMatch(/Open in PalSafar/);
    expect(html).not.toMatch(/<video/);
  });

  it('escapes reel text so metadata cannot inject markup', () => {
    const html = renderReelLandingPage({
      ...base,
      meta: { title: '</title><script>alert(1)</script>' },
    });
    expect(html).not.toMatch(/<script>alert\(1\)<\/script>/);
    expect(html).toMatch(/&lt;script&gt;/);
  });

  it('only renders store links that were configured', () => {
    expect(renderReelLandingPage(base)).not.toMatch(/Google Play/);
    expect(renderReelLandingPage(base)).not.toMatch(/App Store/);
    const withStores = renderReelLandingPage({
      ...base,
      androidStoreUrl: 'https://play.google.com/store/apps/details?id=com.palsasafar',
      iosStoreUrl: 'https://apps.apple.com/app/id000',
    });
    expect(withStores).toMatch(/Google Play/);
    expect(withStores).toMatch(/App Store/);
  });
});

describe('renderTripLandingPage', () => {
  const token = 'eyJ2IjoxLCJ0cmlwSWQiOiJhYmMifQ.deadbeef';
  const base = { token, origin: 'https://palsafar.in' };

  it('renders the canonical URL and the custom-scheme app link', () => {
    const html = renderTripLandingPage(base);
    expect(html).toMatch(
      new RegExp(`<link rel="canonical" href="https://palsafar\\.in/trip/shared/${token}" />`),
    );
    expect(html).toMatch(new RegExp(`href="palsafar://trip/shared/${token}"`));
    expect(html).toMatch(/Open in PalSafar/);
  });

  it('emits Open Graph and Twitter card tags for link previews', () => {
    const html = renderTripLandingPage({
      ...base,
      meta: {
        title: 'Jabalpur Trip',
        destination: 'Jabalpur',
        days: 3,
        coverImage: 'https://res.cloudinary.com/demo/image/upload/cover.jpg',
      },
    });
    expect(html).toMatch(/<meta property="og:title" content="Jabalpur Trip" \/>/);
    expect(html).toMatch(/<meta property="og:type" content="article" \/>/);
    expect(html).toMatch(/<meta name="twitter:card" content="summary_large_image" \/>/);
    expect(html).toMatch(/3-day itinerary for Jabalpur/);
    expect(html).toMatch(/3 days/);
  });

  it('still renders a usable page when the token is invalid', () => {
    const html = renderTripLandingPage({ ...base, meta: null });
    expect(html).toMatch(/View this itinerary on PalSafar/);
    expect(html).toMatch(/Open in PalSafar/);
  });

  it('escapes trip text so metadata cannot inject markup', () => {
    const html = renderTripLandingPage({
      ...base,
      meta: { title: '</title><script>alert(1)</script>' },
    });
    expect(html).not.toMatch(/<script>alert\(1\)<\/script>/);
    expect(html).toMatch(/&lt;script&gt;/);
  });

  it('uses a single day label for one-day trips', () => {
    const html = renderTripLandingPage({ ...base, meta: { destination: 'Coorg', days: 1 } });
    expect(html).toMatch(/1 day</);
    expect(html).not.toMatch(/1 days/);
  });
});

describe('escapeHtml', () => {
  it('escapes every markup-significant character', () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
    );
  });
});

describe('wiring into the API', () => {
  it('serves the three association/share paths at the origin root', () => {
    const routes = read('server/src/modules/app-link/appLink.routes.ts');
    expect(routes).toMatch(
      /router\.get\('\/\.well-known\/assetlinks\.json', appLinkController\.assetLinks\)/,
    );
    expect(routes).toMatch(
      /router\.get\('\/\.well-known\/apple-app-site-association', appLinkController\.appleAppSiteAssociation\)/,
    );
    expect(routes).toMatch(/router\.get\('\/reel\/:reelId'/);
    expect(routes).toMatch(/router\.get\('\/trip\/shared\/:token'/);
  });

  it('resolves the shared-itinerary landing through the verified token service', () => {
    const service = read('server/src/modules/app-link/appLink.service.ts');
    expect(service).toMatch(/tripsService\.getSharedTrip\(token\)/);
  });

  it('mounts them before the catch-all 404 and outside the /api prefix', () => {
    const app = read('server/src/app.ts');
    expect(app).toMatch(/app\.use\(appLinkRoutes\)/);
    // Share links are https://palsafar.in/reel/:id, not /api/v1/reel/:id.
    const mountedAt = app.indexOf('app.use(appLinkRoutes)');
    const notFoundAt = app.indexOf("app.all('*'");
    expect(mountedAt).toBeGreaterThan(-1);
    expect(notFoundAt).toBeGreaterThan(-1);
    expect(mountedAt).toBeLessThan(notFoundAt);
  });

  it('reuses the existing public-reel visibility rule instead of a second query', () => {
    const service = read('server/src/modules/app-link/appLink.service.ts');
    expect(service).toMatch(/socialService\.getReelById\(reelId\)/);
    expect(service).not.toMatch(/prisma\./);
  });

  it('rejects an unsafe reel id before touching the database', () => {
    const service = read('server/src/modules/app-link/appLink.service.ts');
    expect(service).toMatch(/if \(!isSafePublicId\(reelId\)\)/);
  });

  it('keeps the served association files consistent with the shipped example', () => {
    // The API is now the source of truth for the files it serves; the checked-in
    // copy must stop claiming the same package under a different name.
    const shipped = JSON.parse(read('public/.well-known/assetlinks.json'));
    expect(shipped[0].target.package_name).toBe('com.palsasafar');
    expect(buildAssetLinks({
      packageName: 'com.palsasafar',
      certFingerprints: shipped[0].target.sha256_cert_fingerprints.join(','),
    })[0].target.sha256_cert_fingerprints).toEqual(
      shipped[0].target.sha256_cert_fingerprints,
    );
  });

  it('keeps the app-side prefixes and the served host in sync', () => {
    const shareLinks = read('src/services/sharing/shareLinks.ts');
    const linking = read('src/navigation/linking.ts');
    const manifest = read('android/app/src/main/AndroidManifest.xml');

    // Share links use the canonical apex origin across the app and association host.
    expect(shareLinks).toMatch(/PALSAFAR_WEB_ORIGIN = 'https:\/\/palsafar\.in'/);
    expect(SHARE_HOSTS).toEqual(['palsafar.in']);
    for (const host of SHARE_HOSTS) {
      expect(linking).toMatch(new RegExp(`https://${host.replace('.', '\\.')}`));
      expect(manifest).toMatch(new RegExp(`android:host="${host.replace('.', '\\.')}"`));
    }
    expect(linking).not.toMatch(/palsafar\.com/);
    expect(manifest).not.toMatch(/palsafar\.com/);
    expect(shareLinks).toMatch(/buildReelShareUrl[\s\S]{0,200}\/reel\//);
    expect(linking).toMatch(/path: 'reel\/:reelId'/);
    expect(linking).toMatch(/TripShared: 'trip\/shared\/:token'/);
    expect(shareLinks).toMatch(/\/trip\/shared\/\$\{encodeURIComponent\(trimmed\)\}/);
    expect(shareLinks).not.toMatch(/\/trip\/\$\{encodeURIComponent\(tripId\)\}/);
    const entitlements = read('ios/PalSafar/PalSafar.entitlements');
    expect(entitlements).toContain('applinks:palsafar.in');
    expect(entitlements).not.toContain('palsafar.com');
    expect(APP_LINK_PATHS).toContain('/reel/*');
    expect(APP_LINK_PATHS).toContain('/trip/shared/*');
  });
});
