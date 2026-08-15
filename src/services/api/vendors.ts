import { apiClient } from './client';
import { API_CONFIG } from '../../config/api';

export interface Vendor {
  id: string;
  userId: string;
  businessName: string;
  businessType: string;
  vendorCode?: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  latitude: number | null;
  longitude: number | null;
  description: string | null;
  imageUrl: string | null;
  website: string | null;
  operatingHours: string | null;
  images: string[];
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED' | 'SUSPENDED' | 'PAUSED' | 'RETIRED';
  rejectionReason: string | null;
  linkedSpotIds: string[];
  services: string[] | null;
  showOnMap: boolean;
  showContact: boolean;
  showWebsite: boolean;
  showImages: boolean;
  showOffers: boolean;
  showReels: boolean;
  showNavigation: boolean;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
}

export interface NearbyVendor {
  id: string;
  businessName: string;
  businessType: string;
  latitude: number;
  longitude: number;
  city: string;
  state: string;
  imageUrl: string | null;
  description: string | null;
  showContact: boolean;
  showWebsite: boolean;
  showImages: boolean;
  showOffers: boolean;
  showReels: boolean;
  showNavigation: boolean;
}

export interface VendorPublicDetails {
  id: string;
  businessName: string;
  businessType: string;
  description: string | null;
  address: string;
  city: string;
  state: string;
  latitude: number | null;
  longitude: number | null;
  imageUrl: string | null;
  website: string | null;
  operatingHours: string | null;
  images: string[];
  phone: string | null;
  showContact: boolean;
  showWebsite: boolean;
  showImages: boolean;
  showOffers: boolean;
  showReels: boolean;
  showNavigation: boolean;
  rating?: number | null;
  reviewCount?: number;
  offers: VendorPublicOffer[];
}

export interface VendorReview {
  id: string;
  rating: number;
  content: string | null;
  photos?: string[];
  helpfulVotes?: number;
  createdAt: string;
  /** Server-confirmed PalPoints for first eligible review (review_write rule). */
  pointsAwarded?: number;
  updated?: boolean;
  user?: {
    id?: string;
    name?: string;
    avatarStyle?: number;
    avatar?: string | null;
  };
}

export interface VendorPublicOffer {
  id: string;
  title: string;
  description: string | null;
  discountType: string;
  discountValue: number;
  pointsRequired: number;
  validTill: string | null;
  imageUrl?: string | null;
  banner?: string | null;
}

export interface VendorReel {
  id: string;
  vendorId: string;
  videoUrl: string;
  thumbnail: string | null;
  title: string | null;
  description: string | null;
  views: number;
  likes: number;
  createdAt: string;
}

export interface TaggedCreatorReel {
  id: string;
  videoUrl: string;
  thumbnail: string | null;
  title: string | null;
  description: string | null;
  vendorListingStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  creator: {
    id: string;
    username: string;
    avatar: string | null;
  };
}

export interface TaggedCreatorReelsResponse {
  reels: TaggedCreatorReel[];
  pending: TaggedCreatorReel[];
  isOwner: boolean;
}

export interface VendorListQuery {
  page?: number;
  limit?: number;
  status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED';
  search?: string;
}

export interface VerifyVendorInput {
  status: 'APPROVED' | 'REJECTED';
  rejectionReason?: string;
}

export const vendorsApi = {
  async list(query?: VendorListQuery) {
    const params = new URLSearchParams();
    if (query) {
      Object.entries(query).forEach(([k, v]) => {
        if (v !== undefined) params.set(k, String(v));
      });
    }
    const qs = params.toString();
    return apiClient.get<Vendor[]>(
      `${API_CONFIG.endpoints.vendors.list}${qs ? `?${qs}` : ''}`,
    );
  },

  async getById(id: string) {
    return apiClient.get<Vendor>(
      API_CONFIG.endpoints.vendors.byId(id),
    );
  },

  async verify(id: string, input: VerifyVendorInput) {
    const res = await apiClient.patch<Vendor>(
      API_CONFIG.endpoints.vendors.verify(id),
      input,
    );
    return res.data;
  },

  // ── Auth-required vendor endpoints ──

  async register(input: {
    businessName: string;
    businessType: string;
    phone: string;
    address: string;
    city: string;
    state: string;
    description?: string;
    operatingHours?: string;
    linkedSpotIds?: string[];
    latitude?: number;
    longitude?: number;
    website?: string;
    imageUrl?: string;
    images?: string[];
    showOnMap?: boolean;
    showContact?: boolean;
    showWebsite?: boolean;
    showImages?: boolean;
    showOffers?: boolean;
    showReels?: boolean;
    showNavigation?: boolean;
    /** Set after the user confirmed that applying will retire their Content Creator role. */
    confirmSwitch?: boolean;
  }) {
    const res = await apiClient.post<Vendor>(
      API_CONFIG.endpoints.vendors.register,
      input,
    );
    return res.data;
  },

  async getMe() {
    return apiClient.get<Vendor | null>(
      API_CONFIG.endpoints.vendors.me,
    );
  },

  async updateMe(input: {
    businessName?: string;
    businessType?: string;
    phone?: string;
    address?: string;
    city?: string;
    state?: string;
    latitude?: number;
    longitude?: number;
    description?: string;
    imageUrl?: string;
    website?: string | null;
    operatingHours?: string | null;
    images?: string[];
    linkedSpotIds?: string[];
    services?: unknown;
    showOnMap?: boolean;
    showContact?: boolean;
    showWebsite?: boolean;
    showImages?: boolean;
    showOffers?: boolean;
    showReels?: boolean;
    showNavigation?: boolean;
  }) {
    const res = await apiClient.patch<Vendor>(
      API_CONFIG.endpoints.vendors.me,
      input,
    );
    return res.data;
  },

  // ── Offers ──

  async createOffer(input: {
    title: string;
    description?: string;
    discountType: string;
    discountValue: number;
    pointsRequired: number;
    minBillAmount?: number;
    couponCode?: string;
    dailyLimit?: number;
    validTill?: string;
    startDate?: string;
  }) {
    const res = await apiClient.post<any>(
      API_CONFIG.endpoints.vendors.offers.create,
      input,
    );
    return res.data;
  },

  async listMyOffers() {
    return apiClient.get<any[]>(
      API_CONFIG.endpoints.vendors.offers.mine,
    );
  },

  async updateOffer(id: string, input: any) {
    const res = await apiClient.patch<any>(
      API_CONFIG.endpoints.vendors.offers.update(id),
      input,
    );
    return res.data;
  },

  async deleteOffer(id: string) {
    const res = await apiClient.delete<any>(
      API_CONFIG.endpoints.vendors.offers.delete(id),
    );
    return res.data;
  },

  // ── Public endpoints for map ──

  async getNearbyVendors(query: { lat: number; lng: number; radiusKm?: number }) {
    const params = new URLSearchParams();
    params.set('lat', String(query.lat));
    params.set('lng', String(query.lng));
    if (query.radiusKm != null) params.set('radiusKm', String(query.radiusKm));
    return apiClient.get<NearbyVendor[]>(
      `${API_CONFIG.endpoints.vendors.nearby}?${params.toString()}`,
    );
  },

  async listHotels(query?: { city?: string; state?: string; page?: number; limit?: number; search?: string }) {
    const params = new URLSearchParams();
    if (query) {
      Object.entries(query).forEach(([k, v]) => {
        if (v !== undefined) params.set(k, String(v));
      });
    }
    const qs = params.toString();
    return apiClient.get<Vendor[]>(`/vendors/hotels${qs ? `?${qs}` : ''}`);
  },

  async listRestaurants(query?: { city?: string; state?: string; page?: number; limit?: number; search?: string }) {
    const params = new URLSearchParams();
    if (query) {
      Object.entries(query).forEach(([k, v]) => {
        if (v !== undefined) params.set(k, String(v));
      });
    }
    const qs = params.toString();
    return apiClient.get<Vendor[]>(`/vendors/restaurants${qs ? `?${qs}` : ''}`);
  },

  async listForMap(search?: string) {
    const q = search?.trim();
    const qs = q ? `?search=${encodeURIComponent(q)}` : '';
    return apiClient.get<Vendor[]>(
      `${API_CONFIG.endpoints.vendors.mapList}${qs}`,
    );
  },

  async searchForLocation(search: string, limit = 12) {
    const q = search.trim();
    if (!q) {
      return { success: true, data: [] as Vendor[], message: '' };
    }
    const params = new URLSearchParams();
    params.set('q', q);
    if (limit) params.set('limit', String(limit));
    return apiClient.get<Vendor[]>(
      `${API_CONFIG.endpoints.vendors.locationSearch}?${params.toString()}`,
    );
  },

  async mapInViewport(query: {
    north: number;
    south: number;
    east: number;
    west: number;
    category?: string;
    limit?: number;
  }) {
    const params = new URLSearchParams();
    params.set('north', String(query.north));
    params.set('south', String(query.south));
    params.set('east', String(query.east));
    params.set('west', String(query.west));
    if (query.category) params.set('category', query.category);
    if (query.limit) params.set('limit', String(query.limit));
    const res = await apiClient.get<Vendor[]>(
      `${API_CONFIG.endpoints.vendors.map}?${params.toString()}`,
    );
    return (res as any)?.data ?? res;
  },

  async getVendorDetails(id: string) {
    return apiClient.get<VendorPublicDetails>(
      API_CONFIG.endpoints.vendors.details(id),
    );
  },

  async getVendorReels(id: string) {
    return apiClient.get<VendorReel[]>(
      API_CONFIG.endpoints.vendors.reels(id),
    );
  },

  async getTaggedCreatorReels(id: string) {
    const res = await apiClient.get<TaggedCreatorReelsResponse>(
      API_CONFIG.endpoints.vendors.taggedReels(id),
    );
    const data = (res as any)?.data ?? res;
    return {
      reels: Array.isArray(data?.reels) ? data.reels : [],
      pending: Array.isArray(data?.pending) ? data.pending : [],
      isOwner: Boolean(data?.isOwner),
    } as TaggedCreatorReelsResponse;
  },

  async listMyPendingTaggedReels() {
    const res = await apiClient.get<TaggedCreatorReel[]>(
      API_CONFIG.endpoints.vendors.myTaggedReels,
    );
    const data = (res as any)?.data ?? res;
    return Array.isArray(data) ? data : [];
  },

  async allowTaggedCreatorReel(reelId: string) {
    const res = await apiClient.post<TaggedCreatorReel>(
      API_CONFIG.endpoints.vendors.allowTaggedReel(reelId),
    );
    return (res as any)?.data ?? res;
  },

  async rejectTaggedCreatorReel(reelId: string) {
    const res = await apiClient.post<TaggedCreatorReel>(
      API_CONFIG.endpoints.vendors.rejectTaggedReel(reelId),
    );
    return (res as any)?.data ?? res;
  },

  async getReviews(id: string) {
    const res = await apiClient.get<VendorReview[]>(
      `${API_CONFIG.endpoints.vendors.reviews(id)}?limit=50`,
    );
    return Array.isArray(res.data) ? res.data : [];
  },

  async addReview(id: string, rating: number, content: string) {
    const res = await apiClient.post<VendorReview>(
      API_CONFIG.endpoints.vendors.review(id),
      { rating, content },
    );
    return res.data ?? (res as unknown as VendorReview);
  },

  async markReviewHelpful(vendorId: string, reviewId: string) {
    const res = await apiClient.post<VendorReview>(
      API_CONFIG.endpoints.vendors.reviewHelpful(vendorId, reviewId),
    );
    return res.data;
  },

  async createVendorReel(input: {
    videoUrl: string;
    thumbnail?: string;
    title?: string;
    description?: string;
  }) {
    const res = await apiClient.post<VendorReel>(
      API_CONFIG.endpoints.vendors.createReel,
      input,
    );
    return res.data;
  },

  async deleteVendorReel(reelId: string) {
    await apiClient.delete<void>(
      API_CONFIG.endpoints.vendors.deleteReel(reelId),
    );
  },

  async updateVendorReel(reelId: string, input: { title?: string; description?: string }) {
    const res = await apiClient.patch<VendorReel>(
      API_CONFIG.endpoints.vendors.updateReel(reelId),
      input,
    );
    return res.data;
  },

  // ── New: Offer lifecycle ──

  async getOfferById(id: string) {
    return apiClient.get<any>(API_CONFIG.endpoints.vendors.offers.byId(id));
  },

  async pauseOffer(id: string) {
    const res = await apiClient.post<any>(API_CONFIG.endpoints.vendors.offers.pause(id));
    return res.data;
  },

  async resumeOffer(id: string) {
    const res = await apiClient.post<any>(API_CONFIG.endpoints.vendors.offers.resume(id));
    return res.data;
  },

  async duplicateOffer(id: string) {
    const res = await apiClient.post<any>(API_CONFIG.endpoints.vendors.offers.duplicate(id));
    return res.data;
  },

  async recordOfferView(id: string) {
    await apiClient.post(API_CONFIG.endpoints.vendors.offers.view(id));
  },

  async recordOfferClick(id: string) {
    await apiClient.post(API_CONFIG.endpoints.vendors.offers.click(id));
  },

  // ── Dashboard & Analytics ──

  async getListingPreview() {
    const res = await apiClient.get<any>(API_CONFIG.endpoints.vendors.listingPreview);
    return (res as any)?.data ?? res;
  },

  async getDashboard() {
    return apiClient.get<any>(API_CONFIG.endpoints.vendors.dashboard);
  },

  async getAnalytics(period?: string) {
    const params = period ? `?period=${period}` : '';
    return apiClient.get<any>(`${API_CONFIG.endpoints.vendors.analytics}${params}`);
  },

  async getOfferAnalytics(id: string) {
    return apiClient.get<any>(API_CONFIG.endpoints.vendors.offerAnalytics(id));
  },
};