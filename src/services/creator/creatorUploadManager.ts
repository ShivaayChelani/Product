import AsyncStorage from '@react-native-async-storage/async-storage';
import { compressVideo } from '../videoCompressor';
import { uploadReelVideo } from '../reelService';
import { socialApi } from '../api';
import { creatorApi } from '../../features/creator/api/creatorApi';
import { mapReelUploadError } from './reelUploadErrors';
import { mapReelUrls } from '../reelService';
import type { Reel } from '../../types';

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
  spotId?: string;
  spotName?: string;
  tags: string[];
  mimeType?: string;
  fileName?: string;
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
  spotId?: string;
  spotName?: string;
  tags: string[];
  userId: string;
  userName: string;
  vendorId?: string;
  mimeType?: string;
  fileName?: string;
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

function notify(): void {
  const snapshot = [...jobs];
  listeners.forEach((fn) => fn(snapshot));
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

async function runUploadJob(localUploadId: string): Promise<void> {
  const job = jobs.find((j) => j.localUploadId === localUploadId);
  if (!job || job.status === 'CANCELLED' || job.status === 'POSTED') return;

  try {
    updateJob(localUploadId, { status: 'UPLOADING', progress: 5, error: undefined });

    let videoUrl = job.videoUrl;
    if (!videoUrl) {
      if (/^https?:\/\//i.test(job.videoUri)) {
        videoUrl = job.videoUri;
        updateJob(localUploadId, { videoUrl, progress: 88 });
      } else {
        const compressed = await compressVideo(job.videoUri);
        videoUrl = await uploadReelVideo(
          compressed.compressedUri,
          (p) => updateJob(localUploadId, { progress: Math.max(5, Math.min(85, Math.round(p * 0.85))) }),
          job.mimeType,
          job.fileName,
        );
        updateJob(localUploadId, { videoUrl, progress: 88 });
      }
    }

    updateJob(localUploadId, { status: 'PROCESSING', progress: 90 });

    let reel: Reel;
    if (job.publishDraft && job.editReelId) {
      if (videoUrl) {
        await socialApi.updateReel(job.editReelId, {
          title: job.caption.slice(0, 200) || undefined,
          description: job.caption,
          placeId: job.spotId || undefined,
        });
      }
      await creatorApi.publishDraft(job.editReelId);
      const res = await socialApi.getReelById(job.editReelId);
      reel = mapReelUrls(res.data);
    } else {
      const res = await socialApi.createReel({
        videoUrl,
        title: job.caption.slice(0, 200) || undefined,
        description: job.caption,
        placeId: job.spotId || undefined,
        vendorId: job.vendorId || undefined,
      });
      reel = mapReelUrls(res.data);
    }

    const finished = updateJob(localUploadId, {
      status: 'POSTED',
      progress: 100,
      reelId: reel.id,
      rewardPoints: reel.rewardPoints || 0,
      error: undefined,
    });
    if (finished) {
      postedListeners.forEach((fn) => fn(finished, reel));
    }
  } catch (err: unknown) {
    updateJob(localUploadId, {
      status: 'FAILED',
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
    const localUploadId = createLocalUploadId();
    const job: ReelUploadJob = {
      localUploadId,
      status: 'QUEUED',
      progress: 0,
      videoUri: input.videoUri,
      caption: input.caption,
      spotId: input.spotId,
      spotName: input.spotName,
      tags: input.tags,
      mimeType: input.mimeType,
      fileName: input.fileName,
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
    jobs = [];
    hydrated = false;
    running.clear();
    listeners.clear();
    postedListeners.clear();
  },
};
