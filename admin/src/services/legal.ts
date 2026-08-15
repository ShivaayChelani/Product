import client from "./client";

export type LegalDocumentType =
  | "PRIVACY_POLICY"
  | "TERMS_CONDITIONS"
  | "REWARDS_POLICY"
  | "COMMUNITY_GUIDELINES"
  | "VENDOR_TERMS"
  | "CREATOR_TERMS"
  | "REFUND_POLICY"
  | "ABOUT_US"
  | "CONTACT_INFO"
  | "FAQ";

export type LegalVersionStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type LegalContentFormat = "MARKDOWN" | "HTML" | "PLAIN";

export interface LegalVersionSummary {
  id: string;
  versionNumber: number;
  title: string;
  status: LegalVersionStatus;
  effectiveDate: string | null;
  publishedAt: string | null;
  archivedAt: string | null;
  changeSummary: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: { id: string; name: string; email: string } | null;
  publishedBy?: { id: string; name: string; email: string } | null;
}

export interface LegalVersionDetail extends LegalVersionSummary {
  content: string;
  format: LegalContentFormat;
  documentId: string;
}

export interface LegalDocumentSummary {
  id: string;
  type: LegalDocumentType;
  locale: string;
  publishedVersion: { id: string; versionNumber: number; title: string; publishedAt: string | null; effectiveDate: string | null } | null;
  draftVersion: { id: string; versionNumber: number; title: string; updatedAt: string } | null;
}

export interface LegalDocumentDetail {
  id: string;
  type: LegalDocumentType;
  locale: string;
  versions: LegalVersionDetail[];
}

export async function listLegalDocuments(locale = "en"): Promise<LegalDocumentSummary[]> {
  const res = await client.get("/admin/legal/documents", { params: { locale } });
  return res.data.data;
}

export async function ensureLegalDocument(type: LegalDocumentType, locale = "en") {
  const res = await client.post("/admin/legal/documents", { type, locale });
  return res.data.data;
}

export async function getLegalDocument(documentId: string): Promise<LegalDocumentDetail> {
  const res = await client.get(`/admin/legal/documents/${documentId}`);
  return res.data.data;
}

export async function listLegalVersions(documentId: string): Promise<LegalVersionDetail[]> {
  const res = await client.get(`/admin/legal/documents/${documentId}/versions`);
  return res.data.data;
}

export async function createLegalVersion(documentId: string, data: {
  title: string;
  content: string;
  format?: LegalContentFormat;
  effectiveDate?: string | null;
  changeSummary?: string | null;
}): Promise<LegalVersionDetail> {
  const res = await client.post(`/admin/legal/documents/${documentId}/versions`, data);
  return res.data.data;
}

export async function getLegalVersion(versionId: string): Promise<LegalVersionDetail> {
  const res = await client.get(`/admin/legal/versions/${versionId}`);
  return res.data.data;
}

export async function updateLegalVersion(versionId: string, data: Partial<{
  title: string;
  content: string;
  format: LegalContentFormat;
  effectiveDate: string | null;
  changeSummary: string | null;
}>): Promise<LegalVersionDetail> {
  const res = await client.patch(`/admin/legal/versions/${versionId}`, data);
  return res.data.data;
}

export async function publishLegalVersion(versionId: string): Promise<LegalVersionDetail> {
  const res = await client.post(`/admin/legal/versions/${versionId}/publish`);
  return res.data.data;
}

export async function archiveLegalVersion(versionId: string): Promise<LegalVersionDetail> {
  const res = await client.post(`/admin/legal/versions/${versionId}/archive`);
  return res.data.data;
}

export async function rollbackLegalVersion(versionId: string, publish = true): Promise<LegalVersionDetail> {
  const res = await client.post(`/admin/legal/versions/${versionId}/rollback`, { publish });
  return res.data.data;
}
