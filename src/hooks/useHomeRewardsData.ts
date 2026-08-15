import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { getCampaigns, getUserClaims } from '../services/api/campaigns';
import { rewardsApi } from '../services/api/rewards';
import type { HomeOfferItem } from '../components/home/OffersEventsSection';
import {
  pickNextRewardCampaign,
  type UserCampaignClaim,
  isRewardCampaignLive,
} from '../utils/rewardCampaignUtils';
import type { Campaign } from '../services/api/campaigns';
import type { NearbyVendorOfferItem } from '../components/home/VendorOffersNearYouSection';
import { mapPublicOffersToNearbyCards } from '../utils/homeVendorOffers';
import {
  pickFeaturedLiveOffer,
  unwrapRewardsOffersList,
  vendorOfferItemToHomeOffer,
} from '../utils/vendorOfferEligibility';

type Options = {
  palPointsBalance: number;
  isGuest: boolean;
  latitude?: number | null;
  longitude?: number | null;
};

type HomeRewardsState = {
  homeOffer: HomeOfferItem | null;
  nearbyVendorOffers: NearbyVendorOfferItem[];
  loading: boolean;
  refresh: () => Promise<void>;
  nextCampaign: Campaign | null;
};

function unwrapClaims(payload: unknown): UserCampaignClaim[] {
  if (!payload) return [];
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { data?: unknown[] })?.data)
      ? (payload as { data: unknown[] }).data
      : [];
  return list
    .map((row: { campaignId?: string; campaign?: { id?: string }; status?: string }) => ({
      campaignId: row.campaignId || row.campaign?.id || '',
      status: row.status,
    }))
    .filter((r: UserCampaignClaim) => !!r.campaignId);
}

export function useHomeRewardsData({
  palPointsBalance,
  isGuest,
  latitude,
  longitude,
}: Options): HomeRewardsState {
  const [homeOffer, setHomeOffer] = useState<HomeOfferItem | null>(null);
  const [nearbyVendorOffers, setNearbyVendorOffers] = useState<NearbyVendorOfferItem[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [userClaims, setUserClaims] = useState<UserCampaignClaim[]>([]);
  const [loading, setLoading] = useState(true);

  const nextCampaign = useMemo(
    () => pickNextRewardCampaign(campaigns, palPointsBalance, userClaims),
    [campaigns, palPointsBalance, userClaims],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const offerParams: Record<string, string | number> = { limit: 40, page: 1 };
      if (latitude != null && longitude != null && !Number.isNaN(latitude) && !Number.isNaN(longitude)) {
        offerParams.lat = latitude;
        offerParams.lng = longitude;
      }

      const tasks: Promise<unknown>[] = [
        rewardsApi.listOffers(offerParams),
        getCampaigns({ status: 'ACTIVE', limit: 50 }),
      ];
      if (!isGuest) {
        tasks.push(getUserClaims());
      }

      const results = await Promise.allSettled(tasks);
      const offersRes = results[0];
      const campaignsRes = results[1];
      const claimsRes = !isGuest ? results[2] : undefined;

      if (offersRes.status === 'fulfilled') {
        const raw = (offersRes.value as { data?: unknown })?.data ?? offersRes.value;
        const list = unwrapRewardsOffersList(raw);
        const featured = pickFeaturedLiveOffer(list);
        setHomeOffer(featured ? vendorOfferItemToHomeOffer(featured) : null);
        const origin =
          latitude != null && longitude != null && !Number.isNaN(latitude) && !Number.isNaN(longitude)
            ? { latitude, longitude }
            : null;
        setNearbyVendorOffers(mapPublicOffersToNearbyCards(list, origin, 6));
      } else {
        setHomeOffer(null);
        setNearbyVendorOffers([]);
      }

      if (claimsRes?.status === 'fulfilled') {
        setUserClaims(unwrapClaims(claimsRes.value));
      } else {
        setUserClaims([]);
      }

      if (campaignsRes.status === 'fulfilled') {
        const list = Array.isArray(campaignsRes.value) ? campaignsRes.value : [];
        setCampaigns(list.filter(c => isRewardCampaignLive(c)));
      } else {
        setCampaigns([]);
      }
    } finally {
      setLoading(false);
    }
  }, [isGuest, latitude, longitude]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return {
    homeOffer,
    nearbyVendorOffers,
    loading,
    refresh: load,
    nextCampaign,
  };
}
