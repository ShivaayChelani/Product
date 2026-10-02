import { Request, Response } from 'express';
import { catchAsync } from '../../shared/utils/catchAsync';
import { logger } from '../../config/logger';
import { appLinkService } from './appLink.service';

const ASSOCIATION_CACHE_CONTROL = 'public, max-age=300';
const LANDING_CACHE_CONTROL = 'public, max-age=120, stale-while-revalidate=600';

/**
 * Scoped replacement for the global helmet policy: the landing page ships a
 * small inline <style> and plays the reel from its CDN host, so it needs
 * 'unsafe-inline' for styles and remote media. It contains no script, so the
 * page cannot execute anything, and this does not weaken any other route.
 */
const LANDING_CSP = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "media-src 'self' https: blob:",
  "script-src 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
].join('; ');

function requestOrigin(req: Request): string {
  const proto = String(req.protocol || 'https').replace(/:$/, '');
  const host = req.get('host');
  if (host) return `${proto}://${host}`;
  return 'https://palsafar.in';
}

export const appLinkController = {
  /**
   * Digital Asset Links. Android's App Links verifier requires this at the
   * origin root, served as application/json with no redirect.
   */
  assetLinks: (_req: Request, res: Response) => {
    const statements = appLinkService.assetLinks();
    if (statements.length === 0) {
      logger.warn(
        { packageName: 'com.palsasafar' },
        'assetlinks.json requested with no ANDROID_APP_CERT_FINGERPRINTS configured; Android App Links cannot verify',
      );
    }
    res.set('Content-Type', 'application/json');
    res.set('Cache-Control', ASSOCIATION_CACHE_CONTROL);
    res.status(200).send(JSON.stringify(statements, null, 2));
  },

  /** iOS Universal Links association; must have no file extension and no redirect. */
  appleAppSiteAssociation: (_req: Request, res: Response) => {
    const association = appLinkService.appleAppSiteAssociation();
    if (association.applinks.details.length === 0) {
      logger.warn(
        'apple-app-site-association requested with IOS_TEAM_ID / IOS_APP_BUNDLE_ID unset; Universal Links cannot verify',
      );
    }
    res.set('Content-Type', 'application/json');
    res.set('Cache-Control', ASSOCIATION_CACHE_CONTROL);
    res.status(200).send(JSON.stringify(association, null, 2));
  },

  reelLandingPage: catchAsync(async (req: Request, res: Response) => {
    // Express 5 types a repeatable route param as string | string[].
    const raw = req.params.reelId;
    const reelId = Array.isArray(raw) ? raw[0] : raw;
    const html = await appLinkService.reelLandingPage(reelId, requestOrigin(req));
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', LANDING_CACHE_CONTROL);
    res.set('Content-Security-Policy', LANDING_CSP);
    res.set('X-Robots-Tag', 'noindex');
    res.status(200).send(html);
  }),

  tripLandingPage: catchAsync(async (req: Request, res: Response) => {
    const raw = req.params.token;
    const token = Array.isArray(raw) ? raw[0] : raw;
    const html = await appLinkService.tripLandingPage(token, requestOrigin(req));
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', LANDING_CACHE_CONTROL);
    res.set('Content-Security-Policy', LANDING_CSP);
    res.set('X-Robots-Tag', 'noindex');
    res.status(200).send(html);
  }),
};
