/**
 * Public link association + share landing pages.
 *
 * Shared Reel links are `https://palsafar.in/reel/:reelId` (see
 * src/services/sharing/shareLinks.ts and src/navigation/linking.ts). For those
 * links to open the app, the host serving that origin must answer:
 *   - GET /.well-known/assetlinks.json                 (Android App Links)
 *   - GET /.well-known/apple-app-site-association     (iOS Universal Links)
 *   - GET /reel/:reelId                                (browser fallback)
 *
 * All three are pure builders here so they can be unit tested without a
 * database, an HTTP server, or a real certificate.
 */

export const SHARE_HOSTS = ['palsafar.in'] as const;

/** Paths the app actually routes; see linking.ts `config.screens`. */
export const APP_LINK_PATHS = [
  '*',
  '/place/*',
  '/trip/*',
  '/trip/shared/*',
  '/offer/*',
  '/vendor/*',
  '/reel/*',
  '/legal/*',
  '/wallet',
  '/rewards',
] as const;

export type AndroidAppLinkStatement = {
  relation: string[];
  target: {
    namespace: string;
    package_name: string;
    sha256_cert_fingerprints: string[];
  };
};

export type AppleAppSiteAssociation = {
  applinks: {
    apps: string[];
    details: Array<{ appID: string; paths: string[] }>;
  };
};

const RELATION = 'delegate_permission/common.handle_all_urls';

/**
 * Normalizes a fingerprint from any common shape:
 * "56:95:...", "56-95-...", "5695..." or already a list. Returns [] when
 * nothing usable was configured, because an empty fingerprint list makes
 * Android treat the statement as invalid and log a verification failure that is
 * easy to mistake for a code bug.
 */
export function parseCertFingerprints(raw: string): string[] {
  return String(raw ?? '')
    .split(/[,\s]+/)
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const upper = part.toUpperCase();
      if (upper.includes(':')) return upper;
      if (upper.includes('-')) return upper.replace(/-/g, ':');
      if (/^[0-9A-F]{64}$/.test(upper)) {
        return (upper.match(/.{2}/g) as string[]).join(':');
      }
      return upper;
    })
    .filter(fp => /^[0-9A-F]{2}(:[0-9A-F]{2}){31}$/.test(fp));
}

export function buildAssetLinks(input: {
  packageName: string;
  certFingerprints: string;
}): AndroidAppLinkStatement[] {
  const fingerprints = parseCertFingerprints(input.certFingerprints);
  if (!input.packageName || fingerprints.length === 0) return [];
  return [
    {
      relation: [RELATION],
      target: {
        namespace: 'android_app',
        package_name: input.packageName,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];
}

/**
 * iOS requires `TEAMID.bundleId`. Without a configured Team ID we return a
 * payload that claims nothing, so Universal Links simply do not open the app
 * and the share link lands on the public page instead of being actively
 * mis-associated.
 */
export function buildAppleAppSiteAssociation(input: {
  teamId: string;
  bundleId: string;
}): AppleAppSiteAssociation {
  const teamId = (input.teamId ?? '').trim();
  const bundleId = (input.bundleId ?? '').trim();
  const hasApp = Boolean(teamId && bundleId);
  return {
    applinks: {
      apps: [],
      details: hasApp
        ? [{ appID: `${teamId}.${bundleId}`, paths: [...APP_LINK_PATHS] }]
        : [],
    },
  };
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function isSafePublicId(id: unknown): id is string {
  if (typeof id !== 'string') return false;
  const trimmed = id.trim();
  if (!trimmed || trimmed.length > 128) return false;
  if (/[/?#\\]/.test(trimmed)) return false;
  if (trimmed.includes('://')) return false;
  return /^[a-z0-9][a-z0-9_-]{7,127}$/i.test(trimmed);
}

export type ReelShareMeta = {
  id: string;
  title: string;
  description: string;
  creatorName: string;
  thumbnailUrl: string;
  videoUrl: string;
  views: number;
  likes: number;
};

const DEFAULT_TITLE = 'Watch this reel on PalSafar';

/**
 * Browser fallback for a shared Reel. Renders real Open Graph / Twitter card
 * data plus a link that opens the app through the custom scheme, so a share
 * that the OS did not hand to the app still shows the Reel instead of a 404.
 */
export function renderReelLandingPage(input: {
  reelId: string;
  origin: string;
  meta?: Partial<ReelShareMeta> | null;
  androidStoreUrl?: string;
  iosStoreUrl?: string;
}): string {
  const { reelId, origin } = input;
  const canonical = `${origin.replace(/\/+$/, '')}/reel/${encodeURIComponent(reelId)}`;
  const deepLink = `palsafar://reel/${encodeURIComponent(reelId)}`;

  const title = (input.meta?.title || '').trim() || DEFAULT_TITLE;
  const description = (input.meta?.description || '').trim()
    || 'Discover travel stories, hidden gems and reels from creators on PalSafar.';
  const creatorName = (input.meta?.creatorName || '').trim() || 'PalSafar';
  const image = (input.meta?.thumbnailUrl || '').trim() || `${origin.replace(/\/+$/, '')}/icon-512.png`;

  const playUrl = (input.meta?.videoUrl || '').trim();
  const views = Number.isFinite(input.meta?.views) ? Number(input.meta?.views) : 0;
  const likes = Number.isFinite(input.meta?.likes) ? Number(input.meta?.likes) : 0;

  const player = playUrl
    ? `<video class="player" src="${escapeHtml(playUrl)}" poster="${escapeHtml(image)}" controls playsinline preload="metadata"></video>`
    : `<div class="player playerFallback" style="background-image:url('${escapeHtml(image)}')"></div>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${escapeHtml(title)} · PalSafar</title>
<meta name="description" content="${escapeHtml(description)}" />
<link rel="canonical" href="${escapeHtml(canonical)}" />
<meta property="og:type" content="video.other" />
<meta property="og:site_name" content="PalSafar" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:url" content="${escapeHtml(canonical)}" />
<meta property="og:image" content="${escapeHtml(image)}" />
${playUrl ? `<meta property="og:video" content="${escapeHtml(playUrl)}" />` : ''}
<meta property="og:video:type" content="video/mp4" />
<meta name="twitter:card" content="player" />
<meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
<meta name="twitter:image" content="${escapeHtml(image)}" />
${playUrl ? `<meta name="twitter:player:stream" content="${escapeHtml(playUrl)}" />` : ''}
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 24px 16px 48px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #0B0B0F; color: #F5F5F7; line-height: 1.5;
    display: flex; justify-content: center;
  }
  main { width: 100%; max-width: 480px; }
  .player {
    width: 100%; aspect-ratio: 9 / 16; max-height: 78vh;
    border-radius: 18px; background: #000 center/cover no-repeat; display: block;
  }
  h1 { font-size: 20px; line-height: 1.3; margin: 16px 0 6px; }
  p { margin: 0 0 12px; color: #A1A1AA; font-size: 14px; }
  .meta { display: flex; gap: 14px; font-size: 13px; color: #71717A; margin-bottom: 20px; }
  .actions { display: flex; flex-wrap: wrap; gap: 10px; }
  .btn {
    display: inline-block; padding: 12px 18px; border-radius: 999px;
    background: #1D4ED8; color: #fff; font-weight: 600; font-size: 14px; text-decoration: none;
  }
  .btn.secondary { background: transparent; border: 1px solid #3F3F46; color: #E4E4E7; }
  footer { margin-top: 28px; font-size: 12px; color: #52525B; }
</style>
</head>
<body>
<main>
  ${player}
  <h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(description)}</p>
  <div class="meta">
    <span>by ${escapeHtml(creatorName)}</span>
    ${views ? `<span>${views.toLocaleString('en-IN')} views</span>` : ''}
    ${likes ? `<span>${likes.toLocaleString('en-IN')} likes</span>` : ''}
  </div>
  <div class="actions">
    <a class="btn" href="${escapeHtml(deepLink)}">Open in PalSafar</a>
    ${input.androidStoreUrl ? `<a class="btn secondary" href="${escapeHtml(input.androidStoreUrl)}">Get it on Google Play</a>` : ''}
    ${input.iosStoreUrl ? `<a class="btn secondary" href="${escapeHtml(input.iosStoreUrl)}">Download on the App Store</a>` : ''}
  </div>
  <footer>Shared from PalSafar.</footer>
</main>
</body>
</html>`;
}
