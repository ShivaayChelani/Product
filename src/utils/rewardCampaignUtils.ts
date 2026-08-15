import type { Campaign } from '../services/api/campaigns';

/** ACTIVE status is the published flag (matches backend campaign-eligibility). */
export function isRewardCampaignPublished(campaign: Pick<Campaign, 'status'>): boolean {
  return String(campaign.status || '').toUpperCase() === 'ACTIVE';
}

export function isRewardCampaignLive(
  campaign: Pick<Campaign, 'status' | 'startDate' | 'endDate' | 'remainingWinnerSlots'>,
  now = Date.now(),
): boolean {
  if (!isRewardCampaignPublished(campaign)) return false;
  if ((campaign.remainingWinnerSlots ?? 0) <= 0) return false;
  const start = new Date(campaign.startDate).getTime();
  const end = new Date(campaign.endDate).getTime();
  if (!Number.isNaN(start) && start > now) return false;
  if (!Number.isNaN(end) && end < now) return false;
  return true;
}

export type UserCampaignClaim = {
  campaignId: string;
  status?: string;
};

function userClaimCount(claims: UserCampaignClaim[], campaignId: string): number {
  return claims.filter(c => c.campaignId === campaignId).length;
}

export function isCampaignAvailableToUser(
  campaign: Campaign,
  claims: UserCampaignClaim[],
  now = Date.now(),
): boolean {
  if (!isRewardCampaignLive(campaign, now)) return false;
  const max = campaign.maxClaimsPerUser ?? 1;
  return userClaimCount(claims, campaign.id) < max;
}

/** Lowest pointsRequired campaign the user has not max-claimed and has not reached yet. */
export function pickNextRewardCampaign(
  campaigns: Campaign[],
  palPointsBalance: number,
  claims: UserCampaignClaim[] = [],
  now = Date.now(),
): Campaign | null {
  const eligible = campaigns
    .filter(c => isCampaignAvailableToUser(c, claims, now))
    .sort((a, b) => (a.pointsRequired ?? 0) - (b.pointsRequired ?? 0));

  if (!eligible.length) return null;

  const nextByProgress = eligible.find(c => palPointsBalance < (c.pointsRequired ?? 0));
  return nextByProgress ?? eligible[0];
}
