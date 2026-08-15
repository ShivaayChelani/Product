export { apiClient } from './client';
export type { StandardApiResponse } from './client';
export { authApi } from './auth';
export type { LoginResponse, RegisterInput, LoginInput } from './auth';
export { placesApi } from './places';
export type { PlaceResponse, CreatePlaceInput, PlaceListQuery, NearbyQuery, ClusterQuery, PlaceStats, MapCluster, MapPlacePin } from './places';
export { usersApi } from './users';
export { uploadApi } from './upload';
export { gamificationApi } from './gamification';
export type { WalletProfileResponse, LeaderboardEntry } from './gamification';
export { searchApi } from './search';
export type { SearchQuery } from './search';
export { hiddenGemsApi } from './hiddenGems';
export type { HiddenGemSubmission, CreateHiddenGemInput, HiddenGemListQuery, ApproveHiddenGemInput, RejectHiddenGemInput } from './hiddenGems';
export { vendorsApi } from './vendors';
export type { Vendor, NearbyVendor, VendorPublicDetails, VendorReel, VendorListQuery, VerifyVendorInput } from './vendors';
export { notificationsApi } from './notifications';
export type { RegisterDeviceTokenInput, InAppNotification, NotificationsListResponse } from './notifications';
export { redemptionsApi } from './redemptions';
export type { ServerRedemption } from './redemptions';
export { socialApi } from './social';
export { collaborationsApi } from './collaborations';
export type {
  CollaborationItem,
  CollaborationStatus,
  CreateCollaborationPayload,
} from './collaborations';
export { walletApi } from './wallet';
export type { WalletProfile, WalletTransaction } from './wallet';
export { rewardsApi } from './rewards';
export type { RewardCatalogItem, VendorOfferItem, NearbyReward } from './rewards';
export { pointRulesApi } from './pointRules';
export type { PointRule } from './pointRules';
import * as campaignsApi from './campaigns';
export { campaignsApi };
export type { Campaign } from './campaigns';
export { riddlesApi } from './riddles';
export { aiApi } from './ai';
export type { TripPlanResult, TripPlanDay, TripPlanStop } from './ai';
export { ridesApi } from './rides';
export type {
  RideProvider,
  RideProviderConfig,
  RideProviderId,
  RideProviderCapability,
  ProviderStatus,
  RideOpenRequest,
  RideOpenResponse,
} from './rides';
export { legalApi } from './legal';
export type { LegalDocumentType, LegalContentFormat, LegalDocumentPayload, LegalTypeSummary } from './legal';
export { monetizationApi } from './monetization';
export type { Entitlements, PlanAudience } from './monetization';
export { userPlaceImagesApi } from './userPlaceImages';
export type { ContributionStatus, UserPlaceImage } from './userPlaceImages';
