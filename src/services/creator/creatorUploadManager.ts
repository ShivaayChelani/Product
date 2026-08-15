import AsyncStorage from '@react-native-async-storage/async-storage';
import { compressVideo } from '../videoCompressor';
import { socialApi, uploadApi, vendorsApi } from '../api';
import { creatorApi } from '../../features/creator/api/creatorApi';
import { mapReelUploadError } from './reelUploadErrors';
import { mapReelUrls } from '../reelService';
import { unwrapReelRewardPoints } from '../../utils/reelRewardPoints';
import { detectReelMediaKind, type ReelMediaKind } from '../reels/reelMediaKind';
import type { Reel } from '../../types';

export type ReelUploadKind = 'CREATOR' | 'VENDOR';

export type ReelUploadStatus =
  | 'QUEUED'
  | 'UPLOADING'
  | 'PROCESSING'
  | 'POSTED'
  | 'FAILED'
  | 'CANCELLED';

export interface ReelUploadJob {
  localUploadId: string;
  reelId?: string;
  status: ReelUploadStatus;
  progress: number;
  videoUri: string;
  videoUrl?: string;
  thumbnail?: string | null;
  caption: string;
  title?: string;
  spotId?: string;
  spotName?: string;
  tags: string[];
  mimeType?: string;
  fileName?: string;
  mediaKind?: ReelMediaKind;
  kind?: ReelUploadKind;
  userId: string;
  userName: string;
  vendorId?: string;
  editReelId?: string;
  publishDraft?: boolean;
  error?: string;
  rewardPoints?: number;
  createdAt: string;
  updatedAt: string;
}

export interface StartReelUploadInput {
  videoUri: string;
  caption: string;
  title?: string;
  spotId?: string;
  spotName?: string;
  tags: string[];
  userId: string;
  userName: string;
  vendorId?: string;
  mimeType?: string;
  fileName?: string;
  mediaKind?: ReelMediaKind;
  kind?: ReelUploadKind;
  editReelId?: string;
  publishDraft?: boolean;
}

type UploadListener = (jobs: ReelUploadJob[]) => void;
type PostedListener = (job: ReelUploadJob, reel: Reel) => void;

const STORAGE_KEY = 'creator_reel_upload_jobs_v1';
const MAX_STORED_JOBS = 20;

let jobs: ReelUploadJob[] = [];
let hydrated = false;
const listeners = new Set<UploadListener>();
const postedListeners = new Set<PostedListener>();
const running = new Map<string, Promise<void>>();

function nowIso(): string {
  return new Date().toISOString();
}

const IN_FLIGHT: ReelUploadStatus[] = ['QUEUED', 'UPLOADING', 'PROCESSING'];
const DEDUPE_POSTED_MS = 5 * 60 * 1000;
/** Brief “Reel posted” flash, then the Uploading Reels card disappears. */
export const AUTO_HIDE_POSTED_MS = 2500;

const hideTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function isUploadJobVisible(job: ReelUploadJob, now = Date.now()): boolean {
  if (job.status === 'CANCELLED') return false;
  if (job.status === 'POSTED') {
    const t = new Date(job.updatedAt).getTime();
    return Number.isFinite(t) && now - t < AUTO_HIDE_POSTED_MS;
  }
  return true;
}

function uploadFingerprint(job: {
  userId: string;
  videoUri: string;
  caption: string;
  kind?: ReelUploadKind;
  vendorId?: string;
  editReelId?: string;
}): string {
  return [
    job.userId,
    job.kind || 'CREATOR',
    job.videoUri,
    job.caption,
    job.vendorId || '',
    job.editReelId || '',
  ].join('\u0000');
}

function findDuplicateUpload(input: StartReelUploadInput): ReelUploadJob | undefined {
  const key = uploadFingerprint(input);
  const now = Date.now();
  return jobs.find((job) => {
    if (uploadFingerprint(job) !== key) return false;
    if (IN_FLIGHT.includes(job.status)) return true;
    if (job.status !== 'POSTED') return false;
    const created = new Date(job.createdAt).getTime();
    return Number.isFinite(created) && now - created < DEDUPE_POSTED_MS;
  });
}

function notify(): void {
  const snapshot = [...jobs];
  listeners.forEach((fn) => fn(snapshot));
}

function remainingPostedHideMs(job: ReelUploadJob, now = Date.now()): number {
  const t = new Date(job.updatedAt).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, AUTO_HIDE_POSTED_MS - (now - t));
}

function scheduleHidePosted(localUploadId: string, delay = AUTO_HIDE_POSTED_MS): void {
  const existing = hideTimers.get(localUploadId);
  if (existing) clearTimeout(existing);
  if (delay <= 0) {
    hideTimers.delete(localUploadId);
    notify();
    return;
  }
  const timer = setTimeout(() => {
    hideTimers.delete(localUploadId);
    const job = jobs.find((j) => j.localUploadId === localUploadId);
    if (job?.status === 'POSTED') notify();
  }, delay);
  hideTimers.set(localUploadId, timer);
}

async function persist(): Promise<void> {
  try {
    const payload = jobs.slice(0, MAX_STORED_JOBS);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Best-effort persistence — upload continues in memory.
  }
}

function updateJob(localUploadId: string, patch: Partial<ReelUploadJob>): ReelUploadJob | undefined {
  const idx = jobs.findIndex((j) => j.localUploadId === localUploadId);
  if (idx === -1) return undefined;
  jobs[idx] = { ...jobs[idx], ...patch, updatedAt: nowIso() };
  notify();
  void persist();
  return jobs[idx];
}

function createLocalUploadId(): string {
  return `reel_upload_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

async function discardUnpublishedMedia(
  publicId: string | undefined,
  mediaKind: ReelMediaKind,
): Promise<void> {
  if (!publicId) return;
  try {
    await uploadApi.deleteMedia(publicId, mediaKind);
  } catch {
    // Best-effort cleanup so failed publishes do not leave Cloudinary assets.
  }
}

function vendorReelAsFeedItem(job: ReelUploadJob, vendorReel: {
  id: string;
  videoUrl: string;
  thumbnail?: string | null;
  title?: string | null;
  description?: string | null;
  likes?: number;
  views?: number;
  createdAt?: string;
}): Reel {
  return mapReelUrls({
    id: vendorReel.id,
    creatorId: job.vendorId || job.userId,
    videoUrl: vendorReel.videoUrl,
    thumbnail: vendorReel.thumbnail || (job.mediaKind === 'image' ? vendorReel.videoUrl : null),
    title: vendorReel.title || job.title || null,
    description: vendorReel.description || job.caption,
    likes: vendorReel.likes || 0,
    views: vendorReel.views || 0,
    shares: 0,
    saves: 0,
    featured: false,
    eventId: null,
    rewardPoints: 0,
    createdAt: vendorReel.createdAt || new Date().toISOString(),
    tags: job.tags || [],
    placeId: job.spotId || undefined,
    vendorId: job.vendorId,
    creator: {
      id: job.vendorId || job.userId,
      username: job.userName,
      fullName: job.userName,
      avatar: null,
      verified: true,
      userId: job.userId,
    },
  } as Reel);
}

async function runUploadJob(localUploadId: string): Promise<void> {
  const job = jobs.find((j) => j.localUploadId === localUploadId);
  if (!job || job.status === 'CANCELLED' || job.status === 'POSTED') return;

  const mediaKind = job.mediaKind || detectReelMediaKind(job.mimeType, job.videoUri, job.fileName);
  let uploadedPublicId: string | undefined;
  let uploadedUrl: string | undefined;

  try {
    updateJob(localUploadId, { status: 'UPLOADING', progress: 5, error: undefined, videoUrl: undefined });

    if (/^https?:\/\//i.test(job.videoUri)) {
      uploadedUrl = job.videoUri;
      updateJob(localUploadId, { progress: 88 });
    } else {
      const localUri = mediaKind === 'video'
        ? (await compressVideo(job.videoUri)).compressedUri
        : job.videoUri;
      const uploaded = mediaKind === 'image'
        ? await uploadApi.uploadImage(localUri, job.mimeType, job.fileName)
        : await uploadApi.uploadVideo(
          localUri,
          (p) => updateJob(localUploadId, { progress: Math.max(5, Math.min(85, Math.round(p * 0.85))) }),
          job.mimeType,
          job.fileName,
        );
      uploadedUrl = uploaded.url;
      uploadedPublicId = uploaded.publicId;
      updateJob(localUploadId, { progress: 88 });
    }

    if (!uploadedUrl) {
      throw new Error('Media upload did not return a playable URL.');
    }

    updateJob(localUploadId, { status: 'PROCESSING', progress: 90 });

    let reel: Reel;
    let rewardPoints = 0;
    if (job.kind === 'VENDOR') {
      const vendorReel = await vendorsApi.createVendorReel({
        videoUrl: uploadedUrl,
        thumbnail: mediaKind === 'image' ? uploadedUrl : undefined,
        title: job.title?.trim() || job.caption.slice(0, 200) || undefined,
        description: job.caption,
      });
      if (!vendorReel?.id) {
        throw new Error('Vendor reel was not created.');
      }
      reel = vendorReelAsFeedItem(job, vendorReel);
    } else if (job.publishDraft && job.editReelId) {
      await socialApi.updateReel(job.editReelId, {
        title: job.caption.slice(0, 200) || undefined,
        description: job.caption,
        placeId: job.spotId || undefined,
        vendorId: job.vendorId || undefined,
      });
      const published = await creatorApi.publishDraft(job.editReelId);
      rewardPoints = unwrapReelRewardPoints(published);
      const res = await socialApi.getReelById(job.editReelId);
      const payload = (res as { data?: Reel })?.data ?? (res as unknown as Reel);
      reel = mapReelUrls({ ...payload, rewardPoints: rewardPoints || unwrapReelRewardPoints(payload) });
      rewardPoints = unwrapReelRewardPoints(reel) || rewardPoints;
    } else {
      const res = await socialApi.createReel({
        videoUrl: uploadedUrl,
        thumbnail: mediaKind === 'image' ? uploadedUrl : undefined,
        title: job.caption.slice(0, 200) || undefined,
        description: job.caption,
        placeId: job.spotId || undefined,
        vendorId: job.vendorId || undefined,
      });
      const payload = (res as { data?: Reel })?.data ?? (res as unknown as Reel);
      rewardPoints = unwrapReelRewardPoints(res) || unwrapReelRewardPoints(payload);
      reel = mapReelUrls({ ...payload, rewardPoints });
    }

    const finished = updateJob(localUploadId, {
      status: 'POSTED',
      progress: 100,
      reelId: reel.id,
      videoUrl: uploadedUrl,
      thumbnail: mediaKind === 'image' ? uploadedUrl : job.thumbnail,
      rewardPoints,
      error: undefined,
    });
    if (finished) {
      postedListeners.forEach((fn) => fn(finished, reel));
      scheduleHidePosted(localUploadId);
    }
  } catch (err: unknown) {
    await discardUnpublishedMedia(uploadedPublicId, mediaKind);
    updateJob(localUploadId, {
      status: 'FAILED',
      videoUrl: undefined,
      error: mapReelUploadError(err),
    });
  }
}

async function ensureHydrated(): Promise<void> {
  if (hydrated) return;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ReelUploadJob[];
      if (Array.isArray(parsed)) {
        jobs = parsed.filter((j) => j?.localUploadId);
      }
    }
  } catch {
    jobs = [];
  }
  hydrated = true;
  notify();

  // Resume jobs interrupted mid-flight (same app session relaunch).
  for (const job of jobs) {
    if (job.status === 'QUEUED' || job.status === 'UPLOADING' || job.status === 'PROCESSING') {
      void enqueueRun(job.localUploadId);
    } else if (job.status === 'POSTED') {
      const wait = remainingPostedHideMs(job);
      if (wait > 0) scheduleHidePosted(job.localUploadId, wait);
    }
  }
}

function enqueueRun(localUploadId: string): Promise<void> {
  const existing = running.get(localUploadId);
  if (existing) return existing;
  const promise = runUploadJob(localUploadId).finally(() => {
    running.delete(localUploadId);
  });
  running.set(localUploadId, promise);
  return promise;
}

export const creatorUploadManager = {
  async init(): Promise<void> {
    await ensureHydrated();
  },

  getJobs(): ReelUploadJob[] {
    return [...jobs];
  },

  getActiveJobs(): ReelUploadJob[] {
    return jobs.filter((j) =>
      j.status === 'QUEUED' ||
      j.status === 'UPLOADING' ||
      j.status === 'PROCESSING',
    );
  },

  getVisibleJobs(now = Date.now()): ReelUploadJob[] {
    return jobs.filter((j) => isUploadJobVisible(j, now));
  },

  subscribe(listener: UploadListener): () => void {
    listeners.add(listener);
    listener([...jobs]);
    void ensureHydrated();
    return () => listeners.delete(listener);
  },

  onPosted(listener: PostedListener): () => void {
    postedListeners.add(listener);
    return () => postedListeners.delete(listener);
  },

  async startReelUpload(input: StartReelUploadInput): Promise<string> {
    await ensureHydrated();
    const duplicate = findDuplicateUpload(input);
    if (duplicate) return duplicate.localUploadId;
    const localUploadId = createLocalUploadId();
    const job: ReelUploadJob = {
      localUploadId,
      status: 'QUEUED',
      progress: 0,
      videoUri: input.videoUri,
      caption: input.caption,
      title: input.title,
      spotId: input.spotId,
      spotName: input.spotName,
      tags: input.tags,
      mimeType: input.mimeType,
      fileName: input.fileName,
      mediaKind: input.mediaKind || detectReelMediaKind(input.mimeType, input.videoUri, input.fileName),
      kind: input.kind || 'CREATOR',
      userId: input.userId,
      userName: input.userName,
      vendorId: input.vendorId,
      editReelId: input.editReelId,
      publishDraft: input.publishDraft,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    jobs = [job, ...jobs.filter((j) => j.localUploadId !== localUploadId)].slice(0, MAX_STORED_JOBS);
    notify();
    await persist();
    void enqueueRun(localUploadId);
    return localUploadId;
  },

  async retryUpload(localUploadId: string): Promise<void> {
    await ensureHydrated();
    const job = jobs.find((j) => j.localUploadId === localUploadId);
    if (!job || job.status === 'POSTED') return;
    updateJob(localUploadId, {
      status: 'QUEUED',
      progress: 0,
      videoUrl: undefined,
      error: undefined,
    });
    void enqueueRun(localUploadId);
  },

  async cancelUpload(localUploadId: string): Promise<void> {
    await ensureHydrated();
    updateJob(localUploadId, { status: 'CANCELLED' });
  },

  async clearFinished(localUploadId: string): Promise<void> {
    await ensureHydrated();
    jobs = jobs.filter((j) => j.localUploadId !== localUploadId);
    notify();
    await persist();
  },

  /** @internal test helper */
  __resetForTests(): void {
    hideTimers.forEach((timer) => clearTimeout(timer));
    hideTimers.clear();
    jobs = [];
    hydrated = false;
    running.clear();
    listeners.clear();
    postedListeners.clear();
  },
};
