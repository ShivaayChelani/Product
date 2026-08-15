import type { LegalDocumentType } from "@/services/legal";

export interface LegalTypeMeta {
  type: LegalDocumentType;
  slug: string;
  label: string;
  description: string;
  group: "Legal & Policies" | "For Vendors & Creators" | "Company";
}

export const LEGAL_TYPE_META: LegalTypeMeta[] = [
  { type: "PRIVACY_POLICY", slug: "privacy-policy", label: "Privacy Policy", description: "Data collection, storage, and third-party sharing disclosures.", group: "Legal & Policies" },
  { type: "TERMS_CONDITIONS", slug: "terms-conditions", label: "Terms & Conditions", description: "Platform-wide rules, eligibility, and user responsibilities.", group: "Legal & Policies" },
  { type: "REWARDS_POLICY", slug: "rewards-policy", label: "Rewards Policy", description: "PalPoints, redemptions, and reward program disclaimers.", group: "Legal & Policies" },
  { type: "COMMUNITY_GUIDELINES", slug: "community-guidelines", label: "Community Guidelines", description: "Content standards for reviews, reels, and hidden gem submissions.", group: "Legal & Policies" },
  { type: "REFUND_POLICY", slug: "refund-policy", label: "Refund Policy", description: "Refund and cancellation rules for paid offers and subscriptions.", group: "Legal & Policies" },
  { type: "VENDOR_TERMS", slug: "vendor-terms", label: "Vendor Terms", description: "Obligations and terms specific to Vendor accounts.", group: "For Vendors & Creators" },
  { type: "CREATOR_TERMS", slug: "creator-terms", label: "Creator Terms", description: "Obligations and terms specific to Content Creator accounts.", group: "For Vendors & Creators" },
  { type: "FAQ", slug: "faq", label: "FAQ", description: "Frequently asked questions shown in the Help Center.", group: "Company" },
  { type: "ABOUT_US", slug: "about-us", label: "About Us", description: "Company story shown on the About screen.", group: "Company" },
  { type: "CONTACT_INFO", slug: "contact-info", label: "Contact Information", description: "Support email, phone, and address shown to users.", group: "Company" },
];

export function getLegalMetaBySlug(slug: string): LegalTypeMeta | undefined {
  return LEGAL_TYPE_META.find((m) => m.slug === slug);
}

export function getLegalMetaByType(type: LegalDocumentType): LegalTypeMeta | undefined {
  return LEGAL_TYPE_META.find((m) => m.type === type);
}
