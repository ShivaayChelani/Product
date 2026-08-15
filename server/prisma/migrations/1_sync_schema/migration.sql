-- CreateEnum
CREATE TYPE "PlaceCategory" AS ENUM ('TEMPLE', 'MONUMENT', 'FORT', 'LAKE', 'WATERFALL', 'PARK', 'PALACE', 'MUSEUM', 'BEACH', 'TREKKING', 'WILDLIFE', 'SHOPPING', 'RESTAURANT', 'HOTEL', 'GHAT', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Role" ADD VALUE 'SUPER_ADMIN';
ALTER TYPE "Role" ADD VALUE 'OPS_ADMIN';
ALTER TYPE "Role" ADD VALUE 'VENDOR_MANAGER';
ALTER TYPE "Role" ADD VALUE 'CONTENT_MODERATOR';
ALTER TYPE "Role" ADD VALUE 'FINANCE_MANAGER';
ALTER TYPE "Role" ADD VALUE 'SUPPORT_AGENT';
ALTER TYPE "Role" ADD VALUE 'MARKETING_ADMIN';
ALTER TYPE "Role" ADD VALUE 'ANALYTICS_VIEWER';

-- AlterEnum
ALTER TYPE "RedemptionStatus" ADD VALUE 'REFUNDED';

-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_verified_by_id_fkey";

-- DropForeignKey
ALTER TABLE "point_transactions" DROP CONSTRAINT "point_transactions_user_id_fkey";

-- DropForeignKey
ALTER TABLE "redemptions" DROP CONSTRAINT "redemptions_offer_id_fkey";

-- DropForeignKey
ALTER TABLE "redemptions" DROP CONSTRAINT "redemptions_user_id_fkey";

-- DropForeignKey
ALTER TABLE "redemptions" DROP CONSTRAINT "redemptions_vendor_id_fkey";

-- DropForeignKey
ALTER TABLE "follows" DROP CONSTRAINT "follows_follower_id_fkey";

-- DropForeignKey
ALTER TABLE "follows" DROP CONSTRAINT "follows_following_id_fkey";

-- DropForeignKey
ALTER TABLE "places" DROP CONSTRAINT "places_submittedById_fkey";

-- DropForeignKey
ALTER TABLE "place_images" DROP CONSTRAINT "place_images_place_id_fkey";

-- DropForeignKey
ALTER TABLE "place_videos" DROP CONSTRAINT "place_videos_place_id_fkey";

-- DropForeignKey
ALTER TABLE "place_offers" DROP CONSTRAINT "place_offers_place_id_fkey";

-- DropForeignKey
ALTER TABLE "place_events" DROP CONSTRAINT "place_events_place_id_fkey";

-- DropForeignKey
ALTER TABLE "reviews" DROP CONSTRAINT "reviews_place_id_fkey";

-- DropForeignKey
ALTER TABLE "reviews" DROP CONSTRAINT "reviews_user_id_fkey";

-- DropForeignKey
ALTER TABLE "check_ins" DROP CONSTRAINT "check_ins_place_id_fkey";

-- DropForeignKey
ALTER TABLE "check_ins" DROP CONSTRAINT "check_ins_user_id_fkey";

-- DropForeignKey
ALTER TABLE "collections" DROP CONSTRAINT "collections_user_id_fkey";

-- DropForeignKey
ALTER TABLE "collection_places" DROP CONSTRAINT "collection_places_collection_id_fkey";

-- DropForeignKey
ALTER TABLE "collection_places" DROP CONSTRAINT "collection_places_place_id_fkey";

-- DropForeignKey
ALTER TABLE "trip_plans" DROP CONSTRAINT "trip_plans_user_id_fkey";

-- DropForeignKey
ALTER TABLE "trip_plan_days" DROP CONSTRAINT "trip_plan_days_trip_plan_id_fkey";

-- DropForeignKey
ALTER TABLE "trip_plan_stops" DROP CONSTRAINT "trip_plan_stops_place_id_fkey";

-- DropForeignKey
ALTER TABLE "trip_plan_stops" DROP CONSTRAINT "trip_plan_stops_trip_plan_day_id_fkey";

-- DropForeignKey
ALTER TABLE "trip_collaborators" DROP CONSTRAINT "trip_collaborators_trip_plan_id_fkey";

-- DropForeignKey
ALTER TABLE "trip_collaborators" DROP CONSTRAINT "trip_collaborators_user_id_fkey";

-- DropForeignKey
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_actor_id_fkey";

-- DropForeignKey
ALTER TABLE "creator_daily_rewards" DROP CONSTRAINT "creator_daily_rewards_creator_id_fkey";

-- DropForeignKey
ALTER TABLE "creator_daily_rewards" DROP CONSTRAINT "creator_daily_rewards_reel_id_fkey";

-- DropIndex
DROP INDEX "places_location_idx";

-- DropIndex
DROP INDEX "reviews_status_idx";

-- DropIndex
DROP INDEX "vendor_reviews_status_idx";

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "verified_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "vendors" ADD COLUMN     "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "operating_hours" TEXT,
ADD COLUMN     "website" TEXT;

-- AlterTable
ALTER TABLE "vendor_offers" ADD COLUMN     "approved_at" TIMESTAMP(3),
ADD COLUMN     "approved_by_id" TEXT,
ADD COLUMN     "banner" TEXT,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "click_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "current_redemptions" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "image_url" TEXT,
ADD COLUMN     "is_approved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_featured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "max_redemptions" INTEGER,
ADD COLUMN     "paused_at" TIMESTAMP(3),
ADD COLUMN     "rejected_at" TIMESTAMP(3),
ADD COLUMN     "rejected_by_id" TEXT,
ADD COLUMN     "rejection_reason" TEXT,
ADD COLUMN     "start_date" TIMESTAMP(3),
ADD COLUMN     "view_count" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "point_transactions" ALTER COLUMN "user_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "redemptions" ADD COLUMN     "notes" TEXT,
ADD COLUMN     "receipt_number" TEXT,
ADD COLUMN     "refunded_at" TIMESTAMP(3),
ADD COLUMN     "refunded_by_id" TEXT,
ALTER COLUMN "user_id" DROP NOT NULL,
ALTER COLUMN "offer_id" DROP NOT NULL,
ALTER COLUMN "vendor_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "follows" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "places" ADD COLUMN     "accessibility_details" TEXT,
ADD COLUMN     "best_time_reason" TEXT,
ADD COLUMN     "best_time_to_visit" JSONB,
ADD COLUMN     "emergency_contact" TEXT,
ADD COLUMN     "has_parking" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "has_washroom" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "history" TEXT,
ADD COLUMN     "is_accessible" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_pet_friendly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "parking_details" TEXT,
ADD COLUMN     "recommended_duration" TEXT,
ADD COLUMN     "website" TEXT,
ALTER COLUMN "latitude" DROP NOT NULL,
ALTER COLUMN "longitude" DROP NOT NULL,
ALTER COLUMN "images" SET DEFAULT ARRAY[]::TEXT[],
ALTER COLUMN "submittedById" DROP NOT NULL;

-- AlterTable
ALTER TABLE "place_images" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "place_videos" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "place_offers" ALTER COLUMN "valid_from" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "valid_until" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "place_events" ALTER COLUMN "start_date" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "end_date" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "reviews" ADD COLUMN     "helpful_votes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "vendor_reviews" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "check_ins" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "collections" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "collection_places" ALTER COLUMN "added_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "trip_plans" ADD COLUMN     "accommodation" TEXT,
ADD COLUMN     "budget" TEXT,
ADD COLUMN     "completed_at" TIMESTAMP(3),
ADD COLUMN     "cover_image" TEXT,
ADD COLUMN     "current_day_index" INTEGER,
ADD COLUMN     "current_stop_index" INTEGER,
ADD COLUMN     "destination" TEXT,
ADD COLUMN     "end_date" TIMESTAMP(3),
ADD COLUMN     "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "start_date" TIMESTAMP(3),
ADD COLUMN     "started_at" TIMESTAMP(3),
ADD COLUMN     "total_distance" DOUBLE PRECISION,
ADD COLUMN     "total_travel_time" INTEGER,
ADD COLUMN     "transportation" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "travelers" TEXT,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "trip_plan_days" ADD COLUMN     "date" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "trip_plan_stops" ADD COLUMN     "cost" DOUBLE PRECISION,
ADD COLUMN     "distance_from_prev" DOUBLE PRECISION,
ADD COLUMN     "duration" INTEGER,
ADD COLUMN     "end_time" TEXT,
ADD COLUMN     "skipped_at" TIMESTAMP(3),
ADD COLUMN     "start_time" TEXT,
ADD COLUMN     "transport_mode" TEXT,
ADD COLUMN     "visited_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "audit_logs" ALTER COLUMN "actor_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "reels" ADD COLUMN     "category" TEXT,
ADD COLUMN     "event_id" TEXT,
ADD COLUMN     "place_id" TEXT,
ADD COLUMN     "search_vector" tsvector,
ADD COLUMN     "vendor_id" TEXT;

-- AlterTable
ALTER TABLE "creator_daily_rewards" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- CreateTable
CREATE TABLE "places_meta_backup_20260804T074239" (
    "id" TEXT,
    "city" TEXT,
    "state" TEXT,
    "district" TEXT,
    "country" TEXT,
    "tehsil" TEXT,
    "geohash" TEXT,
    "category" TEXT,
    "updated_at" TIMESTAMP(3),
    "external_id" TEXT,
    "source" "PlaceSource",
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION
);

-- CreateIndex
CREATE INDEX "users_verification_status_idx" ON "users"("verification_status");

-- CreateIndex
CREATE INDEX "users_created_at_idx" ON "users"("created_at");

-- CreateIndex
CREATE INDEX "vendors_status_idx" ON "vendors"("status");

-- CreateIndex
CREATE INDEX "vendors_city_idx" ON "vendors"("city");

-- CreateIndex
CREATE INDEX "vendors_state_idx" ON "vendors"("state");

-- CreateIndex
CREATE INDEX "vendors_business_type_idx" ON "vendors"("business_type");

-- CreateIndex
CREATE INDEX "vendors_latitude_longitude_idx" ON "vendors"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "vendors_created_at_idx" ON "vendors"("created_at");

-- CreateIndex
CREATE INDEX "vendor_offers_category_idx" ON "vendor_offers"("category");

-- CreateIndex
CREATE INDEX "vendor_offers_is_approved_is_active_idx" ON "vendor_offers"("is_approved", "is_active");

-- CreateIndex
CREATE INDEX "point_transactions_user_id_type_created_at_idx" ON "point_transactions"("user_id", "type", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "redemptions_receipt_number_key" ON "redemptions"("receipt_number");

-- CreateIndex
CREATE INDEX "redemptions_offer_id_idx" ON "redemptions"("offer_id");

-- CreateIndex
CREATE INDEX "redemptions_created_at_idx" ON "redemptions"("created_at");

-- CreateIndex
CREATE INDEX "redemptions_status_offer_id_idx" ON "redemptions"("status", "offer_id");

-- CreateIndex
CREATE UNIQUE INDEX "places_slug_key" ON "places"("slug");

-- CreateIndex
-- CreateIndex
CREATE INDEX "places_submittedById_idx" ON "places"("submittedById");

-- CreateIndex
CREATE INDEX "places_city_idx" ON "places"("city");

-- CreateIndex
CREATE INDEX "places_state_idx" ON "places"("state");

-- CreateIndex
CREATE INDEX "places_city_state_idx" ON "places"("city", "state");

-- CreateIndex
CREATE INDEX "places_popularity_score_idx" ON "places"("popularity_score");

-- CreateIndex
CREATE INDEX "places_hidden_gem_score_idx" ON "places"("hidden_gem_score");

-- CreateIndex
CREATE INDEX "places_rating_idx" ON "places"("rating");

-- CreateIndex
CREATE INDEX "places_created_at_idx" ON "places"("created_at");

-- CreateIndex
CREATE INDEX "places_status_category_idx" ON "places"("status", "category");

-- CreateIndex
CREATE INDEX "places_source_status_idx" ON "places"("source", "status");

-- CreateIndex
CREATE INDEX "places_status_latitude_longitude_idx" ON "places"("status", "latitude", "longitude");

-- CreateIndex
CREATE INDEX "place_images_place_id_url_idx" ON "place_images"("place_id", "url");

-- CreateIndex
CREATE INDEX "reviews_rating_idx" ON "reviews"("rating");

-- CreateIndex
CREATE INDEX "reviews_created_at_idx" ON "reviews"("created_at");

-- CreateIndex
CREATE INDEX "check_ins_created_at_idx" ON "check_ins"("created_at");

-- CreateIndex
CREATE INDEX "check_ins_created_at_user_id_idx" ON "check_ins"("created_at", "user_id");

-- CreateIndex
CREATE INDEX "check_ins_place_id_user_id_idx" ON "check_ins"("place_id", "user_id");

-- CreateIndex
CREATE INDEX "place_stats_placeId_action_idx" ON "place_stats"("placeId", "action");

-- CreateIndex
CREATE INDEX "place_stats_created_at_idx" ON "place_stats"("created_at");

-- CreateIndex
CREATE INDEX "trip_plan_stops_trip_plan_day_id_order_idx" ON "trip_plan_stops"("trip_plan_day_id", "order");

-- CreateIndex
CREATE UNIQUE INDEX "trip_plan_stops_trip_plan_day_id_place_id_key" ON "trip_plan_stops"("trip_plan_day_id", "place_id");

-- CreateIndex
CREATE INDEX "creator_profiles_status_idx" ON "creator_profiles"("status");

-- CreateIndex
CREATE INDEX "creator_profiles_verified_idx" ON "creator_profiles"("verified");

-- CreateIndex
CREATE INDEX "creator_profiles_follower_count_idx" ON "creator_profiles"("follower_count");

-- CreateIndex
CREATE INDEX "reels_creator_id_idx" ON "reels"("creator_id");

-- CreateIndex
CREATE INDEX "reels_place_id_idx" ON "reels"("place_id");

-- CreateIndex
CREATE INDEX "reels_vendor_id_idx" ON "reels"("vendor_id");

-- CreateIndex
CREATE INDEX "reels_event_id_idx" ON "reels"("event_id");

-- CreateIndex
CREATE INDEX "reels_featured_idx" ON "reels"("featured");

-- CreateIndex
CREATE INDEX "reels_views_idx" ON "reels"("views");

-- CreateIndex
CREATE INDEX "reels_likes_idx" ON "reels"("likes");

-- CreateIndex
CREATE INDEX "reels_search_vector_idx" ON "reels" USING GIN ("search_vector");

-- CreateIndex
CREATE INDEX "reels_status_idx" ON "reels"("status");

-- CreateIndex
CREATE INDEX "reels_category_idx" ON "reels"("category");

-- CreateIndex
CREATE INDEX "reels_created_at_idx" ON "reels"("created_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_verified_by_id_fkey" FOREIGN KEY ("verified_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_offers" ADD CONSTRAINT "vendor_offers_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_offers" ADD CONSTRAINT "vendor_offers_rejected_by_id_fkey" FOREIGN KEY ("rejected_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "vendor_offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_refunded_by_id_fkey" FOREIGN KEY ("refunded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_verified_by_id_fkey" FOREIGN KEY ("verified_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_following_id_fkey" FOREIGN KEY ("following_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "places" ADD CONSTRAINT "places_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_images" ADD CONSTRAINT "place_images_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_videos" ADD CONSTRAINT "place_videos_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_offers" ADD CONSTRAINT "place_offers_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_events" ADD CONSTRAINT "place_events_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_places" ADD CONSTRAINT "collection_places_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_places" ADD CONSTRAINT "collection_places_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_plans" ADD CONSTRAINT "trip_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_plan_days" ADD CONSTRAINT "trip_plan_days_trip_plan_id_fkey" FOREIGN KEY ("trip_plan_id") REFERENCES "trip_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_plan_stops" ADD CONSTRAINT "trip_plan_stops_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_plan_stops" ADD CONSTRAINT "trip_plan_stops_trip_plan_day_id_fkey" FOREIGN KEY ("trip_plan_day_id") REFERENCES "trip_plan_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_collaborators" ADD CONSTRAINT "trip_collaborators_trip_plan_id_fkey" FOREIGN KEY ("trip_plan_id") REFERENCES "trip_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_collaborators" ADD CONSTRAINT "trip_collaborators_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reels" ADD CONSTRAINT "reels_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "place_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reels" ADD CONSTRAINT "reels_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reels" ADD CONSTRAINT "reels_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_daily_rewards" ADD CONSTRAINT "creator_daily_rewards_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "creator_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_daily_rewards" ADD CONSTRAINT "creator_daily_rewards_reel_id_fkey" FOREIGN KEY ("reel_id") REFERENCES "reels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "places_search_idx" RENAME TO "places_search_vector_idx";


