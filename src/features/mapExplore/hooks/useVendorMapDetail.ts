import { useQuery } from '@tanstack/react-query';
import { vendorsApi, VendorPublicDetails, VendorReel, TaggedCreatorReel } from '../../../services/api/vendors';
import { filterLiveVendorOffers } from '../utils/vendorFilters';

export type VendorMapDetail = VendorPublicDetails & {
  vendorReels: VendorReel[];
  promoReel: VendorReel | null;
  reelCount: number;
  offerCount: number;
  pendingTaggedReels: TaggedCreatorReel[];
  isOwner: boolean;
};

async function loadVendorMapDetail(vendorId: string): Promise<VendorMapDetail> {
  const [detailRes, reelsRes, tagged] = await Promise.all([
    vendorsApi.getVendorDetails(vendorId),
    vendorsApi.getVendorReels(vendorId),
    vendorsApi.getTaggedCreatorReels(vendorId).catch(() => ({
      reels: [] as TaggedCreatorReel[],
      pending: [] as TaggedCreatorReel[],
      isOwner: false,
    })),
  ]);
  const detail = (detailRes as { data?: VendorPublicDetails })?.data
    ?? (detailRes as unknown as VendorPublicDetails);
  const reelsRaw = (reelsRes as { data?: VendorReel[] })?.data ?? (reelsRes as unknown as VendorReel[]);
  const vendorReels = Array.isArray(reelsRaw) ? reelsRaw : [];
  const promoReel = vendorReels.find(r => r.thumbnail || r.videoUrl) ?? vendorReels[0] ?? null;
  const taggedApproved = Array.isArray(tagged.reels) ? tagged.reels : [];
  const pendingTaggedReels = Array.isArray(tagged.pending) ? tagged.pending : [];

  const activeOffers = filterLiveVendorOffers(detail.offers);

  return {
    ...detail,
    offers: activeOffers,
    vendorReels,
    promoReel,
    reelCount: taggedApproved.length,
    offerCount: activeOffers.length,
    pendingTaggedReels,
    isOwner: Boolean(tagged.isOwner),
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
