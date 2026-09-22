import { prisma } from '../../config/database';
import { legalService } from '../../modules/legal/legal.service';

export interface LegalVersions {
  termsVersion: number;
  privacyVersion: number;
}

/**
 * Idempotently ensures TERMS_CONDITIONS and PRIVACY_POLICY each have a published
 * version in the shared test database, exercising the real admin CMS service
 * (create + publish). Registration and Google signup refuse to run before legal
 * documents exist, so seeding happens in global test setup — never in production
 * seed data (legal copy must be authored by humans via the admin dashboard).
 */
export async function ensurePublishedLegalDocs(): Promise<LegalVersions> {
  const adminId = await findAdminId();
  const types = ['TERMS_CONDITIONS', 'PRIVACY_POLICY'] as const;

  for (const type of types) {
    const document = await legalService.createDocument({ type, locale: 'en' });
    const published = await prisma.legalDocumentVersion.findFirst({
      where: { documentId: document.id, status: 'PUBLISHED' },
      orderBy: { versionNumber: 'desc' },
    });
    if (published) continue;

    const version = await legalService.createVersion(document.id, adminId, {
      title: type === 'TERMS_CONDITIONS' ? 'Terms & Conditions' : 'Privacy Policy',
      content: `# ${type}\n\nTest fixture document used by the automated test suite.`,
      format: 'MARKDOWN',
      changeSummary: 'Published as part of test seed data',
    });
    await legalService.publishVersion(version.id, adminId);
  }

  return getPublishedLegalVersions();
}

async function findAdminId(): Promise<string> {
  const admin = await prisma.user.findFirst({
    where: { permission: 'ADMIN' },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!admin) throw new Error('No ADMIN user exists to attribute legal seed versions to.');
  return admin.id;
}

/** Non-throwing DB read of the current published versions (mirrors legalService.getCurrentVersions). */
export async function getPublishedLegalVersions(): Promise<LegalVersions> {
  const latest = async (type: 'TERMS_CONDITIONS' | 'PRIVACY_POLICY') => {
    const doc = await prisma.legalDocument.findUnique({
      where: { type_locale: { type, locale: 'en' } },
    });
    if (!doc) return null;
    const version = await prisma.legalDocumentVersion.findFirst({
      where: { documentId: doc.id, status: 'PUBLISHED' },
      orderBy: { versionNumber: 'desc' },
      select: { versionNumber: true },
    });
    return version?.versionNumber ?? null;
  };

  const termsVersion = (await latest('TERMS_CONDITIONS'))!;
  const privacyVersion = (await latest('PRIVACY_POLICY'))!;
  return { termsVersion, privacyVersion };
}

/** Builds the legal-acceptance payload required by /auth/register and /auth/google Phase 2. */
export function legalAcceptancePayload(
  versions: LegalVersions,
  overrides: Partial<{
    termsAccepted: boolean;
    privacyAccepted: boolean;
    termsVersion: number;
    privacyVersion: number;
    platform: 'ios' | 'android' | 'web';
  }> = {},
) {
  return {
    termsAccepted: true,
    privacyAccepted: true,
    termsVersion: versions.termsVersion,
    privacyVersion: versions.privacyVersion,
    platform: 'android' as const,
    ...overrides,
  };
}