import { env } from '../../config/env';
import { socialService } from '../social/social.service';
import { tripsService } from '../trips/trips.service';
import { ApiError } from '../../shared/utils/ApiError';
import {
  buildAppleAppSiteAssociation,
  buildAssetLinks,
  isSafePublicId,
  renderReelLandingPage,
  renderTripLandingPage,
  type ReelShareMeta,
  type TripShareMeta,
} from './appLink.associations';

/**
 * Public Reel share landing page + platform link association, served for the
 * canonical origin the app's share links point at (src/services/sharing/shareLinks.ts).
 */

export const appLinkService = {
  assetLinks() {
    return buildAssetLinks({
      packageName: env.appLink.packageName,
      certFingerprints: env.appLink.androidCertFingerprints,
    });
  },

  appleAppSiteAssociation() {
    return buildAppleAppSiteAssociation({
      teamId: env.appLink.iosTeamId,
      bundleId: env.appLink.iosBundleId,
    });
  },

  /**
   * `origin` is the request's own scheme+host, so the canonical tag always
   * matches the host the visitor actually reached instead of a hard-coded
   * origin that may differ (www vs apex, staging).
   */
  async reelLandingPage(reelId: string, origin: string): Promise<string> {
    if (!isSafePublicId(reelId)) {
      throw new ApiError(400, 'Invalid reel id.');
    }

    let meta: Partial<ReelShareMeta> | null;
    try {
      // getReelById enforces the same public-visibility rule as the API
      // (APPROVED only, 404 otherwise), so drafts never leak through a link.
      const reel = await socialService.getReelById(reelId);
      meta = {
        id: reel.id,
        title: reel.title ?? '',
        description: reel.description ?? '',
        creatorName: reel.creator?.username ? `@${reel.creator.username}` : 'PalSafar',
        thumbnailUrl: reel.thumbnail ?? '',
        videoUrl: reel.videoUrl ?? '',
        views: reel.views ?? 0,
        likes: reel.likes ?? 0,
      };
    } catch {
      // The page still renders (and the app link still works) for a Reel that
      // is missing or not public; it just has no card metadata.
      meta = null;
    }

    return renderReelLandingPage({
      reelId,
      origin,
      meta,
      androidStoreUrl: env.appLink.androidStoreUrl,
      iosStoreUrl: env.appLink.iosStoreUrl,
    });
  },

  /**
   * Browser fallback for https://<origin>/trip/shared/:token. Reuses the same
   * signed-token verification (and sanitized projection) as the public API, so
   * an invalid/expired token still renders an install/Open-in-app page instead
   * of the API's JSON 400.
   */
  async tripLandingPage(token: string, origin: string): Promise<string> {
    let meta: Partial<TripShareMeta> | null;
    try {
      const trip = await tripsService.getSharedTrip(token);
      meta = {
        title: trip.title ?? '',
        destination: trip.destination ?? '',
        days: typeof trip.days === 'number' ? trip.days : 0,
        coverImage: trip.coverImage ?? '',
      };
    } catch {
      meta = null;
    }

    return renderTripLandingPage({
      token,
      origin,
      meta,
      androidStoreUrl: env.appLink.androidStoreUrl,
      iosStoreUrl: env.appLink.iosStoreUrl,
    });
  },
};
