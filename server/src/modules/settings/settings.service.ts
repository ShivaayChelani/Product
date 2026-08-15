import { prisma } from '../../config/database';
import { ApiError } from '../../shared/utils/ApiError';

const DEFAULT_SETTINGS: Array<{
  category: string; key: string; value: any; label: string; description: string; type: string;
}> = [
  { category: 'general', key: 'app_name', value: 'PalSafar', label: 'App Name', description: 'The name of the application', type: 'string' },
  { category: 'general', key: 'app_description', value: 'Discover India\'s Hidden Gems', label: 'App Description', description: 'Short description of the app', type: 'string' },
  { category: 'general', key: 'support_email', value: 'support@palsafar.com', label: 'Support Email', description: 'Email address for support', type: 'string' },
  { category: 'general', key: 'maintenance_mode', value: false, label: 'Maintenance Mode', description: 'Enable maintenance mode for the app', type: 'boolean' },

  { category: 'security', key: 'max_login_attempts', value: 5, label: 'Max Login Attempts', description: 'Maximum failed login attempts before lockout', type: 'number' },
  { category: 'security', key: 'session_timeout_minutes', value: 60, label: 'Session Timeout (minutes)', description: 'User session timeout duration', type: 'number' },
  { category: 'security', key: 'require_email_verification', value: true, label: 'Require Email Verification', description: 'Require users to verify their email', type: 'boolean' },
  { category: 'security', key: 'allow_guest_access', value: true, label: 'Allow Guest Access', description: 'Allow users to browse without login', type: 'boolean' },

  { category: 'points', key: 'points_per_checkin', value: 10, label: 'Points per Check-in', description: 'Pal Points awarded for checking in at a place', type: 'number' },
  { category: 'points', key: 'points_per_review', value: 50, label: 'Points per Review', description: 'Pal Points awarded for writing a review', type: 'number' },
  { category: 'points', key: 'points_per_reel', value: 50, label: 'Points per Reel Upload', description: 'Pal Points awarded for uploading a reel', type: 'number' },
  { category: 'points', key: 'daily_login_points', value: 10, label: 'Daily Login Points', description: 'Pal Points for daily login', type: 'number' },
  { category: 'points', key: 'streak_bonus_multiplier', value: 2, label: 'Streak Bonus Multiplier', description: 'Points multiplier for maintaining streaks', type: 'number' },
  { category: 'points', key: 'max_daily_points', value: 500, label: 'Max Daily Points', description: 'Maximum Pal Points a user can earn per day', type: 'number' },

  { category: 'notifications', key: 'push_enabled', value: true, label: 'Push Notifications', description: 'Enable push notifications', type: 'boolean' },
  { category: 'notifications', key: 'email_notifications', value: true, label: 'Email Notifications', description: 'Enable email notifications', type: 'boolean' },
  { category: 'notifications', key: 'digest_frequency', value: 'daily', label: 'Digest Frequency', description: 'How often to send notification digests', type: 'select' },

  { category: 'vendor_program', key: 'vendor_commission_pct', value: 10, label: 'Vendor Commission (%)', description: 'Default commission percentage for vendors', type: 'number' },
  { category: 'vendor_program', key: 'auto_approve_vendors', value: false, label: 'Auto-Approve Vendors', description: 'Automatically approve vendor applications', type: 'boolean' },
  { category: 'vendor_program', key: 'min_payout', value: 500, label: 'Minimum Payout (₹)', description: 'Minimum payout threshold for vendors', type: 'number' },

  { category: 'map_settings', key: 'default_map_center_lat', value: 20.5937, label: 'Default Map Center Latitude', description: 'Default latitude for the map view', type: 'number' },
  { category: 'map_settings', key: 'default_map_center_lng', value: 78.9629, label: 'Default Map Center Longitude', description: 'Default longitude for the map view', type: 'number' },
  { category: 'map_settings', key: 'default_zoom', value: 5, label: 'Default Zoom Level', description: 'Default zoom level for the map', type: 'number' },
  { category: 'map_settings', key: 'cluster_radius', value: 50, label: 'Cluster Radius (km)', description: 'Radius for clustering nearby places on map', type: 'number' },

  { category: 'rewards_settings', key: 'reward_points_per_rupee', value: 1, label: 'Reward Points per ₹', description: 'Number of reward points per rupee spent', type: 'number' },
  { category: 'rewards_settings', key: 'min_reward_redemption', value: 100, label: 'Min Reward Redemption', description: 'Minimum points required for redemption', type: 'number' },
  { category: 'rewards_settings', key: 'reward_expiry_days', value: 365, label: 'Reward Expiry (days)', description: 'Days after which reward points expire', type: 'number' },

  { category: 'monetization', key: 'subscription_grace_days_default', value: 3, label: 'Default grace period (days)', description: 'Fallback grace period when plan does not specify one', type: 'number' },
  { category: 'monetization', key: 'vendor_default_max_offers', value: 0, label: 'Default max offers (free vendor)', description: 'Offer limit when vendor has no active subscription (0 = must subscribe)', type: 'number' },
  { category: 'monetization', key: 'vendor_default_max_reels', value: 0, label: 'Default max promo reels (free vendor)', description: 'Reel limit when vendor has no active subscription', type: 'number' },
  { category: 'monetization', key: 'creator_default_upload_limit', value: 5, label: 'Default creator upload limit / month', description: 'Upload limit without creator membership', type: 'number' },
  { category: 'ads', key: 'rewarded_ad_points_fallback', value: 10, label: 'Rewarded ad points fallback', description: 'Used if AdConfiguration is missing', type: 'number' },
  { category: 'feature_flags', key: 'force_update_min_version', value: '', label: 'Minimum app version', description: 'Block older app versions (semver). Empty = no block', type: 'string' },
  { category: 'feature_flags', key: 'latest_app_version', value: '2.4.0', label: 'Latest app version', description: 'Latest published mobile app version', type: 'string' },
  { category: 'feature_flags', key: 'latest_app_build', value: '1', label: 'Latest app build', description: 'Latest published mobile build number', type: 'string' },
  { category: 'feature_flags', key: 'play_store_url', value: 'https://play.google.com/store/apps/details?id=com.palsafar', label: 'Play Store URL', description: 'Google Play listing URL', type: 'string' },
  { category: 'feature_flags', key: 'app_store_url', value: 'https://apps.apple.com/app/id0000000000', label: 'App Store URL', description: 'Apple App Store listing URL', type: 'string' },
  { category: 'feature_flags', key: 'announcement_banner_enabled', value: true, label: 'Announcement banner enabled', description: 'Show admin announcements in the app', type: 'boolean' },
];

export const settingsService = {
  async seedDefaults() {
    for (const setting of DEFAULT_SETTINGS) {
      await prisma.systemSetting.upsert({
        where: { key: setting.key },
        update: { label: setting.label, description: setting.description, type: setting.type, category: setting.category },
        create: setting,
      });
    }
  },

  async getAll() {
    const settings = await prisma.systemSetting.findMany({ orderBy: [{ category: 'asc' }, { key: 'asc' }] });
    return settings;
  },

  async getByCategory(category: string) {
    return prisma.systemSetting.findMany({
      where: { category },
      orderBy: { key: 'asc' },
    });
  },

  async update(key: string, value: any) {
    const setting = await prisma.systemSetting.findUnique({ where: { key } });
    if (!setting) throw new ApiError(404, `Setting "${key}" not found`);

    return prisma.systemSetting.update({
      where: { key },
      data: { value: JSON.parse(JSON.stringify(value)) },
    });
  },

  async bulkUpdate(updates: Array<{ key: string; value: any }>) {
    const results = [];
    for (const { key, value } of updates) {
      const setting = await prisma.systemSetting.findUnique({ where: { key } });
      if (setting) {
        const updated = await prisma.systemSetting.update({
          where: { key },
          data: { value: JSON.parse(JSON.stringify(value)) },
        });
        results.push(updated);
      }
    }
    return results;
  },

  async resetDefaults() {
    await prisma.systemSetting.deleteMany();
    await this.seedDefaults();
    return this.getAll();
  },

  async getCategories() {
    const result = await prisma.systemSetting.findMany({
      select: { category: true },
      distinct: ['category'],
      orderBy: { category: 'asc' },
    });
    return result.map(r => r.category);
  },
};
