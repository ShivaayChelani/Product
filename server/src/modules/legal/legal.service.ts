import { LegalDocumentType, LegalVersionStatus, AuditAction, Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { ApiError } from '../../shared/utils/ApiError';
import { auditService } from '../audit/audit.service';
import { LEGAL_DOCUMENT_TYPES } from './legal.validation';
import type { CreateDocumentInput, CreateVersionInput, UpdateVersionInput } from './legal.validation';

const DEFAULT_LOCALE = 'en';

const versionAttribution = {
  createdBy: { select: { id: true, name: true, email: true } },
  publishedBy: { select: { id: true, name: true, email: true } },
};

/** Ensures a LegalDocument shell exists for every known type/locale — idempotent. */
async function ensureDocument(type: LegalDocumentType, locale = DEFAULT_LOCALE) {
  return prisma.legalDocument.upsert({
    where: { type_locale: { type, locale } },
    update: {},
    create: { type, locale },
  });
}

async function ensureAllDocuments(locale = DEFAULT_LOCALE) {
  await Promise.all(
    LEGAL_DOCUMENT_TYPES.map((type) => ensureDocument(type as LegalDocumentType, locale)),
  );
}

async function nextVersionNumber(documentId: string): Promise<number> {
  const latest = await prisma.legalDocumentVersion.findFirst({
    where: { documentId },
    orderBy: { versionNumber: 'desc' },
    select: { versionNumber: true },
  });
  return (latest?.versionNumber ?? 0) + 1;
}

export const legalService = {
  /** Public: latest published version for a document type. 404 if none has ever been published. */
  async getPublished(type: LegalDocumentType, locale = DEFAULT_LOCALE) {
    const document = await prisma.legalDocument.findUnique({
      where: { type_locale: { type, locale } },
    });
    if (!document) {
      throw new ApiError(404, `No ${type} document found for locale "${locale}".`);
    }

    const version = await prisma.legalDocumentVersion.findFirst({
      where: { documentId: document.id, status: LegalVersionStatus.PUBLISHED },
      orderBy: { versionNumber: 'desc' },
    });
    if (!version) {
      throw new ApiError(404, `No published version available for ${type} yet.`);
    }

    return {
      type,
      locale,
      versionNumber: version.versionNumber,
      title: version.title,
      content: version.content,
      format: version.format,
      effectiveDate: version.effectiveDate,
      publishedAt: version.publishedAt,
      updatedAt: version.updatedAt,
    };
  },

  /** Public: lightweight summary of every document type — powers a "Legal" hub screen. */
  async listPublishedTypes(locale = DEFAULT_LOCALE) {
    await ensureAllDocuments(locale);

    const documents = await prisma.legalDocument.findMany({
      where: { locale },
      include: {
        versions: {
          where: { status: LegalVersionStatus.PUBLISHED },
          orderBy: { versionNumber: 'desc' },
          take: 1,
        },
      },
    });

    return documents.map((doc) => {
      const published = doc.versions[0];
      return {
        type: doc.type,
        locale: doc.locale,
        available: !!published,
        title: published?.title ?? null,
        versionNumber: published?.versionNumber ?? null,
        effectiveDate: published?.effectiveDate ?? null,
        publishedAt: published?.publishedAt ?? null,
      };
    });
  },

  // ── Admin ──

  async listDocuments(locale = DEFAULT_LOCALE) {
    await ensureAllDocuments(locale);

    const documents = await prisma.legalDocument.findMany({
      where: { locale },
      orderBy: { type: 'asc' },
      include: {
        versions: {
          where: { status: { in: [LegalVersionStatus.PUBLISHED, LegalVersionStatus.DRAFT] } },
          orderBy: { versionNumber: 'desc' },
        },
      },
    });

    return documents.map((doc) => {
      const published = doc.versions.find((v) => v.status === LegalVersionStatus.PUBLISHED);
      const draft = doc.versions.find((v) => v.status === LegalVersionStatus.DRAFT);
      return {
        id: doc.id,
        type: doc.type,
        locale: doc.locale,
        publishedVersion: published
          ? { id: published.id, versionNumber: published.versionNumber, title: published.title, publishedAt: published.publishedAt, effectiveDate: published.effectiveDate }
          : null,
        draftVersion: draft
          ? { id: draft.id, versionNumber: draft.versionNumber, title: draft.title, updatedAt: draft.updatedAt }
          : null,
      };
    });
  },

  async createDocument(input: CreateDocumentInput) {
    return ensureDocument(input.type as LegalDocumentType, input.locale);
  },

  async getDocumentWithVersions(documentId: string) {
    const document = await prisma.legalDocument.findUnique({
      where: { id: documentId },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          include: versionAttribution,
        },
      },
    });
    if (!document) throw new ApiError(404, 'Legal document not found.');
    return document;
  },

  async listVersions(documentId: string) {
    const document = await prisma.legalDocument.findUnique({ where: { id: documentId } });
    if (!document) throw new ApiError(404, 'Legal document not found.');

    return prisma.legalDocumentVersion.findMany({
      where: { documentId },
      orderBy: { versionNumber: 'desc' },
      include: versionAttribution,
    });
  },

  async getVersion(versionId: string) {
    const version = await prisma.legalDocumentVersion.findUnique({
      where: { id: versionId },
      include: { ...versionAttribution, document: true },
    });
    if (!version) throw new ApiError(404, 'Version not found.');
    return version;
  },

  async createVersion(documentId: string, adminId: string, input: CreateVersionInput) {
    const document = await prisma.legalDocument.findUnique({ where: { id: documentId } });
    if (!document) throw new ApiError(404, 'Legal document not found.');

    const versionNumber = await nextVersionNumber(documentId);
    const version = await prisma.legalDocumentVersion.create({
      data: {
        documentId,
        versionNumber,
        title: input.title,
        content: input.content,
        format: input.format,
        effectiveDate: input.effectiveDate ? new Date(input.effectiveDate) : null,
        changeSummary: input.changeSummary ?? null,
        status: LegalVersionStatus.DRAFT,
        createdById: adminId,
      },
      include: versionAttribution,
    });

    await auditService.log(
      AuditAction.LEGAL_VERSION_CREATED,
      'LegalDocumentVersion',
      version.id,
      adminId,
      null,
      null,
      { type: document.type, locale: document.locale, versionNumber: version.versionNumber },
    );

    return version;
  },

  async updateDraftVersion(versionId: string, input: UpdateVersionInput) {
    const version = await prisma.legalDocumentVersion.findUnique({ where: { id: versionId } });
    if (!version) throw new ApiError(404, 'Version not found.');
    if (version.status !== LegalVersionStatus.DRAFT) {
      throw new ApiError(400, 'Only draft versions can be edited. Publish a new version instead of editing published/archived history.');
    }

    const data: Prisma.LegalDocumentVersionUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.content !== undefined) data.content = input.content;
    if (input.format !== undefined) data.format = input.format;
    if (input.effectiveDate !== undefined) data.effectiveDate = input.effectiveDate ? new Date(input.effectiveDate) : null;
    if (input.changeSummary !== undefined) data.changeSummary = input.changeSummary ?? null;

    return prisma.legalDocumentVersion.update({
      where: { id: versionId },
      data,
      include: versionAttribution,
    });
  },

  async publishVersion(versionId: string, adminId: string) {
    const version = await prisma.legalDocumentVersion.findUnique({
      where: { id: versionId },
      include: { document: true },
    });
    if (!version) throw new ApiError(404, 'Version not found.');
    if (version.status === LegalVersionStatus.PUBLISHED) {
      throw new ApiError(400, 'This version is already published.');
    }
    if (version.status === LegalVersionStatus.ARCHIVED) {
      throw new ApiError(400, 'Archived versions cannot be republished directly — use rollback to create a new version from this content.');
    }

    const published = await prisma.$transaction(async (tx) => {
      await tx.legalDocumentVersion.updateMany({
        where: { documentId: version.documentId, status: LegalVersionStatus.PUBLISHED },
        data: { status: LegalVersionStatus.ARCHIVED, archivedAt: new Date() },
      });

      return tx.legalDocumentVersion.update({
        where: { id: versionId },
        data: { status: LegalVersionStatus.PUBLISHED, publishedAt: new Date(), publishedById: adminId },
        include: versionAttribution,
      });
    });

    await auditService.log(
      AuditAction.LEGAL_VERSION_PUBLISHED,
      'LegalDocumentVersion',
      version.id,
      adminId,
      null,
      null,
      { type: version.document.type, locale: version.document.locale, versionNumber: version.versionNumber },
    );

    return published;
  },

  async archiveVersion(versionId: string, adminId: string) {
    const version = await prisma.legalDocumentVersion.findUnique({
      where: { id: versionId },
      include: { document: true },
    });
    if (!version) throw new ApiError(404, 'Version not found.');
    if (version.status === LegalVersionStatus.ARCHIVED) {
      throw new ApiError(400, 'This version is already archived.');
    }

    const archived = await prisma.legalDocumentVersion.update({
      where: { id: versionId },
      data: { status: LegalVersionStatus.ARCHIVED, archivedAt: new Date() },
      include: versionAttribution,
    });

    await auditService.log(
      AuditAction.LEGAL_VERSION_ARCHIVED,
      'LegalDocumentVersion',
      version.id,
      adminId,
      null,
      null,
      { type: version.document.type, locale: version.document.locale, versionNumber: version.versionNumber },
    );

    return archived;
  },

  async rollbackToVersion(versionId: string, adminId: string, publish: boolean) {
    const source = await prisma.legalDocumentVersion.findUnique({
      where: { id: versionId },
      include: { document: true },
    });
    if (!source) throw new ApiError(404, 'Version not found.');

    const versionNumber = await nextVersionNumber(source.documentId);

    const clone = await prisma.$transaction(async (tx) => {
      const created = await tx.legalDocumentVersion.create({
        data: {
          documentId: source.documentId,
          versionNumber,
          title: source.title,
          content: source.content,
          format: source.format,
          effectiveDate: source.effectiveDate,
          changeSummary: `Rolled back from version ${source.versionNumber}`,
          status: LegalVersionStatus.DRAFT,
          createdById: adminId,
        },
      });

      if (!publish) return created;

      await tx.legalDocumentVersion.updateMany({
        where: { documentId: source.documentId, status: LegalVersionStatus.PUBLISHED },
        data: { status: LegalVersionStatus.ARCHIVED, archivedAt: new Date() },
      });

      return tx.legalDocumentVersion.update({
        where: { id: created.id },
        data: { status: LegalVersionStatus.PUBLISHED, publishedAt: new Date(), publishedById: adminId },
        include: versionAttribution,
      });
    });

    await auditService.log(
      AuditAction.LEGAL_VERSION_ROLLED_BACK,
      'LegalDocumentVersion',
      clone.id,
      adminId,
      null,
      { fromVersionNumber: source.versionNumber },
      { type: source.document.type, locale: source.document.locale, toVersionNumber: clone.versionNumber, published: publish },
    );

    return clone;
  },
};
