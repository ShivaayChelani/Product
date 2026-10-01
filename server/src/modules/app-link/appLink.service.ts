import { env } from '../../config/env';
import { socialService } from '../social/social.service';
import { ApiError } from '../../shared/utils/ApiError';
import {
  buildAppleAppSiteAssociation,
  buildAssetLinks,
  isSafePublicId,
  renderReelLandingPage,
  type ReelShareMeta,
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
};
