/**
 * Provision dedicated local/staging QA accounts for runtime security gate.
 * Usage: node -r dotenv/config scripts/provision-runtime-qa.cjs
 *
 * Refuses production unless RUNTIME_QA_PROVISION=true (disposable DB only).
 * Writes credentials to .env.runtime-qa (gitignored) — never prints passwords.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { PrismaClient, Role, RoleAssignmentStatus, VendorStatus, ChallengeDifficulty } = require('@prisma/client');

const prisma = new PrismaClient();
const ENV_OUT = path.join(__dirname, '..', '.env.runtime-qa');

const DEFAULTS = {
  QA_USER_EMAIL: 'qa-gate-traveler@palsafar.test',
  QA_USER_B_EMAIL: 'qa-gate-traveler-b@palsafar.test',
  QA_CREATOR_EMAIL: 'qa-gate-creator-a@palsafar.test',
  QA_CREATOR_B_EMAIL: 'qa-gate-creator-b@palsafar.test',
  QA_VENDOR_EMAIL: 'qa-gate-vendor-a@palsafar.test',
  QA_VENDOR_B_EMAIL: 'qa-gate-vendor-b@palsafar.test',
  QA_ADMIN_EMAIL: 'qa-gate-admin@palsafar.test',
};

function genPassword() {
  return crypto.randomBytes(21).toString('base64url');
}

function envOrDefault(key) {
  return process.env[key]?.trim() || DEFAULTS[key];
}

function envPassword(key) {
  return process.env[key]?.trim() || genPassword();
}

async function upsertUser(email, password, name, permission, activeMode) {
  const hashed = await bcrypt.hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email: email.toLowerCase() },
    update: {
      password: hashed,
      name,
      emailVerified: true,
      permission,
      activeMode: activeMode ?? permission,
    },
    create: {
      email: email.toLowerCase(),
      password: hashed,
      name,
      emailVerified: true,
      permission,
      activeMode: activeMode ?? permission,
    },
    select: { id: true, email: true },
  });
  await prisma.wallet.upsert({
    where: { userId: user.id },
    update: { palPoints: { set: 1000 } },
    create: { userId: user.id, palPoints: 1000, lifetimeEarned: 0, lifetimeSpent: 0 },
  });
  await prisma.userRole.upsert({
    where: { userId_role: { userId: user.id, role: Role.USER } },
    update: {},
    create: { userId: user.id, role: Role.USER, status: RoleAssignmentStatus.APPROVED },
  });
  if (permission !== Role.USER) {
    await prisma.userRole.upsert({
      where: { userId_role: { userId: user.id, role: permission } },
      update: { status: RoleAssignmentStatus.APPROVED },
      create: { userId: user.id, role: permission, status: RoleAssignmentStatus.APPROVED },
    });
  }
  return user;
}

async function ensureCreatorProfile(userId, username) {
  const existing = await prisma.creatorProfile.findUnique({ where: { userId } });
  if (existing) {
    return prisma.creatorProfile.update({
      where: { userId },
      data: { status: 'APPROVED', verified: true, username },
    });
  }
  return prisma.creatorProfile.create({
    data: {
      userId,
      username,
      bio: 'QA gate creator profile for runtime security testing only.',
      status: 'APPROVED',
      verified: true,
      fullName: 'QA Creator',
      travelCategories: ['culture'],
      instagramUrl: 'https://instagram.com/palsafar_qa',
    },
  });
}

async function ensureVendor(userId, suffix, adminId) {
  let vendor = await prisma.vendor.findFirst({ where: { userId } });
  const vendorCode = `VND-QA${suffix}`;
  if (!vendor) {
    vendor = await prisma.vendor.create({
      data: {
        userId,
        businessName: `QA Gate Vendor ${suffix}`,
        businessType: 'restaurant',
        phone: '+910000000000',
        address: 'QA Test Address',
        city: 'Jabalpur',
        state: 'Madhya Pradesh',
        latitude: 23.16,
        longitude: 79.93,
        description: 'Runtime security gate vendor fixture',
        status: VendorStatus.APPROVED,
        vendorCode,
        reviewedById: adminId,
        reviewedAt: new Date(),
      },
    });
  }
  let offer = await prisma.vendorOffer.findFirst({ where: { vendorId: vendor.id } });
  if (!offer) {
    offer = await prisma.vendorOffer.create({
      data: {
        vendorId: vendor.id,
        title: `QA Offer ${suffix}`,
        description: 'QA gate offer',
        discountType: 'PERCENTAGE',
        discountValue: 10,
        pointsRequired: 50,
        isActive: true,
        isApproved: true,
        approvedById: adminId,
        approvedAt: new Date(),
        category: 'food',
      },
    });
  }
  let reel = await prisma.vendorReel.findFirst({ where: { vendorId: vendor.id } });
  if (!reel) {
    reel = await prisma.vendorReel.create({
      data: {
        vendorId: vendor.id,
        videoUrl: 'https://example.com/qa-vendor-reel.mp4',
        thumbnail: 'https://example.com/qa-thumb.jpg',
        title: 'QA vendor reel',
      },
    });
  }
  return { vendor, offer, reel };
}

async function ensureCreatorReel(creatorProfileId) {
  let reel = await prisma.reel.findFirst({ where: { creatorId: creatorProfileId } });
  if (!reel) {
    reel = await prisma.reel.create({
      data: {
        creatorId: creatorProfileId,
        videoUrl: 'https://example.com/qa-creator-reel.mp4',
        thumbnail: 'https://example.com/qa-creator-thumb.jpg',
        title: 'QA Creator Reel',
        description: 'Runtime gate fixture',
      },
    });
  }
  return reel;
}

async function ensureChallenges(creatorUserId, adminId) {
  const specs = [
    { proof: 'PHOTO', title: 'QA Gate Photo Challenge' },
    { proof: 'VIDEO', title: 'QA Gate Video Challenge' },
    { proof: 'QR', title: 'QA Gate QR Challenge' },
    { proof: 'GPS', title: 'QA Gate GPS Challenge' },
  ];
  const out = {};
  for (const spec of specs) {
    let row = await prisma.challenge.findFirst({
      where: { title: spec.title, status: 'APPROVED' },
    });
    if (!row) {
      row = await prisma.challenge.create({
        data: {
          title: spec.title,
          description: 'Runtime security gate challenge fixture for proof enforcement.',
          difficulty: ChallengeDifficulty.EASY,
          category: 'qa-gate',
          proofRequired: spec.proof,
          status: 'APPROVED',
          creatorId: creatorUserId,
        },
      });
    }
    out[spec.proof] = row.id;
  }
  return out;
}

async function ensureCollaboration(vendorUserId, creatorProfileId) {
  const vendor = await prisma.vendor.findFirst({ where: { userId: vendorUserId } });
  if (!vendor) return null;
  const creator = await prisma.creatorProfile.findUnique({ where: { id: creatorProfileId } });
  if (!creator) return null;
  let collab = await prisma.collaboration.findFirst({
    where: { vendorId: vendor.id, creatorId: creatorProfileId, deletedAt: null },
  });
  if (!collab) {
    collab = await prisma.collaboration.create({
      data: {
        vendorId: vendor.id,
        creatorId: creatorProfileId,
        creatorUserId: creator.userId,
        vendorUserId,
        campaignTitle: 'QA Gate Collaboration',
        campaignCategory: 'food',
        businessName: vendor.businessName,
        businessLocation: 'QA Test City',
        budgetPaise: 500000,
        campaignBrief: 'Runtime security gate collaboration fixture for access control tests.',
        contactPerson: 'QA Gate',
        contactPhone: '+910000000001',
        contactEmail: 'qa-collab@palsafar.test',
        expiresAt: new Date(Date.now() + 7 * 86400000),
        deliverables: { create: [{ type: 'REEL', quantity: 1 }] },
      },
    });
  }
  return collab.id;
}

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.RUNTIME_QA_PROVISION !== 'true') {
    console.error('Refusing QA provisioning in production. Set RUNTIME_QA_PROVISION=true on disposable DB only.');
    process.exit(2);
  }

  const creds = {
    QA_USER_EMAIL: envOrDefault('QA_USER_EMAIL'),
    QA_USER_PASSWORD: envPassword('QA_USER_PASSWORD'),
    QA_USER_B_EMAIL: envOrDefault('QA_USER_B_EMAIL'),
    QA_USER_B_PASSWORD: envPassword('QA_USER_B_PASSWORD'),
    QA_CREATOR_EMAIL: envOrDefault('QA_CREATOR_EMAIL'),
    QA_CREATOR_PASSWORD: envPassword('QA_CREATOR_PASSWORD'),
    QA_CREATOR_B_EMAIL: envOrDefault('QA_CREATOR_B_EMAIL'),
    QA_CREATOR_B_PASSWORD: envPassword('QA_CREATOR_B_PASSWORD'),
    QA_VENDOR_EMAIL: envOrDefault('QA_VENDOR_EMAIL'),
    QA_VENDOR_PASSWORD: envPassword('QA_VENDOR_PASSWORD'),
    QA_VENDOR_B_EMAIL: envOrDefault('QA_VENDOR_B_EMAIL'),
    QA_VENDOR_B_PASSWORD: envPassword('QA_VENDOR_B_PASSWORD'),
    QA_ADMIN_EMAIL: envOrDefault('QA_ADMIN_EMAIL'),
    QA_ADMIN_PASSWORD: envPassword('QA_ADMIN_PASSWORD'),
  };

  const admin = await upsertUser(creds.QA_ADMIN_EMAIL, creds.QA_ADMIN_PASSWORD, 'QA Admin', Role.ADMIN, Role.ADMIN);
  const userA = await upsertUser(creds.QA_USER_EMAIL, creds.QA_USER_PASSWORD, 'QA Traveler A', Role.USER);
  const userB = await upsertUser(creds.QA_USER_B_EMAIL, creds.QA_USER_B_PASSWORD, 'QA Traveler B', Role.USER);

  const creatorAUser = await upsertUser(
    creds.QA_CREATOR_EMAIL,
    creds.QA_CREATOR_PASSWORD,
    'QA Creator A',
    Role.CONTENT_CREATOR,
    Role.USER,
  );
  const creatorBUser = await upsertUser(
    creds.QA_CREATOR_B_EMAIL,
    creds.QA_CREATOR_B_PASSWORD,
    'QA Creator B',
    Role.CONTENT_CREATOR,
    Role.USER,
  );
  const profileA = await ensureCreatorProfile(creatorAUser.id, 'qa_gate_creator_a');
  const profileB = await ensureCreatorProfile(creatorBUser.id, 'qa_gate_creator_b');
  const reelA = await ensureCreatorReel(profileA.id);
  const reelB = await ensureCreatorReel(profileB.id);

  const vendorAUser = await upsertUser(
    creds.QA_VENDOR_EMAIL,
    creds.QA_VENDOR_PASSWORD,
    'QA Vendor A',
    Role.VENDOR,
    Role.USER,
  );
  const vendorBUser = await upsertUser(
    creds.QA_VENDOR_B_EMAIL,
    creds.QA_VENDOR_B_PASSWORD,
    'QA Vendor B',
    Role.VENDOR,
    Role.USER,
  );
  const vendorA = await ensureVendor(vendorAUser.id, 'A', admin.id);
  const vendorB = await ensureVendor(vendorBUser.id, 'B', admin.id);

  const challenges = await ensureChallenges(creatorAUser.id, admin.id);
  const collabId = await ensureCollaboration(vendorAUser.id, profileB.id);

  const fixtureMeta = {
    creatorAProfileId: profileA.id,
    creatorBProfileId: profileB.id,
    creatorAReelId: reelA.id,
    creatorBReelId: reelB.id,
    vendorAId: vendorA.vendor.id,
    vendorBId: vendorB.vendor.id,
    vendorAOfferId: vendorA.offer.id,
    vendorBOfferId: vendorB.offer.id,
    vendorAReelId: vendorA.reel.id,
    vendorBReelId: vendorB.reel.id,
    collaborationId: collabId,
    challenges,
    userBId: userB.id,
  };

  const lines = [
    '# Auto-generated by provision-runtime-qa.cjs — DO NOT COMMIT',
    ...Object.entries(creds).map(([k, v]) => `${k}=${v}`),
    `RUNTIME_QA_FIXTURES=${JSON.stringify(fixtureMeta)}`,
  ];
  fs.writeFileSync(ENV_OUT, `${lines.join('\n')}\n`, { mode: 0o600 });
  console.log(`QA accounts provisioned. Credentials written to ${path.basename(ENV_OUT)} (not printed).`);
  console.log(`Accounts: ${Object.values(DEFAULTS).join(', ')}`);
}

main()
  .catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
