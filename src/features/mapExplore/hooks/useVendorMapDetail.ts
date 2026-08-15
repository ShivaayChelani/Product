import { useQuery } from '@tanstack/react-query';
import { vendorsApi, type TaggedCreatorReel, type VendorReel } from '../../../services/api/vendors';
import {
  assembleVendorMapDetail,
  unwrapVendorDetails,
  unwrapVendorList,
  type VendorMapDetail,
} from '../utils/vendorMapDetail';

export type { VendorMapDetail };

async function loadVendorMapDetail(vendorId: string): Promise<VendorMapDetail> {
  const [detailRes, reelsRes, tagged] = await Promise.all([
    vendorsApi.getVendorDetails(vendorId),
    vendorsApi.getVendorReels(vendorId).catch(() => []),
    vendorsApi.getTaggedCreatorReels(vendorId).catch(() => ({
      reels: [] as TaggedCreatorReel[],
      pending: [] as TaggedCreatorReel[],
      isOwner: false,
    })),
  ]);
  const detail = unwrapVendorDetails(detailRes);
  if (!detail?.id) {
    throw new Error('Unable to load vendor details.');
  }
  const vendorReels = unwrapVendorList<VendorReel>(reelsRes);

  return assembleVendorMapDetail(detail, vendorReels, tagged);
}

export function useVendorMapDetail(vendorId: string | null) {
  return useQuery({
    queryKey: ['vendor-map-detail', vendorId],
    queryFn: () => loadVendorMapDetail(vendorId!),
    enabled: !!vendorId,
    staleTime: 15_000,
  });
}
