import { useQuery } from '@tanstack/react-query';
import { vendorsApi, VendorPublicDetails, VendorReel } from '../../../services/api/vendors';
import { filterLiveVendorOffers } from '../utils/vendorFilters';

export type VendorMapDetail = VendorPublicDetails & {
  promoReel: VendorReel | null;
  reelCount: number;
  offerCount: number;
};

async function loadVendorMapDetail(vendorId: string): Promise<VendorMapDetail> {
  const [detailRes, reelsRes] = await Promise.all([
    vendorsApi.getVendorDetails(vendorId),
    vendorsApi.getVendorReels(vendorId),
  ]);
  const detail = (detailRes as { data?: VendorPublicDetails })?.data
    ?? (detailRes as unknown as VendorPublicDetails);
  const reelsRaw = (reelsRes as { data?: VendorReel[] })?.data ?? (reelsRes as unknown as VendorReel[]);
  const reels = Array.isArray(reelsRaw) ? reelsRaw : [];
  const promoReel = reels.find(r => r.thumbnail || r.videoUrl) ?? reels[0] ?? null;
  
  const activeOffers = filterLiveVendorOffers(detail.offers);
  
  return {
    ...detail,
    offers: activeOffers,
    promoReel,
    reelCount: reels.length,
    offerCount: activeOffers.length,
  };
}

export function useVendorMapDetail(vendorId: string | null) {
  return useQuery({
    queryKey: ['vendor-map-detail', vendorId],
    queryFn: () => loadVendorMapDetail(vendorId!),
    enabled: !!vendorId,
    staleTime: 60_000,
  });
}
