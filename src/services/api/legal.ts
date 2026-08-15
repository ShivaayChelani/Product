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

export const legalApi = {
  async getDocument(type: LegalDocumentType, locale = 'en') {
    return apiClient.get<LegalDocumentPayload>(`/legal/${type}?locale=${locale}`);
  },

  async listTypes(locale = 'en') {
    return apiClient.get<LegalTypeSummary[]>(`/legal/types?locale=${locale}`);
  },
};
