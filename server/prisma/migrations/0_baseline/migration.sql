-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'VENDOR', 'CONTENT_CREATOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "RoleAssignmentStatus" AS ENUM ('ACTIVE', 'PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED', 'PAUSED', 'RETIRED');

-- CreateEnum
CREATE TYPE "RiddleSubmissionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ContentModerationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PlaceStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PlaceDataQuality" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PlaceAliasType" AS ENUM ('OFFICIAL_VARIANT', 'NICKNAME', 'HISTORICAL', 'LOCAL_NAME', 'TRANSLITERATION', 'MISSPELLING', 'SEARCH_KEYWORD');

-- CreateEnum
CREATE TYPE "ImageVerificationStatus" AS ENUM ('UNVERIFIED', 'LICENSE_VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PlaceRelationshipType" AS ENUM ('NEARBY', 'PART_OF', 'ROUTE', 'SAME_COMPLEX', 'VIEWPOINT_OF', 'FESTIVAL_AT');

-- CreateEnum
CREATE TYPE "DuplicateCandidateStatus" AS ENUM ('OPEN', 'MERGED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "PlaceEmbeddingStatus" AS ENUM ('PENDING', 'INDEXED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "TravelPace" AS ENUM ('QUICK', 'BALANCED', 'RELAXED', 'VERY_RELAXED');

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('DRAFT', 'UPCOMING', 'ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TimeSlot" AS ENUM ('SUNRISE', 'MORNING', 'AFTERNOON', 'EVENING', 'SUNSET', 'NIGHT');

-- CreateEnum
CREATE TYPE "TimePreference" AS ENUM ('MORNING_FOCUSED', 'FULL_DAY', 'EVENING_FRIENDLY');

-- CreateEnum
CREATE TYPE "AvoidOption" AS ENUM ('CROWDED', 'LONG_TRAVEL', 'EXPENSIVE_ENTRY', 'NON_FAMILY_FRIENDLY');

-- CreateEnum
CREATE TYPE "GenerationSource" AS ENUM ('MANUAL', 'AI_PROMPT', 'HYBRID');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('PLACE_CREATED', 'PLACE_APPROVED', 'PLACE_REJECTED', 'PLACE_DELETED', 'PLACE_UPDATED', 'USER_ROLE_CHANGED', 'VENDOR_REGISTERED', 'VENDOR_VERIFIED', 'VENDOR_REJECTED', 'POINTS_EARNED', 'POINTS_REDEEMED', 'ROLE_RETIRED', 'LEGAL_VERSION_CREATED', 'LEGAL_VERSION_PUBLISHED', 'LEGAL_VERSION_ARCHIVED', 'LEGAL_VERSION_ROLLED_BACK', 'ANNOUNCEMENT_CREATED', 'ANNOUNCEMENT_UPDATED', 'ANNOUNCEMENT_DELETED', 'COLLABORATION_CREATED', 'COLLABORATION_ACCEPTED', 'COLLABORATION_REJECTED', 'COLLABORATION_SUSPENDED', 'COLLABORATION_COMPLETED');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('EARN', 'SPEND', 'REFUND');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "PlaceSource" AS ENUM ('CURATED', 'OSM', 'ADMIN', 'HIDDEN_GEM', 'VENDOR', 'WIKIMEDIA');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('NONE', 'CONTRIBUTOR', 'EXPLORER', 'EXPERT_GUIDE');

-- CreateEnum
CREATE TYPE "VendorStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'SUSPENDED', 'PAUSED', 'RETIRED');

-- CreateEnum
CREATE TYPE "RedemptionStatus" AS ENUM ('PENDING', 'VERIFIED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CreatorStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'SUSPENDED', 'PAUSED', 'RETIRED');

-- CreateEnum
CREATE TYPE "ReelStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'HIDDEN', 'DRAFT', 'ARCHIVED', 'SCHEDULED');

-- CreateEnum
CREATE TYPE "ReelReportStatus" AS ENUM ('PENDING', 'REVIEWED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SHIPPED', 'DELIVERED');

-- CreateEnum
CREATE TYPE "ChallengeDifficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "ChallengeProofType" AS ENUM ('PHOTO', 'VIDEO', 'QR', 'GPS');

-- CreateEnum
CREATE TYPE "ChallengeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "LegalDocumentType" AS ENUM ('PRIVACY_POLICY', 'TERMS_CONDITIONS', 'REWARDS_POLICY', 'COMMUNITY_GUIDELINES', 'VENDOR_TERMS', 'CREATOR_TERMS', 'REFUND_POLICY', 'ABOUT_US', 'CONTACT_INFO', 'FAQ');

-- CreateEnum
CREATE TYPE "LegalVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "LegalContentFormat" AS ENUM ('MARKDOWN', 'HTML', 'PLAIN');

-- CreateEnum
CREATE TYPE "AnnouncementSeverity" AS ENUM ('INFO', 'SUCCESS', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AnnouncementAudience" AS ENUM ('ALL', 'USER', 'VENDOR', 'CONTENT_CREATOR');

-- CreateEnum
CREATE TYPE "PlanAudience" AS ENUM ('USER_PREMIUM', 'VENDOR', 'CREATOR');

-- CreateEnum
CREATE TYPE "PlanBillingPeriod" AS ENUM ('MONTHLY', 'YEARLY', 'LIFETIME', 'SEMIANNUAL', 'QUARTERLY');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'GRACE', 'CANCELLED', 'EXPIRED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "VendorSubscriptionStatus" AS ENUM ('NONE', 'ACTIVE', 'GRACE', 'PAST_DUE', 'EXPIRED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('GOOGLE_PLAY', 'APPLE_IAP', 'RAZORPAY', 'ADMIN_GRANT');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('CREATED', 'PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CouponType" AS ENUM ('PERCENTAGE', 'FLAT', 'BOGO');

-- CreateEnum
CREATE TYPE "CouponOwnerType" AS ENUM ('ADMIN', 'VENDOR');

-- CreateEnum
CREATE TYPE "VendorDocumentType" AS ENUM ('GST', 'PAN', 'BUSINESS_LICENSE', 'SHOP_PHOTO', 'OWNER_ID', 'BANK_DETAILS', 'OTHER');

-- CreateEnum
CREATE TYPE "VendorDocumentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED');

-- CreateEnum
CREATE TYPE "FeatureAudience" AS ENUM ('USER_PREMIUM', 'VENDOR', 'CREATOR', 'ALL');

-- CreateEnum
CREATE TYPE "PlanHighlightType" AS ENUM ('MOST_POPULAR', 'BEST_VALUE', 'RECOMMENDED');

-- CreateEnum
CREATE TYPE "RideProviderMode" AS ENUM ('DEEPLINK', 'API');

-- CreateEnum
CREATE TYPE "RideRequestStatus" AS ENUM ('PENDING', 'OPENED', 'COMPLETED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "CollaborationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'EXPIRED', 'IN_PROGRESS', 'REEL_UPLOADED', 'REVISION_REQUESTED', 'APPROVED', 'COMPLETED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "CollaborationDeliverableType" AS ENUM ('REEL', 'STORY', 'CAROUSEL', 'STATIC_POST');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'NONE',
    "verified_at" TIMESTAMPTZ(6),
    "verified_by_id" TEXT,
    "permission" "Role" NOT NULL DEFAULT 'USER',
    "active_mode" "Role" NOT NULL DEFAULT 'USER',
    "razorpay_customer_id" TEXT,
    "bio" TEXT,
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "avatar_style" INTEGER NOT NULL DEFAULT 0,
    "avatar" TEXT,
    "badges" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "email_verified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_app_preferences" (
    "user_id" TEXT NOT NULL,
    "privacy" JSONB NOT NULL DEFAULT '{}',
    "notifications" JSONB NOT NULL DEFAULT '{}',
    "security" JSONB NOT NULL DEFAULT '{}',
    "appearance" JSONB NOT NULL DEFAULT '{}',
    "language" TEXT NOT NULL DEFAULT 'auto',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_app_preferences_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "user_blocks" (
    "id" TEXT NOT NULL,
    "blocker_id" TEXT NOT NULL,
    "blocked_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_feedback" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "category" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "status" "RoleAssignmentStatus" NOT NULL,
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "rejected_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "retired_at" TIMESTAMP(3),

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendors" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "business_name" TEXT NOT NULL,
    "business_type" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "description" TEXT,
    "image_url" TEXT,
    "status" "VendorStatus" NOT NULL DEFAULT 'PENDING',
    "rejection_reason" TEXT,
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "linked_spot_ids" TEXT[],
    "services" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "vendor_code" TEXT,
    "show_on_map" BOOLEAN NOT NULL DEFAULT true,
    "show_contact" BOOLEAN NOT NULL DEFAULT true,
    "show_website" BOOLEAN NOT NULL DEFAULT true,
    "show_images" BOOLEAN NOT NULL DEFAULT true,
    "show_offers" BOOLEAN NOT NULL DEFAULT true,
    "show_reels" BOOLEAN NOT NULL DEFAULT true,
    "show_navigation" BOOLEAN NOT NULL DEFAULT true,
    "gst_number" TEXT,
    "documents" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rating" DOUBLE PRECISION,
    "review_count" INTEGER NOT NULL DEFAULT 0,
    "subscription_status" "VendorSubscriptionStatus" NOT NULL DEFAULT 'NONE',
    "suspended_at" TIMESTAMP(3),
    "vendor_code_reset_count" INTEGER NOT NULL DEFAULT 0,
    "last_vendor_code_reset_at" TIMESTAMP(3),

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_offers" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "discount_type" TEXT NOT NULL,
    "discount_value" DOUBLE PRECISION NOT NULL,
    "points_required" INTEGER NOT NULL,
    "min_bill_amount" DOUBLE PRECISION,
    "coupon_code" TEXT,
    "daily_limit" INTEGER,
    "valid_till" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_reels" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "video_url" TEXT NOT NULL,
    "thumbnail" TEXT,
    "title" TEXT,
    "description" TEXT,
    "views" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_reels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "point_balances" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "lifetime_earned" INTEGER NOT NULL DEFAULT 0,
    "lifetime_spent" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "point_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "point_transactions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "reference_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" "TransactionType" NOT NULL DEFAULT 'EARN',

    CONSTRAINT "point_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "redemptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "offer_id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "points_spent" INTEGER NOT NULL,
    "discount_value" DOUBLE PRECISION NOT NULL,
    "discount_type" TEXT NOT NULL,
    "qr_code" TEXT NOT NULL,
    "status" "RedemptionStatus" NOT NULL DEFAULT 'PENDING',
    "verified_at" TIMESTAMP(3),
    "verified_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_sequences" (
    "year" INTEGER NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "receipt_sequences_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "pal_points" INTEGER NOT NULL DEFAULT 0,
    "lifetime_earned" INTEGER NOT NULL DEFAULT 0,
    "lifetime_spent" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" TEXT NOT NULL,
    "wallet_id" TEXT,
    "user_id" TEXT,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "reference_id" TEXT,
    "reference_type" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" "TransactionType" NOT NULL DEFAULT 'EARN',

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "redemption_tokens" (
    "id" TEXT NOT NULL,
    "redemption_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "used_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "redemption_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "point_rules" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "points" INTEGER NOT NULL,
    "xp_amount" INTEGER NOT NULL DEFAULT 0,
    "category" TEXT NOT NULL DEFAULT 'general',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "cooldown_sec" INTEGER,
    "max_daily" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "point_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward_catalog" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "points_required" INTEGER NOT NULL,
    "value" TEXT,
    "image_url" TEXT,
    "vendor_id" TEXT,
    "vendor_offer_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reward_catalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follows" (
    "id" TEXT NOT NULL,
    "follower_id" TEXT NOT NULL,
    "following_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "places" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "category" TEXT NOT NULL,
    "images" TEXT[],
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "PlaceStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "search_vector" tsvector,
    "approvedById" TEXT,
    "submittedById" TEXT NOT NULL,
    "location" geometry,
    "slug" TEXT NOT NULL,
    "short_description" TEXT,
    "thumbnail" TEXT,
    "city" TEXT NOT NULL DEFAULT '',
    "state" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT 'India',
    "rating" DOUBLE PRECISION,
    "review_count" INTEGER NOT NULL DEFAULT 0,
    "opening_hours" JSONB,
    "ticket_price" JSONB,
    "hidden_gem_score" DOUBLE PRECISION,
    "popularity_score" DOUBLE PRECISION,
    "verification_level" INTEGER NOT NULL DEFAULT 0,
    "source" "PlaceSource" NOT NULL DEFAULT 'HIDDEN_GEM',
    "external_id" TEXT,
    "rejection_reason" TEXT,
    "estimated_duration_minutes" INTEGER,
    "district" TEXT NOT NULL DEFAULT '',
    "village" TEXT NOT NULL DEFAULT '',
    "full_address" TEXT,
    "subcategory" TEXT,
    "highlights" JSONB,
    "search_keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "data_quality" "PlaceDataQuality" NOT NULL DEFAULT 'DRAFT',
    "featured_score" DOUBLE PRECISION,
    "verification_score" DOUBLE PRECISION,
    "last_verified_at" TIMESTAMPTZ(6),
    "google_maps_url" TEXT,
    "merged_into_id" TEXT,
    "public_place_id" TEXT,
    "tehsil" TEXT NOT NULL DEFAULT '',
    "postal_code" TEXT NOT NULL DEFAULT '',
    "elevation_meters" DOUBLE PRECISION,
    "geohash" TEXT,
    "plus_code" TEXT,
    "unesco_status" TEXT,
    "heritage_status" TEXT,
    "religious_type" TEXT,
    "natural_cultural" TEXT,
    "quality_score" DOUBLE PRECISION,
    "confidence_score" DOUBLE PRECISION,
    "trending_score" DOUBLE PRECISION,
    "bayesian_rating" DOUBLE PRECISION,
    "last_verified_by_id" TEXT,
    "embedding_status" "PlaceEmbeddingStatus" NOT NULL DEFAULT 'PENDING',
    "embedding_version" TEXT,
    "embedding_updated_at" TIMESTAMP(3),
    "editorial_priority" INTEGER NOT NULL DEFAULT 3,

    CONSTRAINT "places_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "place_images" (
    "id" TEXT NOT NULL,
    "place_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "license" TEXT,
    "license_url" TEXT,
    "attribution" TEXT,
    "photographer" TEXT,
    "source_url" TEXT,
    "verification_status" "ImageVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "owner" TEXT,
    "copyright_notice" TEXT,
    "license_expires_at" TIMESTAMPTZ(6),
    "commercial_use" BOOLEAN,
    "modification_allowed" BOOLEAN,
    "perceptual_hash" TEXT,
    "width_px" INTEGER,
    "height_px" INTEGER,
    "quality_score" DOUBLE PRECISION,

    CONSTRAINT "place_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "place_aliases" (
    "id" TEXT NOT NULL,
    "place_id" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "normalized_alias" TEXT NOT NULL,
    "locale" TEXT,
    "alias_type" "PlaceAliasType" NOT NULL DEFAULT 'SEARCH_KEYWORD',
    "source" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "place_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "place_merge_logs" (
    "id" TEXT NOT NULL,
    "canonical_place_id" TEXT NOT NULL,
    "merged_place_id" TEXT NOT NULL,
    "merged_by_id" TEXT,
    "reason" TEXT,
    "preserved_aliases" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "place_merge_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "place_public_id_sequences" (
    "prefix" TEXT NOT NULL,
    "last_value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "place_public_id_sequences_pkey" PRIMARY KEY ("prefix")
);

-- CreateTable
CREATE TABLE "place_field_provenance" (
    "id" TEXT NOT NULL,
    "place_id" TEXT NOT NULL,
    "field_name" TEXT NOT NULL,
    "value_json" JSONB,
    "source_type" TEXT NOT NULL,
    "source_uri" TEXT,
    "confidence" DOUBLE PRECISION,
    "verified_by_id" TEXT,
    "verified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "place_field_provenance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "place_versions" (
    "id" TEXT NOT NULL,
    "place_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "change_summary" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "place_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "place_relationships" (
    "id" TEXT NOT NULL,
    "from_place_id" TEXT NOT NULL,
    "to_place_id" TEXT NOT NULL,
    "relationship_type" "PlaceRelationshipType" NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "place_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "place_quality_checks" (
    "id" TEXT NOT NULL,
    "place_id" TEXT NOT NULL,
    "check_code" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "details" JSONB,
    "checked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "place_quality_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "place_duplicate_candidates" (
    "id" TEXT NOT NULL,
    "place_a_id" TEXT NOT NULL,
    "place_b_id" TEXT NOT NULL,
    "confidence_score" DOUBLE PRECISION NOT NULL,
    "status" "DuplicateCandidateStatus" NOT NULL DEFAULT 'OPEN',
    "signals" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),

    CONSTRAINT "place_duplicate_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "place_change_history" (
    "id" TEXT NOT NULL,
    "place_id" TEXT NOT NULL,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "place_change_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "place_verification_logs" (
    "id" TEXT NOT NULL,
    "place_id" TEXT NOT NULL,
    "verified_by_id" TEXT,
    "verification_score" DOUBLE PRECISION,
    "quality_score" DOUBLE PRECISION,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "place_verification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "place_translations" (
    "id" TEXT NOT NULL,
    "place_id" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "field_name" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "source" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "place_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "place_boundary_validation" (
    "id" TEXT NOT NULL,
    "place_id" TEXT NOT NULL,
    "within_india" BOOLEAN NOT NULL,
    "state_valid" BOOLEAN,
    "district_valid" BOOLEAN,
    "method" TEXT NOT NULL DEFAULT 'bbox',
    "details" JSONB,
    "validated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "place_boundary_validation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "place_search_embeddings" (
    "place_id" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "embedding" DOUBLE PRECISION[],
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "place_search_embeddings_pkey" PRIMARY KEY ("place_id")
);

-- CreateTable
CREATE TABLE "deleted_place_refs" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "curated_id" TEXT,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL DEFAULT '',
    "state" TEXT NOT NULL DEFAULT '',
    "external_id" TEXT,
    "deleted_by_id" TEXT,
    "deleted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deleted_place_refs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_place_images" (
    "id" TEXT NOT NULL,
    "place_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "points_awarded" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by" TEXT,

    CONSTRAINT "user_place_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "place_videos" (
    "id" TEXT NOT NULL,
    "place_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "thumbnail" TEXT,
    "title" TEXT,
    "duration" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "place_videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "place_offers" (
    "id" TEXT NOT NULL,
    "place_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "discount" TEXT,
    "valid_from" TIMESTAMPTZ(6),
    "valid_until" TIMESTAMPTZ(6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "place_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "place_events" (
    "id" TEXT NOT NULL,
    "place_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "image_url" TEXT,
    "start_date" TIMESTAMPTZ(6) NOT NULL,
    "end_date" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "place_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "place_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "content" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ContentModerationStatus" NOT NULL DEFAULT 'APPROVED',

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_reviews" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "content" TEXT,
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "helpful_votes" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ContentModerationStatus" NOT NULL DEFAULT 'APPROVED',

    CONSTRAINT "vendor_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "check_ins" (
    "id" TEXT NOT NULL,
    "place_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "check_ins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "place_stats" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL DEFAULT 'view',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "placeId" TEXT NOT NULL,
    "userId" TEXT,

    CONSTRAINT "place_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collections" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_places" (
    "id" TEXT NOT NULL,
    "collection_id" TEXT NOT NULL,
    "place_id" TEXT NOT NULL,
    "note" TEXT,
    "added_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_places_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_plans" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "user_id" TEXT NOT NULL,
    "days" INTEGER NOT NULL DEFAULT 1,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "TripStatus" NOT NULL DEFAULT 'DRAFT',
    "pace" "TravelPace" NOT NULL DEFAULT 'BALANCED',
    "time_preference" "TimePreference",
    "avoid" "AvoidOption"[] DEFAULT ARRAY[]::"AvoidOption"[],
    "estimated_budget" DOUBLE PRECISION,
    "custom_budget_amount" DOUBLE PRECISION,
    "generation_source" "GenerationSource" NOT NULL DEFAULT 'MANUAL',
    "ai_prompt" TEXT,
    "ai_preferences" JSONB,
    "generated_at" TIMESTAMP(3),

    CONSTRAINT "trip_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_plan_days" (
    "id" TEXT NOT NULL,
    "trip_plan_id" TEXT NOT NULL,
    "day_number" INTEGER NOT NULL,
    "theme" TEXT,

    CONSTRAINT "trip_plan_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_plan_stops" (
    "id" TEXT NOT NULL,
    "trip_plan_day_id" TEXT NOT NULL,
    "place_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "time_slot" "TimeSlot",
    "notes" TEXT,
    "entry_fee" DOUBLE PRECISION,
    "reason" TEXT,
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "trip_plan_stops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_collaborators" (
    "id" TEXT NOT NULL,
    "trip_plan_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'EDITOR',

    CONSTRAINT "trip_collaborators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_generation_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "trip_plan_id" TEXT,
    "prompt" JSONB NOT NULL,
    "raw_prompt_text" TEXT,
    "provider" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_generation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "previous_values" JSONB,
    "new_values" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "placeId" TEXT,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_queue" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "sync_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'unknown',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "in_app_notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "data" JSONB,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "in_app_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creator_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "bio" TEXT,
    "avatar" TEXT,
    "follower_count" INTEGER NOT NULL DEFAULT 0,
    "total_views" INTEGER NOT NULL DEFAULT 0,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "status" "CreatorStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "full_name" TEXT,
    "travel_categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "instagram_url" TEXT,
    "youtube_url" TEXT,
    "sample_reel_url" TEXT,
    "application_reason" TEXT,
    "facebook_url" TEXT,
    "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "government_id_url" TEXT,
    "portfolio_links" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rejection_reason" TEXT,
    "membership_plan_id" TEXT,
    "membership_expires_at" TIMESTAMP(3),
    "upload_limit" INTEGER,

    CONSTRAINT "creator_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reels" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "video_url" TEXT NOT NULL,
    "thumbnail" TEXT,
    "title" TEXT,
    "description" TEXT,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "saves" INTEGER NOT NULL DEFAULT 0,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "status" "ReelStatus" NOT NULL DEFAULT 'APPROVED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "scheduled_at" TIMESTAMP(3),
    "collaboration_id" TEXT,
    "is_collaboration" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "reels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reel_reports" (
    "id" TEXT NOT NULL,
    "reel_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ReelReportStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reel_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creator_daily_rewards" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "reel_id" TEXT NOT NULL,
    "reward_date" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 100,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creator_daily_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reel_comments" (
    "id" TEXT NOT NULL,
    "reel_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reel_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reel_likes" (
    "id" TEXT NOT NULL,
    "reel_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reel_likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reel_saves" (
    "id" TEXT NOT NULL,
    "reel_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reel_saves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'string',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "type" TEXT NOT NULL DEFAULT 'system',
    "category" TEXT NOT NULL DEFAULT 'general',
    "variables" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "riddles" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "clue" TEXT NOT NULL,
    "hint_image" TEXT,
    "correct_place_name" TEXT NOT NULL,
    "correct_lat" DOUBLE PRECISION,
    "correct_lng" DOUBLE PRECISION,
    "city" TEXT NOT NULL,
    "reward_points" INTEGER NOT NULL DEFAULT 100,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "riddles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "riddle_submissions" (
    "id" TEXT NOT NULL,
    "riddle_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "photo_url" TEXT NOT NULL,
    "status" "RiddleSubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "admin_comment" TEXT,
    "points_awarded" INTEGER NOT NULL DEFAULT 0,
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "riddle_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward_campaigns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "image_url" TEXT,
    "points_required" INTEGER NOT NULL,
    "total_winner_slots" INTEGER NOT NULL,
    "remaining_winner_slots" INTEGER NOT NULL,
    "max_claims_per_user" INTEGER NOT NULL DEFAULT 1,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "terms_and_conditions" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reward_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward_claims" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "redemption_id" TEXT NOT NULL,
    "points_spent" INTEGER NOT NULL,
    "status" "ClaimStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "claimed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reward_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenges" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "difficulty" "ChallengeDifficulty" NOT NULL,
    "category" TEXT NOT NULL,
    "proof_required" "ChallengeProofType" NOT NULL,
    "status" "ChallengeStatus" NOT NULL DEFAULT 'PENDING',
    "rejection_reason" TEXT,
    "creator_id" TEXT,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "is_trending" BOOLEAN NOT NULL DEFAULT false,
    "completions_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenge_completions" (
    "id" TEXT NOT NULL,
    "challenge_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "proof_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "challenge_completions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_query_logs" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "result_count" INTEGER NOT NULL DEFAULT 0,
    "user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_query_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_documents" (
    "id" TEXT NOT NULL,
    "type" "LegalDocumentType" NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "legal_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_document_versions" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "format" "LegalContentFormat" NOT NULL DEFAULT 'MARKDOWN',
    "status" "LegalVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "effective_date" TIMESTAMP(3),
    "change_summary" TEXT,
    "created_by_id" TEXT,
    "published_by_id" TEXT,
    "published_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "legal_document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "severity" "AnnouncementSeverity" NOT NULL DEFAULT 'INFO',
    "audience" "AnnouncementAudience" NOT NULL DEFAULT 'ALL',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "link_url" TEXT,
    "link_label" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" TEXT NOT NULL,
    "audience" "PlanAudience" NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "badge" TEXT,
    "color" TEXT DEFAULT '#B9834B',
    "status" "PlanStatus" NOT NULL DEFAULT 'DRAFT',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "features" JSONB NOT NULL DEFAULT '{}',
    "trial_days" INTEGER NOT NULL DEFAULT 0,
    "grace_period_days" INTEGER NOT NULL DEFAULT 3,
    "google_product_id_monthly" TEXT,
    "google_product_id_yearly" TEXT,
    "apple_product_id_monthly" TEXT,
    "apple_product_id_yearly" TEXT,
    "razorpay_plan_id_monthly" TEXT,
    "razorpay_plan_id_yearly" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "icon_url" TEXT,
    "banner_url" TEXT,
    "promo_text" TEXT,
    "is_most_popular" BOOLEAN NOT NULL DEFAULT false,
    "is_best_value" BOOLEAN NOT NULL DEFAULT false,
    "is_recommended" BOOLEAN NOT NULL DEFAULT false,
    "scheduled_activate_at" TIMESTAMP(3),
    "scheduled_expire_at" TIMESTAMP(3),

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_prices" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "period" "PlanBillingPeriod" NOT NULL,
    "amount_paise" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "audience" "PlanAudience" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "billing_period" "PlanBillingPeriod" NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "provider_subscription_id" TEXT,
    "provider_customer_id" TEXT,
    "current_period_start" TIMESTAMP(3) NOT NULL,
    "current_period_end" TIMESTAMP(3) NOT NULL,
    "grace_ends_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "auto_renew" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_transactions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "subscription_id" TEXT,
    "provider" "PaymentProvider" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'CREATED',
    "amount_paise" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "description" TEXT,
    "provider_payment_id" TEXT,
    "provider_order_id" TEXT,
    "provider_signature" TEXT,
    "receipt_number" TEXT,
    "failure_reason" TEXT,
    "raw_payload" JSONB,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "amount_paise" INTEGER NOT NULL,
    "tax_paise" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "gst_number" TEXT,
    "billing_name" TEXT,
    "billing_address" TEXT,
    "pdf_url" TEXT,
    "line_items" JSONB NOT NULL DEFAULT '[]',
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "requested_by_id" TEXT,
    "processed_by_id" TEXT,
    "amount_paise" INTEGER NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "provider_refund_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupons" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "CouponType" NOT NULL,
    "owner_type" "CouponOwnerType" NOT NULL DEFAULT 'ADMIN',
    "vendor_id" TEXT,
    "value" DOUBLE PRECISION NOT NULL,
    "max_discount" DOUBLE PRECISION,
    "min_purchase" DOUBLE PRECISION,
    "usage_limit" INTEGER,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "per_user_limit" INTEGER NOT NULL DEFAULT 1,
    "starts_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "recipient_email" TEXT,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon_redemptions" (
    "id" TEXT NOT NULL,
    "coupon_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "order_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupon_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_documents" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "type" "VendorDocumentType" NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_name" TEXT,
    "status" "VendorDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "rejection_reason" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_configurations" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT 'default',
    "ads_enabled" BOOLEAN NOT NULL DEFAULT true,
    "kill_switch" BOOLEAN NOT NULL DEFAULT false,
    "banner_enabled" BOOLEAN NOT NULL DEFAULT true,
    "interstitial_enabled" BOOLEAN NOT NULL DEFAULT true,
    "rewarded_enabled" BOOLEAN NOT NULL DEFAULT true,
    "native_enabled" BOOLEAN NOT NULL DEFAULT true,
    "interstitial_cooldown_sec" INTEGER NOT NULL DEFAULT 120,
    "rewarded_points" INTEGER NOT NULL DEFAULT 10,
    "banner_ad_unit_id_android" TEXT,
    "banner_ad_unit_id_ios" TEXT,
    "interstitial_ad_unit_id_android" TEXT,
    "interstitial_ad_unit_id_ios" TEXT,
    "rewarded_ad_unit_id_android" TEXT,
    "rewarded_ad_unit_id_ios" TEXT,
    "native_ad_unit_id_android" TEXT,
    "native_ad_unit_id_ios" TEXT,
    "enabled_countries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "enabled_app_versions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metadata" JSONB,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_features" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "audience" "FeatureAudience" NOT NULL DEFAULT 'ALL',
    "icon" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_feature_assignments" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "feature_id" TEXT NOT NULL,
    "display_value" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "plan_feature_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_limits" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "limit_key" TEXT NOT NULL,
    "limit_value" INTEGER NOT NULL,
    "display_label" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "plan_limits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_permissions" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "permission_key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "plan_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_faqs" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "plan_faqs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_highlights" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "type" "PlanHighlightType" NOT NULL,
    "label" TEXT,

    CONSTRAINT "plan_highlights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_audit_logs" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pal_points_partner_config" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "default_points_required" INTEGER NOT NULL DEFAULT 1000,
    "default_max_discount_pct" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "diamond_plan_slug" TEXT NOT NULL DEFAULT 'vendor-diamond',
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pal_points_partner_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_pal_points_partners" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "admin_enabled" BOOLEAN NOT NULL DEFAULT false,
    "vendor_enabled" BOOLEAN NOT NULL DEFAULT false,
    "points_required" INTEGER,
    "max_discount_pct" DOUBLE PRECISION,
    "terms" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_pal_points_partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_pal_points_partner_offers" (
    "id" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "vendor_offer_id" TEXT,
    "title" TEXT NOT NULL,
    "discount_pct" DOUBLE PRECISION NOT NULL,
    "min_spend" DOUBLE PRECISION,
    "max_redemption" DOUBLE PRECISION,
    "points_required" INTEGER NOT NULL,
    "daily_limit" INTEGER,
    "monthly_limit" INTEGER,
    "valid_from" TIMESTAMP(3),
    "valid_until" TIMESTAMP(3),
    "terms" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_pal_points_partner_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_providers" (
    "id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "icon" TEXT,
    "color" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "mode" "RideProviderMode" NOT NULL DEFAULT 'DEEPLINK',
    "deep_link_scheme" TEXT,
    "play_store_url" TEXT,
    "app_store_url" TEXT,
    "supports_deep_link" BOOLEAN NOT NULL DEFAULT true,
    "supports_api" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ride_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_provider_configurations" (
    "id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ride_provider_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "provider_id" TEXT NOT NULL,
    "pickup_latitude" DOUBLE PRECISION NOT NULL,
    "pickup_longitude" DOUBLE PRECISION NOT NULL,
    "pickup_address" TEXT,
    "destination_latitude" DOUBLE PRECISION NOT NULL,
    "destination_longitude" DOUBLE PRECISION NOT NULL,
    "destination_address" TEXT,
    "vehicle_type" TEXT,
    "status" "RideRequestStatus" NOT NULL DEFAULT 'PENDING',
    "opened_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ride_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_history" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "request_id" TEXT,
    "provider_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ride_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_destinations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ride_destinations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_favorites" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ride_favorites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collaborations" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "vendor_user_id" TEXT NOT NULL,
    "creator_user_id" TEXT NOT NULL,
    "campaign_title" TEXT NOT NULL,
    "campaign_category" TEXT NOT NULL,
    "business_name" TEXT NOT NULL,
    "business_location" TEXT,
    "budget_paise" INTEGER NOT NULL,
    "campaign_brief" TEXT NOT NULL,
    "expected_shoot_date" TIMESTAMP(3),
    "expected_upload_date" TIMESTAMP(3),
    "campaign_duration_days" INTEGER,
    "contact_person" TEXT NOT NULL,
    "contact_phone" TEXT NOT NULL,
    "contact_whatsapp" TEXT,
    "contact_email" TEXT NOT NULL,
    "notes" TEXT,
    "attachments" JSONB DEFAULT '[]',
    "status" "CollaborationStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "cancellation_reason" TEXT,
    "revision_feedback" TEXT,
    "reel_id" TEXT,
    "deleted_at" TIMESTAMP(3),
    "suspended_at" TIMESTAMP(3),
    "suspended_by_id" TEXT,
    "suspend_reason" TEXT,
    "dispute_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collaborations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collaboration_deliverables" (
    "id" TEXT NOT NULL,
    "collaboration_id" TEXT NOT NULL,
    "type" "CollaborationDeliverableType" NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collaboration_deliverables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collaboration_status_history" (
    "id" TEXT NOT NULL,
    "collaboration_id" TEXT NOT NULL,
    "from_status" "CollaborationStatus",
    "to_status" "CollaborationStatus" NOT NULL,
    "changed_by_id" TEXT NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collaboration_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collaboration_revisions" (
    "id" TEXT NOT NULL,
    "collaboration_id" TEXT NOT NULL,
    "reel_id" TEXT,
    "feedback" TEXT NOT NULL,
    "requested_by_id" TEXT NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collaboration_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collaboration_analytics" (
    "id" TEXT NOT NULL,
    "collaboration_id" TEXT NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "saves" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "engagement" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "business_visits" INTEGER NOT NULL DEFAULT 0,
    "offer_redemptions" INTEGER NOT NULL DEFAULT 0,
    "followers_gained" INTEGER NOT NULL DEFAULT 0,
    "creator_earnings_paise" INTEGER NOT NULL DEFAULT 0,
    "vendor_spend_paise" INTEGER NOT NULL DEFAULT 0,
    "roi" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collaboration_analytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_badges" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "badge" TEXT NOT NULL,
    "earned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_badges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_levels" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "xp_required" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_streaks" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "current_streak" INTEGER NOT NULL DEFAULT 0,
    "longest_streak" INTEGER NOT NULL DEFAULT 0,
    "last_active_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_streaks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_xp" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "total_xp" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_xp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "xp_transactions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "reference_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "xp_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_permission_idx" ON "users"("permission");

-- CreateIndex
CREATE INDEX "users_active_mode_idx" ON "users"("active_mode");

-- CreateIndex
CREATE INDEX "user_blocks_blocker_id_idx" ON "user_blocks"("blocker_id");

-- CreateIndex
CREATE INDEX "user_blocks_blocked_id_idx" ON "user_blocks"("blocked_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_blocks_blocker_id_blocked_id_key" ON "user_blocks"("blocker_id", "blocked_id");

-- CreateIndex
CREATE INDEX "app_feedback_user_id_idx" ON "app_feedback"("user_id");

-- CreateIndex
CREATE INDEX "app_feedback_category_idx" ON "app_feedback"("category");

-- CreateIndex
CREATE INDEX "user_roles_role_status_idx" ON "user_roles"("role", "status");

-- CreateIndex
CREATE INDEX "user_roles_user_id_idx" ON "user_roles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_user_id_role_key" ON "user_roles"("user_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_user_id_key" ON "vendors"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_vendor_code_key" ON "vendors"("vendor_code");

-- CreateIndex
CREATE INDEX "vendors_rating_idx" ON "vendors"("rating");

-- CreateIndex
CREATE INDEX "vendor_offers_vendor_id_idx" ON "vendor_offers"("vendor_id");

-- CreateIndex
CREATE INDEX "vendor_reels_vendor_id_idx" ON "vendor_reels"("vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "point_balances_user_id_key" ON "point_balances"("user_id");

-- CreateIndex
CREATE INDEX "point_transactions_user_id_idx" ON "point_transactions"("user_id");

-- CreateIndex
CREATE INDEX "point_transactions_created_at_idx" ON "point_transactions"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "redemptions_qr_code_key" ON "redemptions"("qr_code");

-- CreateIndex
CREATE INDEX "redemptions_user_id_idx" ON "redemptions"("user_id");

-- CreateIndex
CREATE INDEX "redemptions_vendor_id_idx" ON "redemptions"("vendor_id");

-- CreateIndex
CREATE INDEX "redemptions_qr_code_idx" ON "redemptions"("qr_code");

-- CreateIndex
CREATE INDEX "redemptions_status_idx" ON "redemptions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_user_id_key" ON "wallets"("user_id");

-- CreateIndex
CREATE INDEX "wallet_transactions_wallet_id_idx" ON "wallet_transactions"("wallet_id");

-- CreateIndex
CREATE INDEX "wallet_transactions_user_id_idx" ON "wallet_transactions"("user_id");

-- CreateIndex
CREATE INDEX "wallet_transactions_created_at_idx" ON "wallet_transactions"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "redemption_tokens_redemption_id_key" ON "redemption_tokens"("redemption_id");

-- CreateIndex
CREATE UNIQUE INDEX "redemption_tokens_token_key" ON "redemption_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "point_rules_key_key" ON "point_rules"("key");

-- CreateIndex
CREATE INDEX "point_rules_category_is_active_idx" ON "point_rules"("category", "is_active");

-- CreateIndex
CREATE INDEX "reward_catalog_category_is_active_idx" ON "reward_catalog"("category", "is_active");

-- CreateIndex
CREATE INDEX "reward_catalog_points_required_idx" ON "reward_catalog"("points_required");

-- CreateIndex
CREATE INDEX "follows_follower_id_idx" ON "follows"("follower_id");

-- CreateIndex
CREATE INDEX "follows_following_id_idx" ON "follows"("following_id");

-- CreateIndex
CREATE UNIQUE INDEX "follows_follower_id_following_id_key" ON "follows"("follower_id", "following_id");

-- CreateIndex
CREATE UNIQUE INDEX "places_public_place_id_key" ON "places"("public_place_id");

-- CreateIndex
CREATE INDEX "places_public_place_id_idx" ON "places"("public_place_id");

-- CreateIndex
CREATE INDEX "places_embedding_status_idx" ON "places"("embedding_status");

-- CreateIndex
CREATE INDEX "places_data_quality_idx" ON "places"("data_quality");

-- CreateIndex
CREATE INDEX "places_merged_into_id_idx" ON "places"("merged_into_id");

-- CreateIndex
CREATE INDEX "places_district_idx" ON "places"("district");

-- CreateIndex
CREATE INDEX "places_category_idx" ON "places"("category");

-- CreateIndex
CREATE INDEX "places_latitude_longitude_idx" ON "places"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "places_source_idx" ON "places"("source");

-- CreateIndex
CREATE INDEX "places_external_id_idx" ON "places"("external_id");

-- CreateIndex
CREATE INDEX "places_editorial_priority_idx" ON "places"("editorial_priority");

-- CreateIndex
CREATE INDEX "places_geohash_idx" ON "places"("geohash");

-- CreateIndex
CREATE INDEX "places_name_trgm_idx" ON "places" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "places_search_idx" ON "places" USING GIN ("search_vector");

-- CreateIndex
CREATE INDEX "places_status_idx" ON "places"("status");

-- CreateIndex
CREATE INDEX "places_location_idx" ON "places" USING GIST ("location");

-- CreateIndex
CREATE INDEX "place_images_place_id_idx" ON "place_images"("place_id");

-- CreateIndex
CREATE INDEX "place_aliases_normalized_alias_idx" ON "place_aliases"("normalized_alias");

-- CreateIndex
CREATE INDEX "place_aliases_place_id_idx" ON "place_aliases"("place_id");

-- CreateIndex
CREATE INDEX "place_aliases_alias_trgm_idx" ON "place_aliases" USING GIN ("alias" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "place_aliases_place_id_normalized_alias_key" ON "place_aliases"("place_id", "normalized_alias");

-- CreateIndex
CREATE INDEX "place_merge_logs_canonical_place_id_idx" ON "place_merge_logs"("canonical_place_id");

-- CreateIndex
CREATE INDEX "place_merge_logs_merged_place_id_idx" ON "place_merge_logs"("merged_place_id");

-- CreateIndex
CREATE INDEX "place_field_provenance_place_id_field_name_idx" ON "place_field_provenance"("place_id", "field_name");

-- CreateIndex
CREATE UNIQUE INDEX "place_versions_place_id_version_number_key" ON "place_versions"("place_id", "version_number");

-- CreateIndex
CREATE INDEX "place_relationships_to_place_id_idx" ON "place_relationships"("to_place_id");

-- CreateIndex
CREATE UNIQUE INDEX "place_relationships_from_to_type_key" ON "place_relationships"("from_place_id", "to_place_id", "relationship_type");

-- CreateIndex
CREATE INDEX "place_quality_checks_place_id_check_code_idx" ON "place_quality_checks"("place_id", "check_code");

-- CreateIndex
CREATE INDEX "place_duplicate_candidates_status_score_idx" ON "place_duplicate_candidates"("status", "confidence_score");

-- CreateIndex
CREATE UNIQUE INDEX "place_duplicate_candidates_a_b_key" ON "place_duplicate_candidates"("place_a_id", "place_b_id");

-- CreateIndex
CREATE INDEX "place_change_history_place_id_created_at_idx" ON "place_change_history"("place_id", "created_at");

-- CreateIndex
CREATE INDEX "place_verification_logs_place_id_idx" ON "place_verification_logs"("place_id");

-- CreateIndex
CREATE INDEX "place_translations_locale_idx" ON "place_translations"("locale");

-- CreateIndex
CREATE UNIQUE INDEX "place_translations_place_locale_field_key" ON "place_translations"("place_id", "locale", "field_name");

-- CreateIndex
CREATE INDEX "place_boundary_validation_place_id_validated_at_idx" ON "place_boundary_validation"("place_id", "validated_at");

-- CreateIndex
CREATE UNIQUE INDEX "deleted_place_refs_slug_key" ON "deleted_place_refs"("slug");

-- CreateIndex
CREATE INDEX "deleted_place_refs_curated_id_idx" ON "deleted_place_refs"("curated_id");

-- CreateIndex
CREATE INDEX "deleted_place_refs_name_city_state_idx" ON "deleted_place_refs"("name", "city", "state");

-- CreateIndex
CREATE INDEX "deleted_place_refs_external_id_idx" ON "deleted_place_refs"("external_id");

-- CreateIndex
CREATE INDEX "user_place_images_place_id_idx" ON "user_place_images"("place_id");

-- CreateIndex
CREATE INDEX "user_place_images_user_id_idx" ON "user_place_images"("user_id");

-- CreateIndex
CREATE INDEX "user_place_images_status_idx" ON "user_place_images"("status");

-- CreateIndex
CREATE INDEX "place_videos_place_id_idx" ON "place_videos"("place_id");

-- CreateIndex
CREATE INDEX "place_offers_place_id_idx" ON "place_offers"("place_id");

-- CreateIndex
CREATE INDEX "place_events_place_id_idx" ON "place_events"("place_id");

-- CreateIndex
CREATE INDEX "place_events_start_date_idx" ON "place_events"("start_date");

-- CreateIndex
CREATE INDEX "reviews_place_id_idx" ON "reviews"("place_id");

-- CreateIndex
CREATE INDEX "reviews_user_id_idx" ON "reviews"("user_id");

-- CreateIndex
CREATE INDEX "reviews_status_idx" ON "reviews"("status");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_place_id_user_id_key" ON "reviews"("place_id", "user_id");

-- CreateIndex
CREATE INDEX "vendor_reviews_vendor_id_idx" ON "vendor_reviews"("vendor_id");

-- CreateIndex
CREATE INDEX "vendor_reviews_user_id_idx" ON "vendor_reviews"("user_id");

-- CreateIndex
CREATE INDEX "vendor_reviews_rating_idx" ON "vendor_reviews"("rating");

-- CreateIndex
CREATE INDEX "vendor_reviews_created_at_idx" ON "vendor_reviews"("created_at");

-- CreateIndex
CREATE INDEX "vendor_reviews_status_idx" ON "vendor_reviews"("status");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_reviews_vendor_id_user_id_key" ON "vendor_reviews"("vendor_id", "user_id");

-- CreateIndex
CREATE INDEX "check_ins_place_id_idx" ON "check_ins"("place_id");

-- CreateIndex
CREATE INDEX "check_ins_user_id_idx" ON "check_ins"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "check_ins_place_id_user_id_key" ON "check_ins"("place_id", "user_id");

-- CreateIndex
CREATE INDEX "place_stats_placeId_idx" ON "place_stats"("placeId");

-- CreateIndex
CREATE INDEX "place_stats_action_idx" ON "place_stats"("action");

-- CreateIndex
CREATE INDEX "place_stats_userId_idx" ON "place_stats"("userId");

-- CreateIndex
CREATE INDEX "collections_user_id_idx" ON "collections"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "collection_places_collection_id_place_id_key" ON "collection_places"("collection_id", "place_id");

-- CreateIndex
CREATE INDEX "trip_plans_user_id_idx" ON "trip_plans"("user_id");

-- CreateIndex
CREATE INDEX "trip_plans_user_id_status_idx" ON "trip_plans"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "trip_plan_days_trip_plan_id_day_number_key" ON "trip_plan_days"("trip_plan_id", "day_number");

-- CreateIndex
CREATE INDEX "trip_plan_stops_trip_plan_day_id_idx" ON "trip_plan_stops"("trip_plan_day_id");

-- CreateIndex
CREATE UNIQUE INDEX "trip_collaborators_trip_plan_id_user_id_key" ON "trip_collaborators"("trip_plan_id", "user_id");

-- CreateIndex
CREATE INDEX "ai_generation_logs_user_id_idx" ON "ai_generation_logs"("user_id");

-- CreateIndex
CREATE INDEX "ai_generation_logs_trip_plan_id_idx" ON "ai_generation_logs"("trip_plan_id");

-- CreateIndex
CREATE INDEX "ai_generation_logs_created_at_idx" ON "ai_generation_logs"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "sync_queue_user_id_status_idx" ON "sync_queue"("user_id", "status");

-- CreateIndex
CREATE INDEX "sync_queue_status_created_at_idx" ON "sync_queue"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "device_tokens_token_key" ON "device_tokens"("token");

-- CreateIndex
CREATE INDEX "device_tokens_user_id_idx" ON "device_tokens"("user_id");

-- CreateIndex
CREATE INDEX "in_app_notifications_user_id_read_idx" ON "in_app_notifications"("user_id", "read");

-- CreateIndex
CREATE INDEX "in_app_notifications_user_id_created_at_idx" ON "in_app_notifications"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "creator_profiles_user_id_key" ON "creator_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "creator_profiles_username_key" ON "creator_profiles"("username");

-- CreateIndex
CREATE INDEX "creator_profiles_membership_plan_id_idx" ON "creator_profiles"("membership_plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "reels_collaboration_id_key" ON "reels"("collaboration_id");

-- CreateIndex
CREATE INDEX "reels_collaboration_id_idx" ON "reels"("collaboration_id");

-- CreateIndex
CREATE INDEX "reels_is_collaboration_idx" ON "reels"("is_collaboration");

-- CreateIndex
CREATE INDEX "reel_reports_reel_id_idx" ON "reel_reports"("reel_id");

-- CreateIndex
CREATE INDEX "reel_reports_user_id_idx" ON "reel_reports"("user_id");

-- CreateIndex
CREATE INDEX "reel_reports_status_idx" ON "reel_reports"("status");

-- CreateIndex
CREATE UNIQUE INDEX "creator_daily_rewards_reel_id_key" ON "creator_daily_rewards"("reel_id");

-- CreateIndex
CREATE INDEX "creator_daily_rewards_user_id_idx" ON "creator_daily_rewards"("user_id");

-- CreateIndex
CREATE INDEX "creator_daily_rewards_reward_date_idx" ON "creator_daily_rewards"("reward_date");

-- CreateIndex
CREATE UNIQUE INDEX "creator_daily_rewards_creator_id_reward_date_key" ON "creator_daily_rewards"("creator_id", "reward_date");

-- CreateIndex
CREATE INDEX "reel_comments_reel_id_idx" ON "reel_comments"("reel_id");

-- CreateIndex
CREATE INDEX "reel_comments_user_id_idx" ON "reel_comments"("user_id");

-- CreateIndex
CREATE INDEX "reel_likes_reel_id_idx" ON "reel_likes"("reel_id");

-- CreateIndex
CREATE INDEX "reel_likes_user_id_idx" ON "reel_likes"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "reel_likes_reel_id_user_id_key" ON "reel_likes"("reel_id", "user_id");

-- CreateIndex
CREATE INDEX "reel_saves_reel_id_idx" ON "reel_saves"("reel_id");

-- CreateIndex
CREATE INDEX "reel_saves_user_id_idx" ON "reel_saves"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "reel_saves_reel_id_user_id_key" ON "reel_saves"("reel_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "system_settings_key_key" ON "system_settings"("key");

-- CreateIndex
CREATE UNIQUE INDEX "notification_templates_name_key" ON "notification_templates"("name");

-- CreateIndex
CREATE INDEX "riddles_city_is_active_idx" ON "riddles"("city", "is_active");

-- CreateIndex
CREATE INDEX "riddles_is_active_starts_at_ends_at_idx" ON "riddles"("is_active", "starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "riddle_submissions_riddle_id_idx" ON "riddle_submissions"("riddle_id");

-- CreateIndex
CREATE INDEX "riddle_submissions_user_id_idx" ON "riddle_submissions"("user_id");

-- CreateIndex
CREATE INDEX "riddle_submissions_status_idx" ON "riddle_submissions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "riddle_submissions_riddle_id_user_id_key" ON "riddle_submissions"("riddle_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_email_key" ON "password_reset_tokens"("email");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_key" ON "password_reset_tokens"("token");

-- CreateIndex
CREATE INDEX "password_reset_tokens_expiresAt_idx" ON "password_reset_tokens"("expiresAt");

-- CreateIndex
CREATE INDEX "reward_campaigns_status_idx" ON "reward_campaigns"("status");

-- CreateIndex
CREATE INDEX "reward_campaigns_start_date_end_date_idx" ON "reward_campaigns"("start_date", "end_date");

-- CreateIndex
CREATE UNIQUE INDEX "reward_claims_redemption_id_key" ON "reward_claims"("redemption_id");

-- CreateIndex
CREATE INDEX "reward_claims_user_id_idx" ON "reward_claims"("user_id");

-- CreateIndex
CREATE INDEX "reward_claims_campaign_id_idx" ON "reward_claims"("campaign_id");

-- CreateIndex
CREATE INDEX "reward_claims_status_idx" ON "reward_claims"("status");

-- CreateIndex
CREATE INDEX "challenges_status_idx" ON "challenges"("status");

-- CreateIndex
CREATE INDEX "challenges_category_idx" ON "challenges"("category");

-- CreateIndex
CREATE INDEX "challenges_difficulty_idx" ON "challenges"("difficulty");

-- CreateIndex
CREATE INDEX "challenges_creator_id_idx" ON "challenges"("creator_id");

-- CreateIndex
CREATE INDEX "challenge_completions_challenge_id_idx" ON "challenge_completions"("challenge_id");

-- CreateIndex
CREATE INDEX "challenge_completions_user_id_idx" ON "challenge_completions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "challenge_completions_challenge_id_user_id_key" ON "challenge_completions"("challenge_id", "user_id");

-- CreateIndex
CREATE INDEX "search_query_logs_query_idx" ON "search_query_logs"("query");

-- CreateIndex
CREATE INDEX "search_query_logs_created_at_idx" ON "search_query_logs"("created_at");

-- CreateIndex
CREATE INDEX "legal_documents_type_idx" ON "legal_documents"("type");

-- CreateIndex
CREATE UNIQUE INDEX "legal_documents_type_locale_key" ON "legal_documents"("type", "locale");

-- CreateIndex
CREATE INDEX "legal_document_versions_document_id_status_idx" ON "legal_document_versions"("document_id", "status");

-- CreateIndex
CREATE INDEX "legal_document_versions_status_idx" ON "legal_document_versions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "legal_document_versions_document_id_version_number_key" ON "legal_document_versions"("document_id", "version_number");

-- CreateIndex
CREATE INDEX "announcements_isActive_idx" ON "announcements"("isActive");

-- CreateIndex
CREATE INDEX "announcements_audience_idx" ON "announcements"("audience");

-- CreateIndex
CREATE INDEX "announcements_starts_at_ends_at_idx" ON "announcements"("starts_at", "ends_at");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_slug_key" ON "subscription_plans"("slug");

-- CreateIndex
CREATE INDEX "subscription_plans_audience_status_idx" ON "subscription_plans"("audience", "status");

-- CreateIndex
CREATE INDEX "subscription_plans_sort_order_idx" ON "subscription_plans"("sort_order");

-- CreateIndex
CREATE INDEX "plan_prices_plan_id_idx" ON "plan_prices"("plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "plan_prices_plan_id_period_key" ON "plan_prices"("plan_id", "period");

-- CreateIndex
CREATE INDEX "user_subscriptions_user_id_audience_status_idx" ON "user_subscriptions"("user_id", "audience", "status");

-- CreateIndex
CREATE INDEX "user_subscriptions_plan_id_idx" ON "user_subscriptions"("plan_id");

-- CreateIndex
CREATE INDEX "user_subscriptions_current_period_end_idx" ON "user_subscriptions"("current_period_end");

-- CreateIndex
CREATE INDEX "user_subscriptions_provider_subscription_id_idx" ON "user_subscriptions"("provider_subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_provider_payment_id_key" ON "payment_transactions"("provider_payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_provider_order_id_key" ON "payment_transactions"("provider_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_receipt_number_key" ON "payment_transactions"("receipt_number");

-- CreateIndex
CREATE INDEX "payment_transactions_user_id_idx" ON "payment_transactions"("user_id");

-- CreateIndex
CREATE INDEX "payment_transactions_status_idx" ON "payment_transactions"("status");

-- CreateIndex
CREATE INDEX "payment_transactions_created_at_idx" ON "payment_transactions"("created_at");

-- CreateIndex
CREATE INDEX "payment_transactions_provider_order_id_idx" ON "payment_transactions"("provider_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_transaction_id_key" ON "invoices"("transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoice_number_key" ON "invoices"("invoice_number");

-- CreateIndex
CREATE INDEX "invoices_user_id_idx" ON "invoices"("user_id");

-- CreateIndex
CREATE INDEX "invoices_issued_at_idx" ON "invoices"("issued_at");

-- CreateIndex
CREATE INDEX "refunds_transaction_id_idx" ON "refunds"("transaction_id");

-- CreateIndex
CREATE INDEX "refunds_status_idx" ON "refunds"("status");

-- CreateIndex
CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");

-- CreateIndex
CREATE INDEX "coupons_vendor_id_idx" ON "coupons"("vendor_id");

-- CreateIndex
CREATE INDEX "coupons_is_active_expires_at_idx" ON "coupons"("is_active", "expires_at");

-- CreateIndex
CREATE INDEX "coupon_redemptions_coupon_id_idx" ON "coupon_redemptions"("coupon_id");

-- CreateIndex
CREATE INDEX "coupon_redemptions_user_id_idx" ON "coupon_redemptions"("user_id");

-- CreateIndex
CREATE INDEX "vendor_documents_vendor_id_type_idx" ON "vendor_documents"("vendor_id", "type");

-- CreateIndex
CREATE INDEX "vendor_documents_status_idx" ON "vendor_documents"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ad_configurations_key_key" ON "ad_configurations"("key");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_features_key_key" ON "subscription_features"("key");

-- CreateIndex
CREATE INDEX "subscription_features_audience_sort_order_idx" ON "subscription_features"("audience", "sort_order");

-- CreateIndex
CREATE INDEX "plan_feature_assignments_plan_id_sort_order_idx" ON "plan_feature_assignments"("plan_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "plan_feature_assignments_plan_id_feature_id_key" ON "plan_feature_assignments"("plan_id", "feature_id");

-- CreateIndex
CREATE INDEX "plan_limits_plan_id_idx" ON "plan_limits"("plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "plan_limits_plan_id_limit_key_key" ON "plan_limits"("plan_id", "limit_key");

-- CreateIndex
CREATE INDEX "plan_permissions_plan_id_idx" ON "plan_permissions"("plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "plan_permissions_plan_id_permission_key_key" ON "plan_permissions"("plan_id", "permission_key");

-- CreateIndex
CREATE INDEX "plan_faqs_plan_id_sort_order_idx" ON "plan_faqs"("plan_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "plan_highlights_plan_id_type_key" ON "plan_highlights"("plan_id", "type");

-- CreateIndex
CREATE INDEX "subscription_audit_logs_entity_type_entity_id_idx" ON "subscription_audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "subscription_audit_logs_created_at_idx" ON "subscription_audit_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_pal_points_partners_vendor_id_key" ON "vendor_pal_points_partners"("vendor_id");

-- CreateIndex
CREATE INDEX "vendor_pal_points_partner_offers_partner_id_is_active_idx" ON "vendor_pal_points_partner_offers"("partner_id", "is_active");

-- CreateIndex
CREATE INDEX "ride_providers_enabled_priority_idx" ON "ride_providers"("enabled", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "ride_provider_configurations_provider_id_key" ON "ride_provider_configurations"("provider_id");

-- CreateIndex
CREATE INDEX "ride_requests_user_id_created_at_idx" ON "ride_requests"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "ride_requests_provider_id_status_idx" ON "ride_requests"("provider_id", "status");

-- CreateIndex
CREATE INDEX "ride_history_user_id_created_at_idx" ON "ride_history"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "ride_destinations_user_id_idx" ON "ride_destinations"("user_id");

-- CreateIndex
CREATE INDEX "ride_favorites_user_id_idx" ON "ride_favorites"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "ride_favorites_user_id_provider_id_key" ON "ride_favorites"("user_id", "provider_id");

-- CreateIndex
CREATE UNIQUE INDEX "collaborations_reel_id_key" ON "collaborations"("reel_id");

-- CreateIndex
CREATE INDEX "collaborations_vendor_id_status_idx" ON "collaborations"("vendor_id", "status");

-- CreateIndex
CREATE INDEX "collaborations_creator_id_status_idx" ON "collaborations"("creator_id", "status");

-- CreateIndex
CREATE INDEX "collaborations_vendor_user_id_idx" ON "collaborations"("vendor_user_id");

-- CreateIndex
CREATE INDEX "collaborations_creator_user_id_idx" ON "collaborations"("creator_user_id");

-- CreateIndex
CREATE INDEX "collaborations_status_created_at_idx" ON "collaborations"("status", "created_at");

-- CreateIndex
CREATE INDEX "collaborations_deleted_at_idx" ON "collaborations"("deleted_at");

-- CreateIndex
CREATE INDEX "collaboration_deliverables_collaboration_id_idx" ON "collaboration_deliverables"("collaboration_id");

-- CreateIndex
CREATE INDEX "collaboration_status_history_collaboration_id_created_at_idx" ON "collaboration_status_history"("collaboration_id", "created_at");

-- CreateIndex
CREATE INDEX "collaboration_revisions_collaboration_id_created_at_idx" ON "collaboration_revisions"("collaboration_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "collaboration_analytics_collaboration_id_key" ON "collaboration_analytics"("collaboration_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_badges_user_id_badge_key" ON "user_badges"("user_id", "badge");

-- CreateIndex
CREATE UNIQUE INDEX "user_levels_level_key" ON "user_levels"("level");

-- CreateIndex
CREATE UNIQUE INDEX "user_streaks_user_id_key" ON "user_streaks"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_xp_user_id_key" ON "user_xp"("user_id");

-- CreateIndex
CREATE INDEX "xp_transactions_user_id_idx" ON "xp_transactions"("user_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_verified_by_id_fkey" FOREIGN KEY ("verified_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_app_preferences" ADD CONSTRAINT "user_app_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_feedback" ADD CONSTRAINT "app_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_offers" ADD CONSTRAINT "vendor_offers_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_reels" ADD CONSTRAINT "vendor_reels_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_balances" ADD CONSTRAINT "point_balances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "vendor_offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemption_tokens" ADD CONSTRAINT "redemption_tokens_redemption_id_fkey" FOREIGN KEY ("redemption_id") REFERENCES "redemptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_catalog" ADD CONSTRAINT "reward_catalog_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_catalog" ADD CONSTRAINT "reward_catalog_vendor_offer_id_fkey" FOREIGN KEY ("vendor_offer_id") REFERENCES "vendor_offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_following_id_fkey" FOREIGN KEY ("following_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "places" ADD CONSTRAINT "places_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "places" ADD CONSTRAINT "places_last_verified_by_id_fkey" FOREIGN KEY ("last_verified_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "places" ADD CONSTRAINT "places_merged_into_id_fkey" FOREIGN KEY ("merged_into_id") REFERENCES "places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "places" ADD CONSTRAINT "places_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_images" ADD CONSTRAINT "place_images_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "place_aliases" ADD CONSTRAINT "place_aliases_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_merge_logs" ADD CONSTRAINT "place_merge_logs_canonical_place_id_fkey" FOREIGN KEY ("canonical_place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_merge_logs" ADD CONSTRAINT "place_merge_logs_merged_place_id_fkey" FOREIGN KEY ("merged_place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_field_provenance" ADD CONSTRAINT "place_field_provenance_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_versions" ADD CONSTRAINT "place_versions_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_relationships" ADD CONSTRAINT "place_relationships_from_place_id_fkey" FOREIGN KEY ("from_place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_relationships" ADD CONSTRAINT "place_relationships_to_place_id_fkey" FOREIGN KEY ("to_place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_quality_checks" ADD CONSTRAINT "place_quality_checks_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_duplicate_candidates" ADD CONSTRAINT "place_duplicate_candidates_place_a_id_fkey" FOREIGN KEY ("place_a_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_duplicate_candidates" ADD CONSTRAINT "place_duplicate_candidates_place_b_id_fkey" FOREIGN KEY ("place_b_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_change_history" ADD CONSTRAINT "place_change_history_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_verification_logs" ADD CONSTRAINT "place_verification_logs_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_translations" ADD CONSTRAINT "place_translations_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_boundary_validation" ADD CONSTRAINT "place_boundary_validation_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_search_embeddings" ADD CONSTRAINT "place_search_embeddings_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_place_images" ADD CONSTRAINT "user_place_images_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_place_images" ADD CONSTRAINT "user_place_images_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_place_images" ADD CONSTRAINT "user_place_images_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_videos" ADD CONSTRAINT "place_videos_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "place_offers" ADD CONSTRAINT "place_offers_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "place_events" ADD CONSTRAINT "place_events_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vendor_reviews" ADD CONSTRAINT "vendor_reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_reviews" ADD CONSTRAINT "vendor_reviews_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "place_stats" ADD CONSTRAINT "place_stats_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_stats" ADD CONSTRAINT "place_stats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "collection_places" ADD CONSTRAINT "collection_places_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "collection_places" ADD CONSTRAINT "collection_places_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "trip_plans" ADD CONSTRAINT "trip_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "trip_plan_days" ADD CONSTRAINT "trip_plan_days_trip_plan_id_fkey" FOREIGN KEY ("trip_plan_id") REFERENCES "trip_plans"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "trip_plan_stops" ADD CONSTRAINT "trip_plan_stops_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "trip_plan_stops" ADD CONSTRAINT "trip_plan_stops_trip_plan_day_id_fkey" FOREIGN KEY ("trip_plan_day_id") REFERENCES "trip_plan_days"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "trip_collaborators" ADD CONSTRAINT "trip_collaborators_trip_plan_id_fkey" FOREIGN KEY ("trip_plan_id") REFERENCES "trip_plans"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "trip_collaborators" ADD CONSTRAINT "trip_collaborators_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ai_generation_logs" ADD CONSTRAINT "ai_generation_logs_trip_plan_id_fkey" FOREIGN KEY ("trip_plan_id") REFERENCES "trip_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_generation_logs" ADD CONSTRAINT "ai_generation_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_app_notifications" ADD CONSTRAINT "in_app_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_profiles" ADD CONSTRAINT "creator_profiles_membership_plan_id_fkey" FOREIGN KEY ("membership_plan_id") REFERENCES "subscription_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_profiles" ADD CONSTRAINT "creator_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reels" ADD CONSTRAINT "reels_collaboration_id_fkey" FOREIGN KEY ("collaboration_id") REFERENCES "collaborations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reels" ADD CONSTRAINT "reels_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "creator_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reel_reports" ADD CONSTRAINT "reel_reports_reel_id_fkey" FOREIGN KEY ("reel_id") REFERENCES "reels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reel_reports" ADD CONSTRAINT "reel_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_daily_rewards" ADD CONSTRAINT "creator_daily_rewards_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "creator_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "creator_daily_rewards" ADD CONSTRAINT "creator_daily_rewards_reel_id_fkey" FOREIGN KEY ("reel_id") REFERENCES "reels"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "reel_comments" ADD CONSTRAINT "reel_comments_reel_id_fkey" FOREIGN KEY ("reel_id") REFERENCES "reels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reel_comments" ADD CONSTRAINT "reel_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reel_likes" ADD CONSTRAINT "reel_likes_reel_id_fkey" FOREIGN KEY ("reel_id") REFERENCES "reels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reel_likes" ADD CONSTRAINT "reel_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reel_saves" ADD CONSTRAINT "reel_saves_reel_id_fkey" FOREIGN KEY ("reel_id") REFERENCES "reels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reel_saves" ADD CONSTRAINT "reel_saves_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "riddle_submissions" ADD CONSTRAINT "riddle_submissions_riddle_id_fkey" FOREIGN KEY ("riddle_id") REFERENCES "riddles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "riddle_submissions" ADD CONSTRAINT "riddle_submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_claims" ADD CONSTRAINT "reward_claims_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "reward_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_claims" ADD CONSTRAINT "reward_claims_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_completions" ADD CONSTRAINT "challenge_completions_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_completions" ADD CONSTRAINT "challenge_completions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_document_versions" ADD CONSTRAINT "legal_document_versions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_document_versions" ADD CONSTRAINT "legal_document_versions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "legal_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_document_versions" ADD CONSTRAINT "legal_document_versions_published_by_id_fkey" FOREIGN KEY ("published_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_prices" ADD CONSTRAINT "plan_prices_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "user_subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "payment_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_processed_by_id_fkey" FOREIGN KEY ("processed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "payment_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_documents" ADD CONSTRAINT "vendor_documents_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_feature_assignments" ADD CONSTRAINT "plan_feature_assignments_feature_id_fkey" FOREIGN KEY ("feature_id") REFERENCES "subscription_features"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_feature_assignments" ADD CONSTRAINT "plan_feature_assignments_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_limits" ADD CONSTRAINT "plan_limits_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_permissions" ADD CONSTRAINT "plan_permissions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_faqs" ADD CONSTRAINT "plan_faqs_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_highlights" ADD CONSTRAINT "plan_highlights_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_pal_points_partners" ADD CONSTRAINT "vendor_pal_points_partners_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_pal_points_partner_offers" ADD CONSTRAINT "vendor_pal_points_partner_offers_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "vendor_pal_points_partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_provider_configurations" ADD CONSTRAINT "ride_provider_configurations_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "ride_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "ride_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_history" ADD CONSTRAINT "ride_history_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "ride_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_history" ADD CONSTRAINT "ride_history_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "ride_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_history" ADD CONSTRAINT "ride_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_destinations" ADD CONSTRAINT "ride_destinations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_favorites" ADD CONSTRAINT "ride_favorites_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "ride_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_favorites" ADD CONSTRAINT "ride_favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaborations" ADD CONSTRAINT "collaborations_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "creator_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaborations" ADD CONSTRAINT "collaborations_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_deliverables" ADD CONSTRAINT "collaboration_deliverables_collaboration_id_fkey" FOREIGN KEY ("collaboration_id") REFERENCES "collaborations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_status_history" ADD CONSTRAINT "collaboration_status_history_collaboration_id_fkey" FOREIGN KEY ("collaboration_id") REFERENCES "collaborations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_revisions" ADD CONSTRAINT "collaboration_revisions_collaboration_id_fkey" FOREIGN KEY ("collaboration_id") REFERENCES "collaborations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_analytics" ADD CONSTRAINT "collaboration_analytics_collaboration_id_fkey" FOREIGN KEY ("collaboration_id") REFERENCES "collaborations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_streaks" ADD CONSTRAINT "user_streaks_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_xp" ADD CONSTRAINT "user_xp_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xp_transactions" ADD CONSTRAINT "xp_transactions_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

