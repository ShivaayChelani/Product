import { Reel, ReelComment } from '../types';

import { DEV_FLAGS } from '../config/devFlags';
import { socialApi, uploadApi } from './api';
import { API_CONFIG } from '../config/api';
import { CREATOR_DAILY_REEL_POINTS } from '../utils/reelRewardPoints';

const apiOrigin = API_CONFIG.baseUrl.replace(/\/api\/v1\/?$/, '');





export function getReelThumbnail(reel?: Partial<Reel> | null, _index = 0): string {
  if (reel?.thumbnail && reel.thumbnail.trim().length > 0) {
    if (reel.thumbnail.startsWith('/')) {
      return `${apiOrigin}${reel.thumbnail}`;
    }
    return reel.thumbnail;
  }
  if ((reel as any)?.place?.imageUrl) {
    return (reel as any).place.imageUrl;
  }
  return '';
}

export function mapReelUrls(reel: Reel, index = 0): Reel {
  if (!reel) return reel;
  let mappedVideo = reel.videoUrl && reel.videoUrl.startsWith('/')
    ? `${apiOrigin}${reel.videoUrl}`
    : reel.videoUrl;
    
  if (mappedVideo?.includes('res.cloudinary.com')) {
    mappedVideo = mappedVideo.replace('http://', 'https://');
    if (mappedVideo.includes('/upload/') && !mappedVideo.includes('/q_')) {
      mappedVideo = mappedVideo.replace('/upload/', '/upload/q_auto,vc_h264/');
    }
  }

  let mappedThumb = getReelThumbnail(reel, index);
  if (mappedThumb?.startsWith('http://res.cloudinary.com')) {
    mappedThumb = mappedThumb.replace('http://', 'https://');
  }

  return {
    ...reel,
    videoUrl: mappedVideo || '',
    thumbnail: mappedThumb,
  };
}

function applyVideoFallback(reel: Reel, index: number): Reel {
  return mapReelUrls(reel, index);
}

export interface ReelUploadData {
  videoUri: string;
  caption: string;
  spotId: string;
  spotName: string;
  tags: string[];
  userId: string;
  userName: string;
  vendorId?: string;
  eventId?: string;
}

const localCreatorRewardDates = new Set<string>();

function getLocalRewardDate(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export interface PaginatedResult<T> {
  items: T[];
  lastDoc: any;
  hasMore: boolean;
}

function createLocalReel(data: ReelUploadData): Reel {
  const rewardDate = getLocalRewardDate();
  const rewardKey = `${data.userId}:${rewardDate}`;
  const rewardPoints = localCreatorRewardDates.has(rewardKey) ? 0 : CREATOR_DAILY_REEL_POINTS;
  if (rewardPoints > 0) {
    localCreatorRewardDates.add(rewardKey);
  }

  return {
    id: `reel_${Date.now()}`,
    creatorId: `creator_${data.userId}`,
    videoUrl: data.videoUri,
    thumbnail: null,
    title: data.caption.slice(0, 30),
    description: data.caption,
    likes: 0,
    views: 0,
    shares: 0,
    saves: 0,
    featured: false,
    rewardPoints,
    dailyRewardClaimed: rewardPoints > 0,
    dailyRewardDate: rewardDate,
    placeId: data.spotId || null,
    vendorId: data.vendorId || null,
    eventId: data.eventId || null,
    createdAt: new Date().toISOString(),
    creator: {
      id: `creator_${data.userId}`,
      username: data.userName,
      avatar: null,
      verified: false,
      userId: data.userId,
    },
  };
}

let localReelsCache: Reel[] | null = null;

function getLocalReels(): Reel[] {
  if (!localReelsCache) {
    localReelsCache = [];
  }
  return localReelsCache;
}

export async function uploadReelVideo(
  videoUri: string,
  onProgress?: (progress: number) => void,
  mime?: string | null,
  fileName?: string | null,
): Promise<string> {
  if (DEV_FLAGS.USE_SERVER_API) {
    onProgress?.(10);
    const result = await uploadApi.uploadVideo(videoUri, onProgress, mime, fileName);
    onProgress?.(100);
    if (!result?.url || !(result.url.startsWith('http://') || result.url.startsWith('https://'))) {
      throw new Error('Video upload did not return a playable URL. Please try again.');
    }
    return result.url;
  }
  return videoUri;
}

export async function createReel(data: ReelUploadData, onProgress?: (p: number) => void): Promise<Reel> {
  if (DEV_FLAGS.USE_SERVER_API) {
    onProgress?.(5);
    const videoUrl = await uploadReelVideo(data.videoUri, (p) => onProgress?.(Math.round(p * 0.85)));
    onProgress?.(90);

    // Approved vendors post to VendorReel API; creators use social Reel API.
    if (data.vendorId) {
      const { vendorsApi } = require('./api');
      const vendorReel = await vendorsApi.createVendorReel({
        videoUrl,
        title: data.caption?.slice(0, 200) || undefined,
        description: data.caption || undefined,
      });
      onProgress?.(100);
      return mapReelUrls({
        id: vendorReel.id,
        creatorId: data.vendorId,
        videoUrl: vendorReel.videoUrl,
        thumbnail: vendorReel.thumbnail || null,
        title: vendorReel.title || null,
        description: vendorReel.description || null,
        likes: vendorReel.likes || 0,
        views: vendorReel.views || 0,
        shares: 0,
        saves: 0,
        featured: false,
        eventId: null,
        rewardPoints: 0,
        createdAt: vendorReel.createdAt || new Date().toISOString(),
        tags: data.tags || [],
        placeId: data.spotId || undefined,
        vendorId: data.vendorId,
        creator: {
          id: data.vendorId,
          username: data.userName,
          fullName: data.userName,
          avatar: null,
          verified: true,
          userId: data.userId,
        },
      } as Reel);
    }

    const res = await socialApi.createReel({
      videoUrl,
      title: data.caption?.slice(0, 200) || undefined,
      description: data.caption,
      placeId: data.spotId || undefined,
      vendorId: data.vendorId || undefined,
      eventId: data.eventId || undefined,
    });
    onProgress?.(100);
    return mapReelUrls(res.data);
  }
  const newReel = createLocalReel({ ...data });
  const localReels = getLocalReels();
  localReels.unshift({ ...newReel });
  return newReel;
}

export async function getReelsFeed(
  lastDoc?: any,
  pageSize: number = 5,
  category?: string,
  coords?: { latitude: number; longitude: number }
): Promise<PaginatedResult<Reel>> {
  if (DEV_FLAGS.USE_SERVER_API) {
    try {
      const page = typeof lastDoc === 'number' ? Math.floor(lastDoc / pageSize) + 1 : 1;
      const res = await socialApi.getReelsFeed({
        page,
        limit: pageSize,
        category,
        lat: coords?.latitude,
        lng: coords?.longitude,
        radius: 100,
      });
      const items = (res.data || [])
        .map(applyVideoFallback)
        .filter((r): r is Reel => !!r?.id);
      return {
        items,
        lastDoc: page * pageSize,
        hasMore: items.length === pageSize,
      };
    } catch {
      // API unavailable — fall through to local sample reels silently
    }
  }
  const localReels = getLocalReels();
  let filtered = localReels;
  if (category === 'BUSINESS') {
    filtered = localReels.filter(r => !!r.vendorId);
  } else if (category === 'TRAVEL') {
    filtered = localReels.filter(r => !r.vendorId);
  } else if (category === 'Following') {
    // Local mode has no follow graph — show creator reels only
    filtered = localReels.filter(r => !r.vendorId);
  }
  const startIndex = lastDoc || 0;
  const items = filtered.slice(startIndex, startIndex + pageSize);
  return {
    items: items.map(applyVideoFallback),
    lastDoc: startIndex + pageSize,
    hasMore: startIndex + pageSize < filtered.length,
  };
}

export async function getReelById(reelId: string): Promise<Reel | null> {
  if (DEV_FLAGS.USE_SERVER_API) {
    const res = await socialApi.getReelById(reelId);
    return res.data ? applyVideoFallback(res.data, 0) : null;
  }
  const local = getLocalReels().find(r => r.id === reelId);
  return local ? { ...local, videoUrl: local.videoUrl || '' } : null;
}

export async function likeReel(reelId: string, _userId: string): Promise<void> {
  if (DEV_FLAGS.USE_SERVER_API) {
    await socialApi.likeReel(reelId);
    return;
  }
  const localReels = getLocalReels();
  const reel = localReels.find(r => r.id === reelId);
  if (reel) {
    reel.likes += 1;
  }
}

export async function unlikeReel(reelId: string, _userId: string): Promise<void> {
  if (DEV_FLAGS.USE_SERVER_API) {
    await socialApi.unlikeReel(reelId);
    return;
  }
  const localReels = getLocalReels();
  const reel = localReels.find(r => r.id === reelId);
  if (reel) {
    reel.likes = Math.max(0, reel.likes - 1);
  }
}

export async function addCommentToReel(
  reelId: string,
  comment: { userId: string; userName: string; text: string },
): Promise<ReelComment> {
  if (DEV_FLAGS.USE_SERVER_API) {
    const res = await socialApi.addComment(reelId, comment.text);
    return res.data;
  }
  const newComment: ReelComment = {
    id: `cmt_${Date.now()}`,
    reelId,
    userId: comment.userId,
    text: comment.text,
    createdAt: new Date().toISOString(),
    user: {
      id: comment.userId,
      name: comment.userName,
    },
  };

  const localReels = getLocalReels();
  const _reel = localReels.find(r => r.id === reelId);
  return newComment;
}

export async function getComments(
  reelId: string,
  lastDoc?: any,
  _pageSize: number = 20,
): Promise<PaginatedResult<ReelComment>> {
  if (DEV_FLAGS.USE_SERVER_API) {
    const res = await socialApi.getComments(reelId);
    const items = res.data || [];
    return {
      items,
      lastDoc: items.length,
      hasMore: false,
    };
  }
  return {
    items: [],
    lastDoc: 0,
    hasMore: false,
  };
}

export async function incrementReelViews(reelId: string): Promise<void> {
  if (DEV_FLAGS.USE_SERVER_API) {
    await socialApi.incrementViews(reelId);
    return;
  }
  const localReels = getLocalReels();
  const reel = localReels.find(r => r.id === reelId);
  if (reel) reel.views += 1;
}

const viewedReelIdsThisSession = new Set<string>();

/** Record one real view per reel per app session. Returns true if a view was sent. */
export async function trackReelView(reelId: string): Promise<boolean> {
  if (!reelId || viewedReelIdsThisSession.has(reelId)) return false;
  viewedReelIdsThisSession.add(reelId);
  try {
    await incrementReelViews(reelId);
    return true;
  } catch {
    viewedReelIdsThisSession.delete(reelId);
    return false;
  }
}

export async function incrementReelShares(reelId: string): Promise<void> {
  if (!reelId) return;
  if (DEV_FLAGS.USE_SERVER_API) {
    await socialApi.incrementShares(reelId);
    return;
  }
  const localReels = getLocalReels();
  const reel = localReels.find(r => r.id === reelId);
  if (reel) reel.shares += 1;
}

