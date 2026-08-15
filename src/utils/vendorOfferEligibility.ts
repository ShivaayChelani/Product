import type { VendorOfferItem } from '../services/api/rewards';
import type { VendorBusiness, VendorOffer, VendorOfferRedemption } from '../types';
import type { VendorCategory } from '../types';

export function offerDiscountLabel(offer: {
  discountType?: string;
  discountValue?: number;
}): string {
  const type = String(offer.discountType || 'percentage').toLowerCase();
  const value = Number(offer.discountValue ?? 0);
  if (type === 'percentage' || type === 'percent') return `${value}% OFF`;
  if (type === 'flat' || type === 'fixed') return `₹${value} OFF`;
  if (type === 'freebie' || type === 'bogo') return 'Freebie';
  return value > 0 ? `${value}% OFF` : 'Special';
}

export function unwrapRewardsOffersList(payload: unknown): VendorOfferItem[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload as VendorOfferItem[];
  const obj = payload as Record<string, unknown>;
  if (Array.isArray(obj.data)) return obj.data as VendorOfferItem[];
  if (Array.isArray(obj.items)) return obj.items as VendorOfferItem[];
  if (Array.isArray(obj.offers)) return obj.offers as VendorOfferItem[];
  return [];
}

/** Client-side mirror of server public offer eligibility — home must not surface stale offers. */
export function isLiveVendorOffer(item: VendorOfferItem, now = new Date()): boolean {
  if (item.isActive === false) return false;
  if (item.isApproved === false) return false;
  if (item.startDate) {
    const start = new Date(item.startDate);
    if (!Number.isNaN(start.getTime()) && start > now) return false;
  }
  if (item.validTill) {
    const end = new Date(item.validTill);
    if (!Number.isNaN(end.getTime())) {
      end.setHours(23, 59, 59, 999);
      if (end < now) return false;
    }
  }
  if (item.maxRedemptions != null && item.maxRedemptions > 0) {
    if ((item.currentRedemptions ?? 0) >= item.maxRedemptions) return false;
  }
  if (item.remainingRedemptions != null && item.remainingRedemptions <= 0) return false;
  return true;
}

export function pickFeaturedLiveOffer(list: VendorOfferItem[]): VendorOfferItem | null {
  const live = list.filter((item) => isLiveVendorOffer(item));
  if (!live.length) return null;
  return live.find(o => o.isFeatured) ?? live[0];
}

export function vendorOfferItemToHomeOffer(item: VendorOfferItem) {
  const city = item.vendor?.city?.trim();
  const state = item.vendor?.state?.trim();
  const location = [city, state].filter(Boolean).join(', ');
  return {
    id: item.id,
    title: item.title || 'Offer',
    subtitle: item.description?.trim() || location || item.vendor?.businessName || '',
    discountLabel: offerDiscountLabel(item),
    pointsRequired: item.pointsRequired ?? 0,
    imageUrl: item.imageUrl || item.vendor?.imageUrl || '',
  };
}

export type PublicVendorOfferDetail = VendorOfferItem & {
  remainingRedemptions?: number | null;
  minBillAmount?: number | null;
  dailyLimit?: number | null;
  couponCode?: string | null;
  createdAt?: string;
  vendor?: VendorOfferItem['vendor'] & {
    address?: string;
    operatingHours?: string | null;
  };
};

export function unwrapOfferDetail(payload: unknown): PublicVendorOfferDetail | null {
  if (!payload || typeof payload !== 'object') return null;
  const obj = payload as Record<string, unknown>;
  const data = (obj.data ?? payload) as PublicVendorOfferDetail;
  return data?.id ? data : null;
}

export type RedemptionApiPayload = {
  id: string;
  userId: string;
  vendorId: string;
  offerId: string;
  pointsSpent: number;
  discountValue: number;
  createdAt?: string;
  qrCode?: string;
  token?: string;
};

export function parseRedemptionPayload(res: unknown): RedemptionApiPayload | null {
  if (!res || typeof res !== 'object') return null;
  const obj = res as Record<string, unknown>;
  const raw = (obj.data ?? res) as Record<string, unknown>;
  if (!raw?.id) return null;
  return {
    id: String(raw.id),
    userId: String(raw.userId ?? ''),
    vendorId: String(raw.vendorId ?? ''),
    offerId: String(raw.offerId ?? ''),
    pointsSpent: Number(raw.pointsSpent ?? 0),
    discountValue: Number(raw.discountValue ?? 0),
    createdAt: raw.createdAt != null ? String(raw.createdAt) : undefined,
    qrCode: raw.qrCode != null ? String(raw.qrCode) : undefined,
    token: raw.token != null ? String(raw.token) : undefined,
  };
}

export function redemptionPayloadToRecord(payload: RedemptionApiPayload): VendorOfferRedemption {
  return {
    id: payload.id,
    userId: payload.userId,
    vendorId: payload.vendorId,
    offerId: payload.offerId,
    pointsSpent: payload.pointsSpent,
    discountReceived: payload.discountValue,
    redeemedAt: payload.createdAt ?? new Date().toISOString(),
    status: 'pending',
    verificationCode: payload.qrCode ?? payload.token ?? '',
  };
}

function normalizeDiscountType(type: string | undefined): VendorOffer['discountType'] {
  const t = String(type || 'percentage').toLowerCase();
  if (t === 'flat' || t === 'fixed') return 'flat';
  if (t === 'freebie' || t === 'bogo') return 'freebie';
  return 'percentage';
}

export function detailToVendorOffer(detail: PublicVendorOfferDetail): VendorOffer {
  return {
    id: detail.id,
    vendorId: detail.vendorId,
    offerTitle: detail.title,
    offerDescription: detail.description ?? '',
    discountType: normalizeDiscountType(detail.discountType),
    discountValue: detail.discountValue ?? 0,
    pointsRequired: detail.pointsRequired ?? 0,
    minBillAmount: detail.minBillAmount ?? undefined,
    couponCode: detail.couponCode ?? undefined,
    dailyLimit: detail.dailyLimit ?? undefined,
    validTill: detail.validTill ?? undefined,
    startDate: detail.startDate ?? undefined,
    isActive: detail.isActive,
    imageUrl: detail.imageUrl ?? undefined,
    currentRedemptions: detail.currentRedemptions,
    createdAt: detail.createdAt,
  };
}

export function detailToVendorBusiness(detail: PublicVendorOfferDetail): VendorBusiness {
  const v = detail.vendor;
  const category = (detail.category as VendorCategory | null) || 'cafe';
  return {
    id: v?.id ?? detail.vendorId,
    businessName: v?.businessName ?? 'Vendor',
    category,
    linkedSpotIds: [],
    city: v?.city ?? '',
    state: v?.state ?? '',
    address: v?.address ?? '',
    latitude: v?.latitude ?? undefined,
    longitude: v?.longitude ?? undefined,
    imageUrl: v?.imageUrl ?? undefined,
    verificationStatus: 'approved',
  };
}
