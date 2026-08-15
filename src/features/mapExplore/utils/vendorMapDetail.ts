import type {
  TaggedCreatorReel,
  TaggedCreatorReelsResponse,
  VendorPublicDetails,
  VendorReel,
} from '../../../services/api/vendors';
import { filterLiveVendorOffers } from './vendorFilters';

export type VendorMapDetail = VendorPublicDetails & {
  vendorReels: VendorReel[];
  promoReel: VendorReel | null;
  reelCount: number;
  offerCount: number;
  pendingTaggedReels: TaggedCreatorReel[];
  isOwner: boolean;
};

export function unwrapVendorList<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  if (!res || typeof res !== 'object') return [];
  const r = res as Record<string, unknown>;
  if (Array.isArray(r.data)) return r.data as T[];
  const nested = r.data;
  if (nested && typeof nested === 'object') {
    const n = nested as Record<string, unknown>;
    if (Array.isArray(n.data)) return n.data as T[];
    if (Array.isArray(n.reels)) return n.reels as T[];
  }
  return [];
}

export function unwrapVendorDetails(res: unknown): VendorPublicDetails | null {
  if (!res || typeof res !== 'object') return null;
  const r = res as Record<string, unknown>;
  const obj = (r.data && typeof r.data === 'object' && !Array.isArray(r.data)
    ? r.data
    : r) as Record<string, unknown>;
  if (!obj.id && !obj.businessName) return null;
  return {
    ...(obj as unknown as VendorPublicDetails),
    offers: Array.isArray(obj.offers) ? obj.offers as VendorPublicDetails['offers'] : [],
    images: Array.isArray(obj.images) ? obj.images as string[] : [],
  };
}

export function assembleVendorMapDetail(
  detail: VendorPublicDetails,
  vendorReels: VendorReel[],
  tagged: TaggedCreatorReelsResponse,
): VendorMapDetail {
  const taggedApproved = Array.isArray(tagged.reels) ? tagged.reels : [];
  const visibleVendorReels = detail.showReels === false ? [] : vendorReels.filter(Boolean);
  const activeOffers = detail.showOffers === false ? [] : filterLiveVendorOffers(detail.offers);
  return {
    ...detail,
    offers: activeOffers,
    vendorReels: visibleVendorReels,
    promoReel: visibleVendorReels.find(r => r.thumbnail || r.videoUrl) ?? visibleVendorReels[0] ?? null,
    reelCount: visibleVendorReels.length + taggedApproved.length,
    offerCount: activeOffers.length,
    pendingTaggedReels: Array.isArray(tagged.pending) ? tagged.pending : [],
    isOwner: Boolean(tagged.isOwner),
  };
}
