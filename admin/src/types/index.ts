export type AppRole =
  | "ADMIN"
  | "SUPER_ADMIN"
  | "OPS_ADMIN"
  | "USER"
  | "VENDOR"
  | "CONTENT_CREATOR"
  | "VENDOR_MANAGER"
  | "CONTENT_MODERATOR"
  | "FINANCE_MANAGER"
  | "SUPPORT_AGENT"
  | "MARKETING_ADMIN"
  | "ANALYTICS_VIEWER";

export type RoleAssignmentStatus =
  | "PENDING" | "APPROVED" | "ACTIVE" | "REJECTED"
  | "CHANGES_REQUESTED" | "SUSPENDED" | "PAUSED" | "RETIRED";

export interface RoleAssignment {
  id: string;
  role: AppRole;
  status: RoleAssignmentStatus;
  createdAt: string;
  updatedAt: string;
}

/** Vendor application fields shown on admin user detail (role approval review). */
export interface UserVendorApplication {
  id: string;
  businessName?: string;
  businessType?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  latitude?: number | null;
  longitude?: number | null;
  description?: string | null;
  imageUrl?: string | null;
  website?: string | null;
  operatingHours?: string | null;
  images?: string[];
  gstNumber?: string | null;
  documents?: string[];
  status?: string;
  rejectionReason?: string | null;
  vendorCode?: string | null;
  linkedSpotIds?: string[];
  services?: unknown;
  createdAt?: string;
  updatedAt?: string;
  reviewedAt?: string | null;
}

/** Creator application fields shown on admin user detail (role approval review). */
export interface UserCreatorApplication {
  id: string;
  fullName?: string | null;
  username?: string;
  bio?: string | null;
  avatar?: string | null;
  travelCategories?: string[];
  instagramUrl?: string | null;
  youtubeUrl?: string | null;
  facebookUrl?: string | null;
  languages?: string[];
  governmentIdUrl?: string | null;
  portfolioLinks?: string[];
  sampleReelUrl?: string | null;
  applicationReason?: string | null;
  status?: string;
  rejectionReason?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  permission: AppRole;
  activeMode: AppRole;
  verificationStatus?: string;
  createdAt: string;
  updatedAt: string;
  vendor?: UserVendorApplication | null;
  creatorProfile?: UserCreatorApplication | null;
  roleAssignments?: RoleAssignment[];
  approvedRoles?: AppRole[];
  roles?: AppRole[];
  activeRole?: AppRole;
  role?: AppRole;
}

export interface Place {
  id: string;
  name: string;
  slug: string;
  description: string;
  shortDescription?: string;
  category: string;
  latitude: number;
  longitude: number;
  images: string[];
  thumbnail?: string;
  tags: string[];
  status: "PENDING" | "APPROVED" | "REJECTED";
  source?: string;
  city: string;
  state: string;
  country: string;
  isHiddenGem: boolean;
  hiddenGemScore?: number;
  popularityScore?: number;
  editorialPriority?: number;
  rating?: number;
  reviewCount: number;
  verificationLevel: number;
  submittedBy: { id: string; name: string };
  submittedByUser?: User;
  createdAt: string;
  updatedAt: string;
  bestTimeToVisit?: { from: string; to: string; bestMonths: string } | string;
  bestTimeReason?: string;
  /** Day-keyed shifts, or legacy { from, to }. Empty array for a day = closed. */
  openingHours?: Record<string, { open: string; close: string }[] | string> | {
    from?: string;
    to?: string;
    till?: string;
  };
  ticketPrice?: {
    currency?: string;
    adult?: number;
    child?: number;
    foreigner?: number;
  } | null;
}

export interface PlaceOpeningShift {
  open: string;
  close: string;
}

export interface PlaceFormData {
  name: string;
  description: string;
  shortDescription?: string;
  category: string;
  /** Used when category === "other" */
  customCategory?: string;
  latitude: number;
  longitude: number;
  city: string;
  state: string;
  country: string;
  images: string[];
  tags: string[];
  editorialPriority: number;
  bestTimeFrom?: string;
  bestTimeTo?: string;
  bestTimeMonths?: string;
  bestTimeReason?: string;
  /** @deprecated Prefer openingShifts — kept for older call sites */
  openingFrom?: string;
  openingTo?: string;
  openingShifts?: PlaceOpeningShift[];
  closedDays?: string[];
  ticketAdult?: string;
  ticketChild?: string;
  ticketForeigner?: string;
  isFreeEntry?: boolean;
}

export interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorId: string;
  actor?: User;
  previousValues: Record<string, unknown>;
  newValues: Record<string, unknown>;
  createdAt: string;
}

export interface SyncStats {
  total: number;
  pending: number;
  completed: number;
  failed: number;
  processing: number;
}

export interface SyncItem {
  id: string;
  userId: string;
  action: string;
  entityType: string;
  payload: Record<string, unknown>;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  retryCount: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AnalyticsData {
  dailyUsers: { date: string; count: number }[];
  topPlaces: { name: string; visits: number }[];
  topCategories: { category: string; count: number }[];
  gameCompletions: { date: string; count: number }[];
  uploads: { date: string; count: number }[];
  approvals: { date: string; count: number }[];
}

export interface Report {
  id: string;
  type: string;
  entityType: string;
  entityId: string;
  reporterId: string;
  reason: string;
  status: "PENDING" | "RESOLVED" | "DISMISSED";
  createdAt: string;
  updatedAt: string;
}

export interface Reel {
  id: string;
  title: string;
  videoUrl: string;
  placeId: string;
  userId: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface SingleResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}
