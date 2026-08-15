import { prisma } from './database';
import { logger } from './logger';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Role, PlaceStatus, RoleAssignmentStatus } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { settingsService } from '../modules/settings/settings.service';
import { pointRulesService } from '../modules/point-rules/pointRules.service';
import { seedStreetStory } from './seed-data';
import { ensureBaseUserRole, upsertRoleStatus, syncUserPermissionFromRoles } from '../shared/utils/specialtyRoles';
import { findUserByEmail } from '../shared/utils/userEmailLookup';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 100);
}

type CanonicalUser = {
  email: string;
  password: string;
  name: string;
  permission: Role;
  activeMode: Role;
};

/** Production admin dashboard accounts — always provisioned on API startup. */
export const ADMIN_USER_EMAILS = [
  'shivaay.chelani@gmail.com',
  'chelanimonika@gmail.com',
  'vinodiyakanika@gmail.com',
  'snehapatel9171@gmail.com',
] as const;

const ADMIN_USER_PROFILES: { email: string; name: string }[] = [
  { email: 'shivaay.chelani@gmail.com', name: 'Shivaay Chelani' },
  { email: 'chelanimonika@gmail.com', name: 'Monika Chelani' },
  { email: 'vinodiyakanika@gmail.com', name: 'Kanika Vinodiya' },
  { email: 'snehapatel9171@gmail.com', name: 'Sneha Patel' },
];

/** Protected accounts when PRUNE_EXTRA_USERS=true (admins + QA personas). */
export const CANONICAL_KEEP_EMAILS = [
  ...ADMIN_USER_EMAILS,
  'user@palsafar.com',
  'streetstory@palsafar.com',
  'rahul.chelani@palsafar.com',
] as const;

const DEFAULT_SEED_PASSWORDS = ['Admin@123', 'User@123', 'Vendor@123', 'Creator@123'];

function assertProductionSeedSafety(password: string, envName: string): string {
  if (process.env.NODE_ENV === 'production' && !process.env[envName]?.trim()) {
    throw new Error(`Refusing to seed in production without ${envName}.`);
  }
  if (process.env.NODE_ENV === 'production' && DEFAULT_SEED_PASSWORDS.includes(password)) {
    throw new Error(`Refusing to use default seed password in production (${envName}).`);
  }
  return password;
}

const REQUIRED_USERS: CanonicalUser[] = [
  {
    email: 'shivaay.chelani@gmail.com',
    password: process.env.SEED_ADMIN_PASSWORD || 'Admin@123',
    name: 'Shivaay Chelani',
    permission: Role.ADMIN,
    activeMode: Role.ADMIN,
  },
  { email: 'user@palsafar.com', password: process.env.SEED_USER_PASSWORD || 'User@123', name: 'Test User', permission: Role.USER, activeMode: Role.USER },
  { email: 'streetstory@palsafar.com', password: process.env.SEED_VENDOR_PASSWORD || 'Vendor@123', name: 'Street Story', permission: Role.VENDOR, activeMode: Role.USER },
  { email: 'rahul.chelani@palsafar.com', password: process.env.SEED_CREATOR_PASSWORD || 'Creator@123', name: 'Rahul Chelani', permission: Role.CONTENT_CREATOR, activeMode: Role.USER },
];
function roleConfig(permission: Role): { permission: Role; activeMode: Role } {
  return { permission, activeMode: permission === Role.ADMIN ? Role.ADMIN : permission };
}

async function upsertCanonicalUser(
  email: string,
  password: string,
  name: string,
  permission: Role,
  activeMode?: Role,
  options?: { syncPassword?: boolean },
): Promise<{ id: string; email: string }> {
  const syncPassword = options?.syncPassword ?? true;
  const hashed = await bcrypt.hash(password, 12);
  const config = { permission, activeMode: activeMode ?? roleConfig(permission).activeMode };
  const user = await prisma.user.upsert({
    where: { email },
    update: {
      ...(syncPassword ? { password: hashed } : {}),
      name,
      emailVerified: true,
      ...config,
    },
    create: { email, password: hashed, name, emailVerified: true, ...config },
    select: { id: true, email: true },
  });
  await prisma.wallet.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id, palPoints: 0, lifetimeEarned: 0, lifetimeSpent: 0 },
  });

  await ensureBaseUserRole(user.id);
  if (permission === Role.ADMIN) {
    await upsertRoleStatus({
      userId: user.id,
      role: Role.ADMIN,
      status: RoleAssignmentStatus.APPROVED,
    });
  } else if (permission === Role.VENDOR) {
    await upsertRoleStatus({
      userId: user.id,
      role: Role.VENDOR,
      status: RoleAssignmentStatus.APPROVED,
    });
  } else if (permission === Role.CONTENT_CREATOR) {
    await upsertRoleStatus({
      userId: user.id,
      role: Role.CONTENT_CREATOR,
      status: RoleAssignmentStatus.APPROVED,
    });
  }
  await syncUserPermissionFromRoles(user.id);

  return user;
}

/** Ensure all admin dashboard accounts exist with ADMIN role. Safe on every startup. */
export async function ensureAdminUsers(): Promise<void> {
  const syncPasswords = process.env.SYNC_CANONICAL_CREDENTIALS === 'true';
  const adminPassword = syncPasswords
    ? assertProductionSeedSafety(process.env.SEED_ADMIN_PASSWORD || 'Admin@123', 'SEED_ADMIN_PASSWORD')
    : process.env.SEED_ADMIN_PASSWORD || 'Admin@123';

  for (const profile of ADMIN_USER_PROFILES) {
    const email = profile.email.trim().toLowerCase();
    const existing = await findUserByEmail(email);

    if (!existing) {
      const password = syncPasswords ? adminPassword : crypto.randomBytes(24).toString('base64url');
      await upsertCanonicalUser(email, password, profile.name, Role.ADMIN, Role.ADMIN);
      logger.info(
        { email, onboarding: syncPasswords ? 'shared-password' : 'forgot-password' },
        'Admin dashboard user created',
      );
      continue;
    }

    await ensureBaseUserRole(existing.id);
    await upsertRoleStatus({
      userId: existing.id,
      role: Role.ADMIN,
      status: RoleAssignmentStatus.APPROVED,
    });
    await prisma.user.update({
      where: { id: existing.id },
      data: { permission: Role.ADMIN, activeMode: Role.ADMIN, name: profile.name },
    });
    await syncUserPermissionFromRoles(existing.id);
    await prisma.wallet.upsert({
      where: { userId: existing.id },
      update: {},
      create: { userId: existing.id, palPoints: 0, lifetimeEarned: 0, lifetimeSpent: 0 },
    });

    if (syncPasswords) {
      const hashed = await bcrypt.hash(adminPassword, 12);
      await prisma.user.update({
        where: { id: existing.id },
        data: { password: hashed },
      });
    }

    logger.info({ email: existing.email }, 'Admin dashboard access ensured');
  }
}

async function syncCanonicalCredentials(): Promise<void> {
  // Production: require explicit opt-in. Dev/staging: sync unless explicitly disabled.
  const syncFlag = process.env.SYNC_CANONICAL_CREDENTIALS;
  if (syncFlag === 'false') {
    logger.info('Canonical credential sync disabled (SYNC_CANONICAL_CREDENTIALS=false)');
    return;
  }
  if (process.env.NODE_ENV === 'production' && syncFlag !== 'true') {
    logger.info('Canonical credential sync skipped in production (set SYNC_CANONICAL_CREDENTIALS=true only on disposable demo DBs)');
    return;
  }

  for (const acct of REQUIRED_USERS) {
    await upsertCanonicalUser(acct.email, acct.password, acct.name, acct.permission, acct.activeMode);
  }

  logger.info('Canonical test credentials synced (only the four protected test accounts)');
}

/** Ensures canonical QA accounts work when full credential sync is disabled. */
async function ensureQaTouristAccount(): Promise<void> {
  if (process.env.NODE_ENV === 'production') return;
  if (process.env.SYNC_CANONICAL_CREDENTIALS !== 'false') return;

  const isVitest = process.env.VITEST === 'true' || process.env.VITEST === '1';
  const accounts = isVitest
    ? REQUIRED_USERS
    : REQUIRED_USERS.filter((u) => u.email === 'user@palsafar.com');

  for (const acct of accounts) {
    await upsertCanonicalUser(acct.email, acct.password, acct.name, acct.permission, acct.activeMode, {
      syncPassword: process.env.NODE_ENV !== 'production',
    });
  }

  if (isVitest) {
    logger.info('Integration test credentials ensured for all canonical accounts');
    return;
  }

  const tourist = accounts[0];
  const user = await prisma.user.findUnique({ where: { email: tourist.email }, select: { id: true } });
  if (user) {
    const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
    const minQaPoints = Number(process.env.QA_TOURIST_MIN_POINTS || 500);
    if (!wallet || wallet.palPoints < minQaPoints) {
      await prisma.wallet.upsert({
        where: { userId: user.id },
        update: { palPoints: minQaPoints, lifetimeEarned: { increment: minQaPoints } },
        create: { userId: user.id, palPoints: minQaPoints, lifetimeEarned: minQaPoints, lifetimeSpent: 0 },
      });
      logger.info({ minQaPoints }, 'QA tourist wallet topped up for redemption testing');
    }
  }
  logger.info('QA tourist account (user@palsafar.com) credentials ensured');
}

export async function syncQaCredentials(): Promise<void> {
  await syncCanonicalCredentials();
  await ensureQaTouristAccount();
}

/**
 * Delete every user except the four canonical accounts.
 * Cleans dependent rows first — production DB has RESTRICT FKs on redemptions.offer_id.
 */
export async function pruneExtraUsers(): Promise<{ deleted: number; kept: string[] }> {
  const keep = [...CANONICAL_KEEP_EMAILS];
  const toDelete = await prisma.user.findMany({
    where: { email: { notIn: keep } },
    select: { id: true, email: true },
  });

  if (toDelete.length === 0) {
    logger.info({ keep }, 'No extra users to prune');
    return { deleted: 0, kept: keep };
  }

  const ids = toDelete.map((u) => u.id);

  const vendors = await prisma.vendor.findMany({
    where: { userId: { in: ids } },
    select: { id: true },
  });
  const vendorIds = vendors.map((v) => v.id);

  const offers = vendorIds.length
    ? await prisma.vendorOffer.findMany({
        where: { vendorId: { in: vendorIds } },
        select: { id: true },
      })
    : [];
  const offerIds = offers.map((o) => o.id);

  // Redemptions: production FK is ON DELETE RESTRICT on offer_id — must delete first
  if (offerIds.length || vendorIds.length || ids.length) {
    await prisma.redemption.deleteMany({
      where: {
        OR: [
          ...(offerIds.length ? [{ offerId: { in: offerIds } }] : []),
          ...(vendorIds.length ? [{ vendorId: { in: vendorIds } }] : []),
          { userId: { in: ids } },
          { verifiedById: { in: ids } },
          { refundedById: { in: ids } },
        ],
      },
    });
  }

  // Offers / vendor reels for vendors being removed (before user cascade)
  if (offerIds.length) {
    await prisma.vendorOffer.deleteMany({ where: { id: { in: offerIds } } });
  }
  if (vendorIds.length) {
    await prisma.vendorReel.deleteMany({ where: { vendorId: { in: vendorIds } } });
  }

  // Null optional FKs that block user deletes (prod still has RESTRICT on some)
  await prisma.place.updateMany({
    where: { submittedById: { in: ids } },
    data: { submittedById: null },
  });
  await prisma.place.updateMany({
    where: { approvedById: { in: ids } },
    data: { approvedById: null },
  });
  await prisma.vendor.updateMany({
    where: { reviewedById: { in: ids } },
    data: { reviewedById: null },
  });
  await prisma.user.updateMany({
    where: { verifiedById: { in: ids } },
    data: { verifiedById: null },
  });
  await prisma.vendorOffer.updateMany({
    where: { approvedById: { in: ids } },
    data: { approvedById: null },
  });
  await prisma.vendorOffer.updateMany({
    where: { rejectedById: { in: ids } },
    data: { rejectedById: null },
  });
  await prisma.auditLog.updateMany({
    where: { actorId: { in: ids } },
    data: { actorId: null },
  });

  const result = await prisma.user.deleteMany({
    where: { id: { in: ids } },
  });

  logger.info(
    { deleted: result.count, emails: toDelete.map((u) => u.email) },
    'Pruned extra users; kept admin, tourist, Street Story, Rahul Chelani',
  );
  return { deleted: result.count, kept: keep };
}

async function assertUserPermissionSchema(): Promise<void> {
  const columns = await prisma.$queryRaw<{ column_name: string }[]>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name IN ('permission', 'active_mode')
  `;

  if (columns.length < 2) {
    const message =
      'Database schema is missing users.permission / users.active_mode. ' +
      'Run migrations before starting the server: cd server && npx prisma migrate deploy';
    logger.fatal(message);
    throw new Error(message);
  }
}

export async function ensureSeedData(): Promise<void> {
  const isProduction = process.env.NODE_ENV === 'production';
  try {
    await assertUserPermissionSchema();
    await syncQaCredentials();
    await ensureAdminUsers();
    logger.info('Admin accounts ensured');

    let adminUser = await prisma.user.findUnique({
      where: { email: 'shivaay.chelani@gmail.com' },
    });

    // Seed system settings and point rules if empty (required platform data)
    const existingSettings = await prisma.systemSetting.count();
    if (existingSettings === 0) {
      await settingsService.seedDefaults();
      logger.info('System settings initialized');
    }

    const existingRules = await prisma.pointRule.count();
    if (existingRules === 0) {
      await pointRulesService.seedDefaults();
      logger.info('Point rules initialized');
    } else {
      await pointRulesService.ensureMissingDefaults();
    }

    // Destructive null-island cleanup is OPT-IN only (bad imports / unfinished geocodes).
    if (process.env.CLEANUP_NULL_ISLAND_PLACES === '1' || process.env.CLEANUP_NULL_ISLAND_PLACES === 'true') {
      const deleted = await prisma.place.deleteMany({
        where: { latitude: 0, longitude: 0 },
      });
      if (deleted.count > 0) {
        logger.warn({ deleted: deleted.count }, 'Deleted places with coordinates (0,0) — CLEANUP_NULL_ISLAND_PLACES enabled');
      }
    }

    // Curated places are only synced when explicitly enabled (off by default — no hardcoded data)
    const syncCurated = process.env.SYNC_CURATED_PLACES === 'true';
    if (syncCurated) {
      const jsonPath = path.resolve(process.cwd(), 'prisma/seed-data/places-curated.json');
      if (!fs.existsSync(jsonPath)) {
        logger.error(`Syncing places failed: places-curated.json not found at ${jsonPath}`);
      } else {
        const rawData = fs.readFileSync(jsonPath, 'utf8');
        const rawPlaces = JSON.parse(rawData);

        // Re-lookup admin for curated place attribution
        if (!adminUser) {
          adminUser = await prisma.user.findUnique({ where: { email: 'shivaay.chelani@gmail.com' } });
        }

        if (adminUser) {
          const adminId = adminUser.id;
          const usedSlugs = new Set<string>();
          const placesToSync = rawPlaces.map((p: any) => {
            let slug = p.id || slugify(p.name);
            let counter = 1;
            while (usedSlugs.has(slug)) {
              slug = `${p.id || slugify(p.name)}-${counter}`;
              counter++;
            }
            usedSlugs.add(slug);

            return {
              name: p.name,
              slug,
              shortDescription: p.shortDescription || p.description?.substring(0, 200) || '',
              description: p.description || '',
              latitude: p.latitude || 0,
              longitude: p.longitude || 0,
              category: p.category,
              images: p.images || (p.imageUrl ? [p.imageUrl] : []),
              tags: p.tags || [],
              status: PlaceStatus.APPROVED,
              city: p.city || '',
              state: p.state || '',
              country: p.country || 'India',
              externalId: p.id ? `curated:${p.id}` : undefined,
              source: 'CURATED',
              submittedById: adminId,
              approvedById: adminId,
              reviewedAt: new Date(),
            };
          });

          logger.info(`Syncing ${placesToSync.length} curated places in database...`);
          const existingPlaces = await prisma.place.findMany({
            select: { slug: true }
          });
          const existingSlugs = new Set(existingPlaces.map(p => p.slug));

          let createdCount = 0;
          let skippedCount = 0;

          for (const p of placesToSync) {
            if (!existingSlugs.has(p.slug)) {
              await prisma.place.create({ data: p });
              createdCount++;
            } else {
              skippedCount++;
            }
          }
          logger.info(`Curated places synced. Created: ${createdCount}, Skipped: ${skippedCount}`);
        } else {
          logger.error('Syncing places failed: admin user not found.');
        }
      }
    }

    // Read-only vendor inventory check (does not create demo vendors)
    await ensureAdvancedSeedData();

    // Demo Street Story vendor + Rahul Chelani creator: OFF in production unless explicitly enabled
    const seedDemoStreetStory =
      !isProduction || process.env.SEED_STREET_STORY === 'true';
    if (seedDemoStreetStory) {
      await seedStreetStory(prisma);
    } else {
      logger.info('Demo Street Story / Rahul Chelani seed skipped in production');
    }

    // Prune is OPT-IN only. Default keeps all users so real signups survive restarts.
    // Set PRUNE_EXTRA_USERS=true only on disposable demo DBs that must stay at 4 accounts.
    if (process.env.PRUNE_EXTRA_USERS === 'true') {
      try {
        await pruneExtraUsers();
      } catch (pruneErr) {
        logger.error({ err: pruneErr }, 'Failed to prune extra users (server will continue)');
      }
    }

    logger.info(
      isProduction
        ? 'Production admin/system initialization completed'
        : 'Development seed initialization completed',
    );
  } catch (error) {
    logger.error({ err: error }, 'Failed to ensure seed data');
    if (isProduction) {
      throw error;
    }
  }
}

async function ensureAdvancedSeedData(): Promise<void> {
  try {
    // Read-only check — never create demo vendor_user_* accounts.
    const vendorCount = await prisma.vendor.count();
    logger.info({ vendorCount }, 'Vendor seed check (extra vendor users disabled)');
  } catch (error) {
    logger.error({ err: error }, 'Failed to ensure advanced seed data');
  }
}

