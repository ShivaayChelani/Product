import type { RewardCampaign } from '@prisma/client';

/** ACTIVE status is the published/live campaign flag (no separate isPublished column). */
export function isRewardCampaignPublished(campaign: Pick<RewardCampaign, 'status'>): boolean {
  return String(campaign.status).toUpperCase() === 'ACTIVE';
}

export function isRewardCampaignLive(
  campaign: Pick<
    RewardCampaign,
    'status' | 'startDate' | 'endDate' | 'remainingWinnerSlots'
  >,
  now = new Date(),
): boolean {
  if (!isRewardCampaignPublished(campaign)) return false;
  if ((campaign.remainingWinnerSlots ?? 0) <= 0) return false;
  if (campaign.startDate > now) return false;
  if (campaign.endDate < now) return false;
  return true;
}

export function publicActiveCampaignsWhere(now = new Date()) {
  return {
    status: 'ACTIVE' as const,
    remainingWinnerSlots: { gt: 0 },
    startDate: { lte: now },
    endDate: { gte: now },
  };
}

export function userCanClaimCampaign(
  campaign: Pick<RewardCampaign, 'maxClaimsPerUser'>,
  existingClaimCount: number,
): boolean {
  const max = campaign.maxClaimsPerUser ?? 1;
  return existingClaimCount < max;
}
