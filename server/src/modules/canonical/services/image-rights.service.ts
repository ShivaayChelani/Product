import { ImageVerificationStatus } from '@prisma/client';

export type ImageRightsInput = {
  url: string;
  license?: string | null;
  licenseUrl?: string | null;
  attribution?: string | null;
  owner?: string | null;
  commercialUse?: boolean | null;
  verificationStatus?: ImageVerificationStatus;
  widthPx?: number | null;
  heightPx?: number | null;
  perceptualHash?: string | null;
};

export type ImageRightsVerdict = { accepted: boolean; reasons: string[] };

const BLOCKED_URL_PATTERNS = [
  /screenshot/i,
  /watermark/i,
  /placeholder/i,
  /unsplash\.com\/photo-/i, // stock placeholders — require explicit license workflow
];

export const imageRightsService = {
  validate(input: ImageRightsInput): ImageRightsVerdict {
    const reasons: string[] = [];

    if (!input.url?.trim()) reasons.push('MISSING_URL');

    for (const re of BLOCKED_URL_PATTERNS) {
      if (re.test(input.url)) {
        reasons.push('SUSPECT_SOURCE_URL');
        break;
      }
    }

    if (input.verificationStatus !== ImageVerificationStatus.LICENSE_VERIFIED) {
      reasons.push('LICENSE_NOT_VERIFIED');
    }

    if (!input.license?.trim()) reasons.push('LICENSE_METADATA_MISSING');

    if (input.widthPx != null && input.widthPx < 640) reasons.push('LOW_RESOLUTION');
    if (input.heightPx != null && input.heightPx < 480) reasons.push('LOW_RESOLUTION');

    return { accepted: reasons.length === 0, reasons };
  },
};
