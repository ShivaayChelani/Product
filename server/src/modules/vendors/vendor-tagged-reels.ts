import { ReelStatus, VendorListingStatus } from '@prisma/client';
import { prisma } from '../../config/database';
import { ApiError } from '../../shared/utils/ApiError';
import { notificationService } from '../notifications/notification.service';

export { isTaggedReelPublicOnVendorCard } from './vendor-tagged-reel-visibility';

export type TaggedReelReviewAction = 'allow' | 'reject';

export type TaggedCreatorReelDto = {
  id: string;
  videoUrl: string;
  thumbnail: string | null;
  title: string | null;
  description: string | null;
  vendorListingStatus: VendorListingStatus;
  createdAt: Date;
  creator: {
    id: string;
    username: string;
    avatar: string | null;
  };
};

const taggedReelInclude = {
  creator: {
    select: { id: true, username: true, avatar: true, userId: true, fullName: true },
  },
} as const;

export function serializeTaggedCreatorReel(row: {
  id: string;
  videoUrl: string;
  thumbnail: string | null;
  title: string | null;
  description: string | null;
  vendorListingStatus: VendorListingStatus | null;
  createdAt: Date;
  creator: { id: string; username: string; avatar: string | null };
}): TaggedCreatorReelDto {
  return {
    id: row.id,
    videoUrl: row.videoUrl,
    thumbnail: row.thumbnail,
    title: row.title,
    description: row.description,
    vendorListingStatus: row.vendorListingStatus ?? VendorListingStatus.PENDING,
    createdAt: row.createdAt,
    creator: {
      id: row.creator.id,
      username: row.creator.username,
      avatar: row.creator.avatar,
    },
  };
}

export async function listPublicTaggedCreatorReels(vendorId: string): Promise<TaggedCreatorReelDto[]> {
  const rows = await prisma.reel.findMany({
    where: {
      vendorId,
      status: ReelStatus.APPROVED,
      vendorListingStatus: VendorListingStatus.APPROVED,
    },
    include: taggedReelInclude,
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return rows.map(serializeTaggedCreatorReel);
}

export async function listPendingTaggedCreatorReels(vendorId: string): Promise<TaggedCreatorReelDto[]> {
  const rows = await prisma.reel.findMany({
    where: {
      vendorId,
      status: ReelStatus.APPROVED,
      vendorListingStatus: VendorListingStatus.PENDING,
      isCollaboration: false,
    },
    include: taggedReelInclude,
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return rows.map(serializeTaggedCreatorReel);
}

export async function listTaggedCreatorReelsForViewer(
  vendorId: string,
  viewerUserId?: string,
): Promise<{ reels: TaggedCreatorReelDto[]; pending: TaggedCreatorReelDto[]; isOwner: boolean }> {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: { id: true, userId: true },
  });
  if (!vendor) throw new ApiError(404, 'Vendor not found');

  const isOwner = Boolean(viewerUserId && vendor.userId === viewerUserId);
  const [reels, pending] = await Promise.all([
    listPublicTaggedCreatorReels(vendorId),
    isOwner ? listPendingTaggedCreatorReels(vendorId) : Promise.resolve([]),
  ]);
  return { reels, pending, isOwner };
}

export async function notifyVendorOfTaggedReel(input: {
  vendorId: string;
  reelId: string;
  thumbnail?: string | null;
  creatorUserId: string;
  creatorName: string;
}): Promise<void> {
  const vendor = await prisma.vendor.findUnique({
    where: { id: input.vendorId },
    select: { id: true, userId: true, businessName: true, status: true },
  });
  if (!vendor || vendor.status !== 'APPROVED') return;
  if (vendor.userId === input.creatorUserId) return;

  await notificationService.sendToUser(
    vendor.userId,
    'A creator tagged your business',
    `${input.creatorName} posted a reel at ${vendor.businessName}. Allow it on your map profile?`,
    {
      type: 'vendor_tagged_reel',
      entityId: vendor.id,
      vendorId: vendor.id,
      reelId: input.reelId,
      screen: 'VendorTabs',
      thumbnailUrl: input.thumbnail || undefined,
    },
    'vendor_tagged_reel',
  );
}

export async function reviewTaggedCreatorReel(
  vendorUserId: string,
  reelId: string,
  action: TaggedReelReviewAction,
): Promise<TaggedCreatorReelDto> {
  const vendor = await prisma.vendor.findUnique({
    where: { userId: vendorUserId },
    select: { id: true, userId: true, businessName: true },
  });
  if (!vendor) throw new ApiError(404, 'Vendor not found');

  const nextStatus =
    action === 'allow' ? VendorListingStatus.APPROVED : VendorListingStatus.REJECTED;

  const marked = await prisma.reel.updateMany({
    where: {
      id: reelId,
      vendorId: vendor.id,
      vendorListingStatus: VendorListingStatus.PENDING,
      isCollaboration: false,
    },
    data: { vendorListingStatus: nextStatus },
  });
  if (marked.count === 0) {
    throw new ApiError(404, 'No pending tagged reel to review.');
  }

  const reel = await prisma.reel.findUniqueOrThrow({
    where: { id: reelId },
    include: taggedReelInclude,
  });

  const creatorUserId = reel.creator.userId;
  if (creatorUserId && creatorUserId !== vendorUserId) {
    if (action === 'allow') {
      await notificationService.sendToUser(
        creatorUserId,
        'Your reel is on the map',
        `${vendor.businessName} allowed your reel on their map profile.`,
        {
          type: 'vendor_tagged_reel_allowed',
          entityId: reel.id,
          reelId: reel.id,
          vendorId: vendor.id,
          screen: 'ReelDetail',
        },
        'vendor_tagged_reel_allowed',
      );
    } else {
      await notificationService.sendToUser(
        creatorUserId,
        'Reel not featured',
        `${vendor.businessName} declined to feature your reel on their map profile.`,
        {
          type: 'vendor_tagged_reel_rejected',
          entityId: reel.id,
          reelId: reel.id,
          vendorId: vendor.id,
          screen: 'ReelDetail',
        },
        'vendor_tagged_reel_rejected',
      );
    }
  }

  return serializeTaggedCreatorReel(reel);
}
