import { apiClient } from './client';

export type LegalDocumentType =
  | 'PRIVACY_POLICY'
  | 'TERMS_CONDITIONS'
  | 'REWARDS_POLICY'
  | 'COMMUNITY_GUIDELINES'
  | 'VENDOR_TERMS'
  | 'CREATOR_TERMS'
  | 'REFUND_POLICY'
  | 'ABOUT_US'
  | 'CONTACT_INFO'
  | 'FAQ';

export type LegalContentFormat = 'MARKDOWN' | 'HTML' | 'PLAIN';

export interface LegalDocumentPayload {
  type: LegalDocumentType;
  locale: string;
  versionNumber: number;
  title: string;
  content: string;
  format: LegalContentFormat;
  effectiveDate: string | null;
  publishedAt: string | null;
  updatedAt: string;
}

export interface LegalTypeSummary {
  type: LegalDocumentType;
  locale: string;
  available: boolean;
  title: string | null;
  versionNumber: number | null;
  effectiveDate: string | null;
  publishedAt: string | null;
}

export interface LegalCurrentVersions {
  termsVersion: number;
  privacyVersion: number;
}

export const legalApi = {
  async getDocument(type: LegalDocumentType, locale = 'en') {
    return apiClient.get<LegalDocumentPayload>(`/legal/${type}?locale=${locale}`);
  },

  async listTypes(locale = 'en') {
    return apiClient.get<LegalTypeSummary[]>(`/legal/types?locale=${locale}`);
  },

  /**
   * Returns the current published version numbers for TERMS_CONDITIONS and PRIVACY_POLICY.
   * Used by the signup flow to embed the correct version numbers in the acceptance payload.
   * These are validated server-side at registration time.
   */
  async getCurrentVersions(locale = 'en') {
    return apiClient.get<LegalCurrentVersions>(`/legal/current-versions?locale=${locale}`);
  },
};
