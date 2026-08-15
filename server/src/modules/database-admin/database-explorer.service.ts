import { prisma } from '../../config/database';
import { Prisma } from '@prisma/client';

const TABLE_REGISTRY: Record<string, string> = {
  'users': 'user',
  'user_app_preferences': 'userAppPreference',
  'user_blocks': 'userBlock',
  'app_feedback': 'appFeedback',
  'user_roles': 'userRole',
  'vendors': 'vendor',
  'vendor_offers': 'vendorOffer',
  'vendor_reels': 'vendorReel',
  'point_balances': 'pointBalance',
  'point_transactions': 'pointTransaction',
  'redemptions': 'redemption',
  'receipt_sequences': 'receiptSequence',
  'wallets': 'wallet',
  'wallet_transactions': 'walletTransaction',
  'redemption_tokens': 'redemptionToken',
  'point_rules': 'pointRule',
  'reward_catalog': 'rewardCatalog',
  'follows': 'follow',
  'places': 'place',
  'place_images': 'placeImage',
  'place_aliases': 'placeAlias',
  'place_merge_logs': 'placeMergeLog',
  'place_public_id_sequences': 'placePublicIdSequence',
  'place_field_provenance': 'placeFieldProvenance',
  'place_versions': 'placeVersion',
  'place_relationships': 'placeRelationship',
  'place_quality_checks': 'placeQualityCheck',
  'place_duplicate_candidates': 'placeDuplicateCandidate',
  'place_change_history': 'placeChangeHistory',
  'place_verification_logs': 'placeVerificationLog',
  'place_translations': 'placeTranslation',
  'place_boundary_validation': 'placeBoundaryValidation',
  'place_search_embeddings': 'placeSearchEmbedding',
  'deleted_place_refs': 'deletedPlaceRef',
  'user_place_images': 'userPlaceImage',
  'place_videos': 'placeVideo',
  'place_offers': 'placeOffer',
  'place_events': 'placeEvent',
  'reviews': 'review',
  'vendor_reviews': 'vendorReview',
  'check_ins': 'checkIn',
  'place_stats': 'placeStat',
  'collections': 'collection',
  'collection_places': 'collectionPlace',
  'trip_plans': 'tripPlan',
  'trip_plan_days': 'tripPlanDay',
  'trip_plan_stops': 'tripPlanStop',
  'trip_collaborators': 'tripCollaborator',
  'ai_generation_logs': 'aiGenerationLog',
  'audit_logs': 'auditLog',
  'refresh_tokens': 'refreshToken',
  'sync_queue': 'syncQueue',
  'device_tokens': 'deviceToken',
  'in_app_notifications': 'inAppNotification',
  'creator_profiles': 'creatorProfile',
  'reels': 'reel',
  'reel_reports': 'reelReport',
  'creator_daily_rewards': 'creatorDailyReward',
  'reel_comments': 'reelComment',
  'reel_likes': 'reelLike',
  'reel_saves': 'reelSave',
  'system_settings': 'systemSetting',
  'notification_templates': 'notificationTemplate',
  'riddles': 'riddle',
  'riddle_submissions': 'riddleSubmission',
  'password_reset_tokens': 'passwordResetToken',
  'reward_campaigns': 'rewardCampaign',
  'reward_claims': 'rewardClaim',
  'challenges': 'challenge',
  'challenge_completions': 'challengeCompletion',
  'search_query_logs': 'searchQueryLog',
  'legal_documents': 'legalDocument',
  'legal_document_versions': 'legalDocumentVersion',
  'announcements': 'announcement',
  'subscription_plans': 'subscriptionPlan',
  'plan_prices': 'planPrice',
  'user_subscriptions': 'userSubscription',
  'payment_transactions': 'paymentTransaction',
  'invoices': 'invoice',
  'refunds': 'refund',
  'coupons': 'coupon',
  'coupon_redemptions': 'couponRedemption',
  'vendor_documents': 'vendorDocument',
  'ad_configurations': 'adConfiguration',
  'subscription_features': 'subscriptionFeature',
  'plan_feature_assignments': 'planFeatureAssignment',
  'plan_limits': 'planLimit',
  'plan_permissions': 'planPermission',
  'plan_faqs': 'planFAQ',
  'plan_highlights': 'planHighlight',
  'subscription_audit_logs': 'subscriptionAuditLog',
  'pal_points_partner_config': 'palPointsPartnerConfig',
  'vendor_pal_points_partners': 'vendorPalPointsPartner',
  'vendor_pal_points_partner_offers': 'vendorPalPointsPartnerOffer',
  'ride_providers': 'rideProvider',
  'ride_provider_configurations': 'rideProviderConfiguration',
  'ride_requests': 'rideRequest',
  'ride_history': 'rideHistory',
  'ride_destinations': 'rideDestination',
  'ride_favorites': 'rideFavorite',
  'collaborations': 'collaboration',
  'collaboration_deliverables': 'collaborationDeliverable',
  'collaboration_status_history': 'collaborationStatusHistory',
  'collaboration_revisions': 'collaborationRevision',
  'collaboration_analytics': 'collaborationAnalytics'
};

const SENSITIVE_PATTERNS = [
  /password/i,
  /hash/i,
  /token/i,
  /secret/i,
  /key/i,
  /credential/i
];

function isSensitive(key: string): boolean {
  return SENSITIVE_PATTERNS.some(pattern => pattern.test(key));
}

function maskData(data: any): any {
  if (data === null || data === undefined) return data;
  
  if (Array.isArray(data)) {
    return data.map(maskData);
  }
  
  if (typeof data === 'object' && !(data instanceof Date)) {
    const masked: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (isSensitive(key) && value !== null) {
        masked[key] = '********';
      } else {
        masked[key] = maskData(value);
      }
    }
    return masked;
  }
  
  return data;
}

export const databaseExplorerService = {
  async getTables() {
    const rows = await prisma.$queryRaw<
      { table_name: string; row_estimate: bigint; total_bytes: bigint }[]
    >`
      SELECT
        relname AS table_name,
        GREATEST(reltuples, 0)::bigint AS row_estimate,
        pg_total_relation_size(relid) AS total_bytes
      FROM pg_stat_user_tables
      ORDER BY relname ASC
    `.catch(() => []);

    return {
      tables: rows
        .filter((r) => TABLE_REGISTRY[r.table_name])
        .map((r) => ({
          table: r.table_name,
          rowEstimate: Number(r.row_estimate),
          sizeBytes: Number(r.total_bytes),
        })),
    };
  },

  async getTableSchema(tableName: string) {
    if (!TABLE_REGISTRY[tableName]) {
      throw new Error(`Table ${tableName} not found or not allowed.`);
    }

    const rows = await prisma.$queryRaw<
      { column_name: string; data_type: string; is_nullable: string; column_default: string | null }[]
    >`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${tableName}
      ORDER BY ordinal_position
    `.catch(() => []);

    return {
      table: tableName,
      columns: rows.map(r => ({
        name: r.column_name,
        type: r.data_type,
        nullable: r.is_nullable === 'YES',
        defaultValue: r.column_default
      }))
    };
  },

  async getTableRecords(tableName: string, page: number, pageSize: number, search?: string) {
    const prismaModel = TABLE_REGISTRY[tableName];
    if (!prismaModel) {
      throw new Error(`Table ${tableName} not found or not allowed.`);
    }

    const limit = Math.min(Math.max(1, pageSize), 100);
    const skip = Math.max(0, (page - 1) * limit);

    // Dynamic accessor for prisma model
    const modelDelegate = (prisma as any)[prismaModel];
    if (!modelDelegate) {
      throw new Error(`Prisma delegate for ${prismaModel} not found.`);
    }

    let whereClause = {};

    if (search) {
      // Find text columns from schema to build a safe search query
      const columns = await this.getTableSchema(tableName);
      const textColumns = columns.columns
        .filter(c => c.type === 'text' || c.type === 'character varying' || c.type === 'uuid')
        .map(c => c.name);

      if (textColumns.length > 0) {
        whereClause = {
          OR: textColumns.map(col => ({
            [col]: { contains: search, mode: 'insensitive' }
          }))
        };
      }
    }

    const [total, records] = await Promise.all([
      modelDelegate.count({ where: whereClause }),
      modelDelegate.findMany({
        where: whereClause,
        take: limit,
        skip,
        orderBy: { id: 'desc' } // Assuming 'id' exists. If not, Prisma might throw, but most tables have it.
      }).catch(async (e: any) => {
         // Fallback if 'id' doesn't exist for sorting
         return await modelDelegate.findMany({
            where: whereClause,
            take: limit,
            skip
         });
      })
    ]);

    return {
      table: tableName,
      pagination: {
        page,
        pageSize: limit,
        total,
        totalPages: Math.ceil(total / limit)
      },
      records: maskData(records)
    };
  }
};
