export interface TouristSpot {
  id: string;
  name: string;
  city: string;
  district?: string;
  state: string;
  country?: string;
  latitude: number;
  longitude: number;
  category:
    | 'nature'
    | 'waterfall'
    | 'river'
    | 'ghat'
    | 'viewpoint'
    | 'temple'
    | 'fort'
    | 'palace'
    | 'museum'
    | 'garden'
    | 'park'
    | 'wildlife'
    | 'heritage'
    | 'spiritual'
    | 'adventure'
    | 'photography'
    | 'cultural'
    | 'hidden_gem'
    | 'local_experience'
    | 'lake'
    | 'church'
    | 'mosque'
    | 'gurudwara'
    | 'monument'
    | 'beach'
    | 'market'
    | 'trek'
    | 'history'
    | string;
  subCategory?: string;
  difficulty: 'easy' | 'medium' | 'hard';
  imageUri?: string | null;
  imageUrl?: string | null;
  localImage?: any;
  source?: 'curated' | 'overpass' | 'wikimedia' | 'nominatim' | 'fallback';
  wikiTitle?: string;
  shortDescription?: string;
  fullDescription?: string;
  description?: string;
  history?: string;
  recommendedDuration?: string;
  hasParking?: boolean;
  parkingDetails?: string;
  isAccessible?: boolean;
  accessibilityDetails?: string;
  hasWashroom?: boolean;
  isPetFriendly?: boolean;
  emergencyContact?: string;
  bestTimeToVisit?: 'sunrise' | 'morning' | 'afternoon' | 'evening' | 'sunset' | 'night' | 'any' | 'monsoon' | any;
  bestTimeReason?: string;
  bestTimeVisit?: {
    from: string;
    to: string;
    label?: string;
  };
  openingHours?: string;
  estimatedDuration?: number;
  entryFee?: number;
  averageCost?: number;
  safetyTip?: string;
  rating?: number;
  reviewCount?: number;
  tags?: string[];
  points?: number;
  nearbyVendorIds?: string[];
  trivia?: {
    question: string;
    options: string[];
    correctIndex: number;
    funFact: string;
  };
  mustVisit?: boolean;
  isHiddenGem?: boolean;
  isLocalFavorite?: boolean;
  badgeIcon?: string;
  verificationStatus?: 'verified' | 'pending' | 'unverified';
  dataSource?: string;
  lastVerifiedAt?: string;
  fee?: string | number | null;
  website?: string | null;
  opening_hours?: string | null;
  wikipedia?: string | null;
}

export interface UserProfile {
  uid: string;
  email?: string;
  phoneNumber: string;
  displayName: string;
  avatarStyle: number;
  avatar?: string;
  city?: string;
  travelInterests?: string[];
  /** Legacy presentation role retained for older screens. */
  role: 'tourist' | 'vendor' | 'creator' | 'admin';
  /** Roles granted by the server (approved/active capabilities). */
  roles?: string[];
  /** Role assignment details when returned by API. */
  roleAssignments?: Array<{ role: string; status: string; rejectedReason?: string | null }>;
  /** Denormalized specialty for legacy dual-write; prefer `roles` for multi-role. */
  permission?: UserPermission;
  /** Currently selected app shell among approved roles. */
  activeMode?: UserActiveMode;
  /** Alias of activeMode for older screens. */
  activeRole?: string;
  totalPoints: number;
  visitedSpots: string[];
  currentItinerary: string[];
  completedItineraryStops?: string[];
  completedActivities: string[];
  redemptions: string[];
  redeemedOffers?: VendorOfferRedemption[];
  totalSavings?: number;
  reviewsCount?: number;
  createdAt: number;
  lastActive: number;
  interests?: string[];
  budget?: 'low' | 'medium' | 'high';
  travelPace?: 'relaxed' | 'moderate' | 'fast';
  createdReels?: string[];
  likedReels?: string[];
  bio?: string;
  creatorProfile?: {
    id: string;
    username: string;
    fullName?: string | null;
    bio?: string;
    travelCategories?: string[];
    instagramUrl?: string | null;
    youtubeUrl?: string | null;
    facebookUrl?: string | null;
    languages?: string[];
    portfolioLinks?: string[];
    sampleReelUrl?: string | null;
    applicationReason?: string | null;
    rejectionReason?: string | null;
    status: ProfessionalRoleStatus;
    followerCount: number;
    totalViews: number;
    verified: boolean;
  };
  vendor?: {
    id: string;
    businessName: string;
    status?: ProfessionalRoleStatus | string;
    vendorCode?: string;
  };
  badges?: string[];
}

export type UserPermission = 'USER' | 'VENDOR' | 'CONTENT_CREATOR' | 'ADMIN';
export type UserActiveMode = UserPermission;

/** Lifecycle of a professional (Vendor / Creator) profile. RETIRED = given up when switching roles. */
export type ProfessionalRoleStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'CHANGES_REQUESTED'
  | 'SUSPENDED'
  | 'PAUSED'
  | 'RETIRED';

export interface UserPosition {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp?: number;
}

export interface ItinerarySpot extends TouristSpot {
  order: number;
  distanceFromPrevious?: number;
}

export type ScreenName =
  | 'home'
  | 'map'
  | 'itinerary'
  | 'offers'
  | 'profile'
  | 'spotDetail'
  | 'offerDetail'
  | 'vendorRegister'
  | 'vendorLogin'
  | 'vendorDashboard'
  | 'createOffer'
  | 'vendorRedemption'
  | 'adminVerification'
  | 'adminHiddenGemReview'
  | 'rewardsWallet'
  | 'memories'
  | 'reelsFeed'
  | 'createReel'
  | 'reelDetail'
  | 'credits'
  | 'addHiddenGem'
  | 'myContributions';

export interface VendorBusiness {
  id: string;
  businessName: string;
  ownerName?: string;
  category: VendorCategory;
  linkedSpotIds: string[];
  city: string;
  state: string;
  address: string;
  latitude?: number;
  longitude?: number;
  phone?: string;
  email?: string;
  password?: string;
  description?: string;
  openingHours?: string;
  imageUrl?: string;
  website?: string;
  operatingHours?: string;
  images?: string[];
  verificationStatus: 'pending' | 'approved' | 'rejected' | 'changes_requested' | 'suspended' | 'paused' | 'retired';
  qrCodeValue?: string;
  vendorCode?: string;
  createdAt?: string;
  approvedAt?: string;
  rejectedReason?: string;
  ownerIdType?: OwnerIdType;
  ownerIdNumber?: string;
  businessProofType?: BusinessProofType;
  businessProofNumber?: string;
  ownerProofImageUri?: string;
  businessProofImageUri?: string;
  showOnMap?: boolean;
  showContact?: boolean;
  showWebsite?: boolean;
  showImages?: boolean;
  showOffers?: boolean;
  showReels?: boolean;
  showNavigation?: boolean;
}

export type VendorCategory =
  | 'cafe'
  | 'restaurant'
  | 'hotel'
  | 'homestay'
  | 'guide'
  | 'bike_rental'
  | 'car_rental'
  | 'boating'
  | 'adventure'
  | 'tour_experience'
  | 'event_organizer';

export type OwnerIdType = 'aadhaar' | 'pan' | 'voter_id' | 'driving_license' | 'passport' | 'other';
export type BusinessProofType = 'shop_registration' | 'gst' | 'fssai' | 'hotel_license' | 'tourism_license' | 'local_body_license' | 'event_permission' | 'other';

export interface VendorOffer {
  id: string;
  vendorId: string;
  linkedSpotId?: string;
  offerTitle: string;
  offerDescription: string;
  discountType: 'flat' | 'percentage' | 'freebie';
  discountValue: number;
  pointsRequired: number;
  minBillAmount?: number;
  bonusPointsReward?: number;
  couponCode?: string;
  dailyLimit?: number;
  validTill?: string;
  startDate?: string;
  isActive: boolean;
  isApproved?: boolean;
  imageUrl?: string;
  currentRedemptions?: number;
  viewCount?: number;
  clickCount?: number;
  createdAt?: string;
  pausedAt?: string | null;
  rejectionReason?: string | null;
  category?: string;
}

export interface VendorOfferRedemption {
  id: string;
  userId: string;
  vendorId: string;
  offerId: string;
  pointsSpent: number;
  discountReceived: number;
  redeemedAt: string;
  status: 'pending' | 'verified' | 'cancelled';
  verificationCode: string;
  verifiedAt?: string;
  userName?: string;
  offerTitle?: string;
}

export interface City {
  id: string;
  name: string;
  state: string;
  latitude: number;
  longitude: number;
  description: string;
  imageUrl?: string;
  spotCount: number;
}

export interface TourismEvent {
  id: string;
  organizerId: string;
  title: string;
  description: string;
  city: string;
  state: string;
  linkedSpotId?: string;
  latitude?: number;
  longitude?: number;
  startDate: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  entryType: 'free' | 'paid';
  ticketPrice?: number;
  pointsReward?: number;
  imageUrl?: string;
  verificationStatus: 'pending' | 'approved' | 'rejected';
  isActive: boolean;
  createdAt: string;
}

export interface CreatorProfile {
  id: string;
  userId: string;
  username: string;
  fullName?: string | null;
  bio: string | null;
  avatar: string | null;
  travelCategories?: string[];
  instagramUrl?: string | null;
  youtubeUrl?: string | null;
  facebookUrl?: string | null;
  languages?: string[];
  portfolioLinks?: string[];
  sampleReelUrl?: string | null;
  applicationReason?: string | null;
  followerCount: number;
  totalViews: number;
  verified: boolean;
  status: ProfessionalRoleStatus;
  isFollowing?: boolean;
  followingCount?: number;
  reels?: Reel[];
  createdAt: string;
  badges?: string[];
  totalLikes?: number;
  reelCount?: number;
  citiesCount?: number;
  coverImageUrl?: string | null;
  locationLabel?: string | null;
}

export interface CreatorDashboard {
  profile: CreatorProfile & { followingCount: number };
  reelCount: number;
  totalLikes: number;
  totalComments: number;
  totalShares?: number;
  totalSaves?: number;
  dailyReward: { claimedToday: boolean; pointsIfClaimed: number };
  recentReels: Reel[];
}

export interface CreatorAnalytics {
  period: '7d' | '30d' | 'all';
  kpis: { views: number; likes: number; comments: number; shares?: number; saves: number; engagementRate: number };
  topReels: Reel[];
  note: string;
}

export interface CreatorReelPage {
  items: (Reel & { commentsCount: number })[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface CreatorLeaderboardEntry {
  id: string;
  username: string;
  fullName?: string | null;
  avatar?: string | null;
  verified: boolean;
  followerCount: number;
  totalViews: number;
  travelCategories: string[];
}

export interface Reel {
  id: string;
  creatorId: string;
  videoUrl: string;
  thumbnail: string | null;
  title: string | null;
  description: string | null;
  /** PENDING | APPROVED | REJECTED | HIDDEN — HIDDEN used as studio "Drafts" */
  status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'HIDDEN' | string;
  likes: number;
  views: number;
  shares: number;
  saves: number;
  featured: boolean;
  rewardPoints: number;
  dailyRewardClaimed?: boolean;
  dailyRewardDate?: string;
  placeId: string | null;
  vendorId: string | null;
  eventId: string | null;
  createdAt: string;
  creator: {
    id: string;
    username: string;
    avatar: string | null;
    verified: boolean;
    userId: string;
  };
  place?: {
    id: string;
    name: string;
    city: string;
    state: string;
  } | null;
  vendor?: {
    id: string;
    businessName: string;
    city: string;
    state: string;
  } | null;
  event?: {
    id: string;
    title: string;
  } | null;
  isCollaboration?: boolean;
  collaborationId?: string | null;
  collaboration?: {
    id: string;
    campaignTitle: string;
    status: string;
    vendor?: {
      id: string;
      businessName: string;
      city: string;
      state: string;
    } | null;
    creator?: {
      id: string;
      username: string;
      fullName: string | null;
      avatar: string | null;
      verified: boolean;
    } | null;
  } | null;
  isLiked?: boolean;
  isSaved?: boolean;
  isFollowingCreator?: boolean;
  comments?: ReelComment[];
}

export interface ReelComment {
  id: string;
  reelId: string;
  userId: string;
  text: string;
  createdAt: string;
  user: {
    id: string;
    name: string;
  };
}

export interface Activity {
  id: string;
  spotId: string;
  type:
    | 'gps_checkin'
    | 'trivia'
    | 'observation'
    | 'hidden_gem_discovery'
    | 'safar_moment'
    | 'itinerary_stop_completion';
  title: string;
  description: string;
  points: number;
  unlockRadiusMeters: number;
  requiresGps: boolean;
  isRepeatable: boolean;
  category?: string;
}

export interface HiddenGemSubmission {
  id: string;
  userId: string;
  userName: string;
  placeName: string;
  category: HiddenGemCategory;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  imageUri?: string;
  description: string;
  bestTimeToVisit: { from: string; to: string; label?: string } | null;
  estimatedCost: string;
  safetyTip: string;
  worthVisitingReason: string;
  locationMethod: 'gps' | 'map_pick' | 'manual';
  status: 'pending' | 'approved' | 'rejected' | 'merged';
  submittedAt: number;
  reviewedAt?: number;
  reviewedBy?: string;
  rejectionReason?: string;
  pointsReward: number;
  duplicateOf?: string;
}

export type HiddenGemCategory =
  | 'waterfall'
  | 'sunset_point'
  | 'old_temple'
  | 'local_viewpoint'
  | 'photo_spot'
  | 'river_ghat'
  | 'small_fort'
  | 'nature_trail'
  | 'cultural_place'
  | 'lake'
  | 'cave'
  | 'wildlife'
  | 'heritage'
  | 'other';

export interface HiddenGemQualityReward {
  basic: number;
  good: number;
  high: number;
}