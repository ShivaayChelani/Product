import { apiClient, type StandardApiResponse } from './client';

export type CollaborationStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'IN_PROGRESS'
  | 'REEL_UPLOADED'
  | 'REVISION_REQUESTED'
  | 'APPROVED'
  | 'COMPLETED'
  | 'SUSPENDED';

export type DeliverableType = 'REEL' | 'STORY' | 'CAROUSEL' | 'STATIC_POST';

export interface CollaborationDeliverable {
  id: string;
  type: DeliverableType;
  quantity: number;
}

export interface CollaborationParty {
  id: string;
  businessName?: string;
  username?: string;
  fullName?: string;
  avatar?: string | null;
  verified?: boolean;
  city?: string;
  state?: string;
  imageUrl?: string | null;
  status?: string;
}

export interface CollaborationItem {
  id: string;
  campaignTitle: string;
  campaignCategory: string;
  businessName: string;
  businessLocation?: string | null;
  budgetPaise: number;
  budgetFormatted: string;
  campaignBrief: string;
  expectedShootDate?: string | null;
  expectedUploadDate?: string | null;
  campaignDurationDays?: number | null;
  status: CollaborationStatus;
  deliverables: CollaborationDeliverable[];
  deliverablesSummary: string;
  vendor: CollaborationParty;
  creator: CollaborationParty;
  reel?: {
    id: string;
    videoUrl: string;
    thumbnail?: string | null;
    title?: string | null;
    status: string;
    views: number;
    likes: number;
    isCollaboration: boolean;
  } | null;
  analytics?: Record<string, number> | null;
  contactsUnlocked: boolean;
  contactPerson?: string | null;
  contactPhone?: string | null;
  contactWhatsApp?: string | null;
  contactEmail?: string | null;
  rejectionReason?: string | null;
  cancellationReason?: string | null;
  revisionFeedback?: string | null;
  notes?: string | null;
  viewerRole?: 'vendor' | 'creator' | 'admin' | 'other';
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedCollaborations {
  data: CollaborationItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext?: boolean;
    hasPrev?: boolean;
  };
}

export interface CreateCollaborationPayload {
  creatorProfileId: string;
  campaignTitle: string;
  campaignCategory: string;
  budgetPaise: number;
  deliverables: { type: DeliverableType; quantity: number }[];
  campaignBrief: string;
  expectedShootDate?: string;
  expectedUploadDate?: string;
  campaignDurationDays?: number;
  contactPerson: string;
  contactPhone: string;
  contactWhatsApp?: string;
  contactEmail: string;
  notes?: string;
  attachments?: string[];
}

export const collaborationsApi = {
  create(payload: CreateCollaborationPayload) {
    return apiClient.post<StandardApiResponse<CollaborationItem>>('/collaborations', payload);
  },

  listVendor(params?: Record<string, string | undefined>) {
    const qs = new URLSearchParams();
    Object.entries(params || {}).forEach(([k, v]) => { if (v) qs.set(k, v); });
    const q = qs.toString();
    return apiClient.get<PaginatedCollaborations & { success?: boolean }>(
      `/collaborations/vendor${q ? `?${q}` : ''}`,
    );
  },

  listCreator(params?: Record<string, string | undefined>) {
    const qs = new URLSearchParams();
    Object.entries(params || {}).forEach(([k, v]) => { if (v) qs.set(k, v); });
    const q = qs.toString();
    return apiClient.get<PaginatedCollaborations & { success?: boolean }>(
      `/collaborations/creator${q ? `?${q}` : ''}`,
    );
  },

  listUploadEligible() {
    return apiClient.get<StandardApiResponse<CollaborationItem[]>>('/collaborations/creator/upload-eligible');
  },

  getById(id: string) {
    return apiClient.get<StandardApiResponse<CollaborationItem>>(`/collaborations/${id}`);
  },

  canCollaborate(creatorProfileId: string) {
    return apiClient.get<StandardApiResponse<{
      allowed: boolean;
      reason?: string;
      collaborationId?: string;
      needsSubscription?: boolean;
    }>>(
      `/collaborations/vendor/can-collaborate/${creatorProfileId}`,
    );
  },

  accept(id: string) {
    return apiClient.post<StandardApiResponse<CollaborationItem>>(`/collaborations/${id}/accept`, {});
  },

  reject(id: string, reason: string) {
    return apiClient.post<StandardApiResponse<CollaborationItem>>(`/collaborations/${id}/reject`, { reason });
  },

  cancel(id: string, reason?: string) {
    return apiClient.post<StandardApiResponse<CollaborationItem>>(`/collaborations/${id}/cancel`, { reason });
  },

  markInProgress(id: string) {
    return apiClient.post<StandardApiResponse<CollaborationItem>>(`/collaborations/${id}/in-progress`, {});
  },

  submitReel(id: string, payload: { videoUrl: string; thumbnail?: string; title?: string; description?: string; placeId?: string }) {
    return apiClient.post<StandardApiResponse<CollaborationItem>>(`/collaborations/${id}/submit-reel`, payload);
  },

  approveReel(id: string) {
    return apiClient.post<StandardApiResponse<CollaborationItem>>(`/collaborations/${id}/approve-reel`, {});
  },

  publishReel(id: string) {
    return apiClient.post<StandardApiResponse<CollaborationItem>>(`/collaborations/${id}/publish-reel`, {});
  },

  requestRevision(id: string, feedback: string) {
    return apiClient.post<StandardApiResponse<CollaborationItem>>(`/collaborations/${id}/request-revision`, { feedback });
  },

  rejectReel(id: string, reason: string) {
    return apiClient.post<StandardApiResponse<CollaborationItem>>(`/collaborations/${id}/reject-reel`, { reason });
  },
};

export const COLLABORATION_CATEGORIES = [
  'Food & Dining',
  'Stay & Hospitality',
  'Adventure & Activities',
  'Shopping & Retail',
  'Events & Entertainment',
  'Wellness & Spa',
  'Travel & Tours',
  'Other',
] as const;
