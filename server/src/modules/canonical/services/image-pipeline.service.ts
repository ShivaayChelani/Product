import { ImageVerificationStatus } from '@prisma/client';
import { prisma } from '../../../config/database';
import { imageRightsService } from './image-rights.service';
import { safeFetchExternalUrl } from '../../../shared/utils/safeFetchUrl';

export type ImagePipelineResult = {
  url: string;
  perceptualHash: string | null;
  widthPx: number | null;
  heightPx: number | null;
  blurScore: number | null;
  watermarkScore: number | null;
  aspectRatioValid: boolean;
  duplicateOfImageId: string | null;
  accepted: boolean;
  reasons: string[];
};

const MIN_WIDTH = 640;
const MIN_HEIGHT = 480;
const MIN_ASPECT = 0.5;
const MAX_ASPECT = 2.5;
const BLUR_THRESHOLD = 80;
const WATERMARK_THRESHOLD = 0.65;
const PHASH_DUPLICATE_MAX_DISTANCE = 8;

function hammingHex(a: string, b: string): number {
  if (a.length !== b.length) return 64;
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    const x = parseInt(a.charAt(i), 16) ^ parseInt(b.charAt(i), 16);
    dist += (x & 1) + ((x >> 1) & 1) + ((x >> 2) & 1) + ((x >> 3) & 1);
  }
  return dist;
}

async function loadSharp() {
  try {
    const mod = await import('sharp');
    return mod.default;
  } catch {
    return null;
  }
}

async function computePerceptualHash(sharp: any, buffer: Buffer): Promise<string> {
  const size = 8;
  const { data } = await sharp(buffer)
    .resize(size, size, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = [...data];
  const avg = pixels.reduce((s, v) => s + v, 0) / pixels.length;
  let bits = '';
  for (const px of pixels) bits += px >= avg ? '1' : '0';
  let hex = '';
  for (let i = 0; i < bits.length; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex;
}

async function laplacianVariance(sharp: any, buffer: Buffer): Promise<number> {
  const { data } = await sharp(buffer)
    .resize(320, 320, { fit: 'inside' })
    .greyscale()
    .convolve({
      width: 3,
      height: 3,
      kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0],
    })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const values = data as Buffer;
  let sum = 0;
  let sumSq = 0;
  const n = values.length;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    sum += v;
    sumSq += v * v;
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

async function cornerWatermarkScore(sharp: any, buffer: Buffer): Promise<number> {
  const meta = await sharp(buffer).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (w < 40 || h < 40) return 0;

  const cropW = Math.max(8, Math.floor(w * 0.12));
  const cropH = Math.max(8, Math.floor(h * 0.12));
  const corners = [
    { left: 0, top: 0 },
    { left: w - cropW, top: 0 },
    { left: 0, top: h - cropH },
    { left: w - cropW, top: h - cropH },
  ];

  let maxEdge = 0;
  for (const c of corners) {
    const { data } = await sharp(buffer)
      .extract({ left: c.left, top: c.top, width: cropW, height: cropH })
      .greyscale()
      .convolve({ width: 3, height: 3, kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1] })
      .raw()
      .toBuffer({ resolveWithObject: true });
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    maxEdge = Math.max(maxEdge, sum / data.length / 255);
  }
  return Math.min(1, maxEdge);
}

export const imagePipelineService = {
  async analyzeUrl(url: string): Promise<ImagePipelineResult> {
    const reasons: string[] = [];
    let widthPx: number | null = null;
    let heightPx: number | null = null;
    let perceptualHash: string | null = null;
    let blurScore: number | null = null;
    let watermarkScore: number | null = null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    let res: Response;
    try {
      res = await safeFetchExternalUrl(url, { signal: controller.signal, timeoutMs: 15000 });
    } catch (err) {
      clearTimeout(timer);
      const message = err instanceof Error ? err.message : 'FETCH_FAILED';
      return {
        url,
        perceptualHash: null,
        widthPx: null,
        heightPx: null,
        blurScore: null,
        watermarkScore: null,
        aspectRatioValid: false,
        duplicateOfImageId: null,
        accepted: false,
        reasons: [message.includes('not allowed') ? 'BLOCKED_URL' : 'FETCH_FAILED'],
      };
    }
    clearTimeout(timer);
    if (!res.ok) {
      return {
        url,
        perceptualHash: null,
        widthPx: null,
        heightPx: null,
        blurScore: null,
        watermarkScore: null,
        aspectRatioValid: false,
        duplicateOfImageId: null,
        accepted: false,
        reasons: [`HTTP_${res.status}`],
      };
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    const sharp = await loadSharp();
    if (sharp) {
      const meta = await sharp(buffer).metadata();
      widthPx = meta.width ?? null;
      heightPx = meta.height ?? null;
      perceptualHash = await computePerceptualHash(sharp, buffer);
      blurScore = await laplacianVariance(sharp, buffer);
      watermarkScore = await cornerWatermarkScore(sharp, buffer);
    } else {
      reasons.push('SHARP_UNAVAILABLE');
    }

    const aspectRatioValid =
      widthPx != null &&
      heightPx != null &&
      widthPx / heightPx >= MIN_ASPECT &&
      widthPx / heightPx <= MAX_ASPECT;

    if (widthPx != null && widthPx < MIN_WIDTH) reasons.push('LOW_WIDTH');
    if (heightPx != null && heightPx < MIN_HEIGHT) reasons.push('LOW_HEIGHT');
    if (!aspectRatioValid && widthPx && heightPx) reasons.push('BAD_ASPECT_RATIO');
    if (blurScore != null && blurScore < BLUR_THRESHOLD) reasons.push('BLURRY');
    if (watermarkScore != null && watermarkScore >= WATERMARK_THRESHOLD) reasons.push('WATERMARK_SUSPECT');

    return {
      url,
      perceptualHash,
      widthPx,
      heightPx,
      blurScore,
      watermarkScore,
      aspectRatioValid: !!aspectRatioValid,
      duplicateOfImageId: null,
      accepted: reasons.length === 0,
      reasons: [...new Set(reasons)],
    };
  },

  async processPlaceImage(imageId: string): Promise<ImagePipelineResult> {
    const img = await prisma.placeImage.findUnique({ where: { id: imageId } });
    if (!img) throw new Error('Image not found');

    const result = await this.analyzeUrl(img.url);

    if (result.perceptualHash) {
      const peers = await prisma.placeImage.findMany({
        where: {
          id: { not: imageId },
          perceptualHash: { not: null },
        },
        select: { id: true, perceptualHash: true },
        take: 500,
      });
      for (const peer of peers) {
        if (!peer.perceptualHash) continue;
        if (hammingHex(result.perceptualHash, peer.perceptualHash) <= PHASH_DUPLICATE_MAX_DISTANCE) {
          result.duplicateOfImageId = peer.id;
          result.reasons.push('DUPLICATE_IMAGE');
          result.accepted = false;
          break;
        }
      }
    }

    const qualityScore =
      result.blurScore != null
        ? Math.min(100, Math.max(0, (result.blurScore / 200) * 100))
        : null;

    await prisma.placeImage.update({
      where: { id: imageId },
      data: {
        perceptualHash: result.perceptualHash,
        widthPx: result.widthPx,
        heightPx: result.heightPx,
        qualityScore,
        verificationStatus: result.accepted
          ? ImageVerificationStatus.UNVERIFIED
          : ImageVerificationStatus.REJECTED,
      },
    });

    await prisma.placeQualityCheck.create({
      data: {
        placeId: img.placeId,
        checkCode: 'IMAGE_PIPELINE',
        passed: result.accepted,
        details: {
          imageId,
          ...result,
        },
      },
    });

    return result;
  },

  async verifyLicense(imageId: string, verifiedById: string, licenseMeta: {
    license: string;
    licenseUrl?: string;
    attribution?: string;
    owner?: string;
    commercialUse?: boolean;
  }) {
    const verdict = imageRightsService.validate({
      url: 'https://placeholder',
      license: licenseMeta.license,
      licenseUrl: licenseMeta.licenseUrl,
      attribution: licenseMeta.attribution,
      owner: licenseMeta.owner,
      commercialUse: licenseMeta.commercialUse,
      verificationStatus: ImageVerificationStatus.LICENSE_VERIFIED,
    });

    const updated = await prisma.placeImage.update({
      where: { id: imageId },
      data: {
        license: licenseMeta.license,
        licenseUrl: licenseMeta.licenseUrl,
        attribution: licenseMeta.attribution,
        owner: licenseMeta.owner,
        commercialUse: licenseMeta.commercialUse,
        verificationStatus: verdict.accepted
          ? ImageVerificationStatus.LICENSE_VERIFIED
          : ImageVerificationStatus.UNVERIFIED,
      },
    });

    await prisma.placeQualityCheck.create({
      data: {
        placeId: updated.placeId,
        checkCode: 'IMAGE_LICENSE',
        passed: verdict.accepted,
        details: { imageId, verifiedById, reasons: verdict.reasons },
      },
    });

    return { image: updated, verdict };
  },
};
