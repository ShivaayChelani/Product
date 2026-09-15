import AsyncStorage from '@react-native-async-storage/async-storage';
import { creatorUploadManager, isUploadJobVisible, AUTO_HIDE_POSTED_MS, PROCESSING_TIMEOUT_MS, type ReelUploadJob } from '../services/creator/creatorUploadManager';
import { mapReelUploadError } from '../services/creator/reelUploadErrors';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

jest.mock('../services/videoCompressor', () => ({
  compressVideo: jest.fn(async (uri: string) => ({ compressedUri: uri })),
}));

jest.mock('../services/reelService', () => ({
  mapReelUrls: jest.fn((reel: any) => reel),
}));

jest.mock('../services/api', () => ({
  socialApi: {
    createReel: jest.fn(),
    getReelById: jest.fn(),
    updateReel: jest.fn(),
  },
  uploadApi: {
    uploadVideo: jest.fn(),
    uploadImage: jest.fn(),
    deleteMedia: jest.fn(),
  },
  vendorsApi: {
    createVendorReel: jest.fn(),
  },
}));

jest.mock('../features/creator/api/creatorApi', () => ({
  creatorApi: {
    publishDraft: jest.fn(),
  },
}));

const { socialApi, uploadApi, vendorsApi } = require('../services/api');
const { creatorApi } = require('../features/creator/api/creatorApi');

function wait(ms = 80) {
  return new Promise((r) => setTimeout(r, ms));
}

describe('creatorUploadManager', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    creatorUploadManager.__resetForTests();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
    uploadApi.deleteMedia.mockResolvedValue(undefined);
    await creatorUploadManager.init();
  });

  it('registers a job and notifies subscribers before upload completes', async () => {
    const seen: ReelUploadJob[][] = [];
    creatorUploadManager.subscribe((jobs) => seen.push([...jobs]));

    let resolveUpload!: (result: { url: string; publicId: string }) => void;
    uploadApi.uploadVideo.mockReturnValue(new Promise((res) => { resolveUpload = res; }));
    socialApi.createReel.mockResolvedValue({
      data: { id: 'reel_1', videoUrl: 'https://cdn.example/v.mp4', rewardPoints: 50 },
    });

    const localUploadId = await creatorUploadManager.startReelUpload({
      videoUri: 'file:///tmp/video.mp4',
      caption: 'Hello reel',
      tags: [],
      userId: 'user_1',
      userName: 'Creator',
    });

    expect(localUploadId).toMatch(/^reel_upload_/);
    const queuedSnapshot = seen.find((batch) => batch.some((j) => j.localUploadId === localUploadId));
    expect(queuedSnapshot?.find((j) => j.localUploadId === localUploadId)?.status).toBe('QUEUED');

    resolveUpload({ url: 'https://cdn.example/v.mp4', publicId: 'palsasafar/reels/v' });
    await wait(120);

    const jobs = creatorUploadManager.getJobs();
    expect(jobs[0]?.status).toBe('POSTED');
    expect(jobs[0]?.reelId).toBe('reel_1');
    expect(jobs[0]?.rewardPoints).toBe(50);
    expect(uploadApi.deleteMedia).not.toHaveBeenCalled();
  });

  it('does not queue a second job when the same reel is posted twice', async () => {
    uploadApi.uploadVideo.mockReturnValue(new Promise(() => { /* hang in-flight */ }));
    const payload = {
      videoUri: 'file:///tmp/same.mp4',
      caption: 'Same reel',
      tags: [] as string[],
      userId: 'user_1',
      userName: 'Creator',
    };
    const first = await creatorUploadManager.startReelUpload(payload);
    const second = await creatorUploadManager.startReelUpload(payload);
    expect(second).toBe(first);
    expect(creatorUploadManager.getJobs().filter((j) => j.videoUri === payload.videoUri)).toHaveLength(1);
  });

  it('retries publish with the saved URL instead of re-uploading', async () => {
    uploadApi.uploadVideo.mockResolvedValueOnce({
      url: 'https://cdn.example/retry.mp4',
      publicId: 'palsasafar/reels/retry',
    });
    socialApi.createReel.mockRejectedValueOnce(new Error('Server could not process your reel'));

    const localUploadId = await creatorUploadManager.startReelUpload({
      videoUri: 'file:///tmp/video.mp4',
      caption: 'Retry me',
      tags: [],
      userId: 'user_1',
      userName: 'Creator',
    });

    await wait(120);
    expect(creatorUploadManager.getJobs()[0]?.status).toBe('FAILED');
    expect(creatorUploadManager.getJobs()[0]?.videoUrl).toBe('https://cdn.example/retry.mp4');

    uploadApi.uploadVideo.mockClear();
    socialApi.createReel.mockClear();
    socialApi.createReel.mockResolvedValue({
      data: { id: 'reel_retry', videoUrl: 'https://cdn.example/retry.mp4', rewardPoints: 0 },
    });

    await creatorUploadManager.retryUpload(localUploadId);
    await wait(120);

    expect(uploadApi.uploadVideo).not.toHaveBeenCalled();
    expect(socialApi.createReel).toHaveBeenCalledTimes(1);
    expect(socialApi.createReel).toHaveBeenCalledWith(expect.objectContaining({
      videoUrl: 'https://cdn.example/retry.mp4',
    }));
    expect(creatorUploadManager.getJobs()[0]?.status).toBe('POSTED');
  });

  it('uploads photos through the image API and keeps them only after publish', async () => {
    uploadApi.uploadImage.mockResolvedValue({
      url: 'https://res.cloudinary.com/demo/image/upload/v1/palsasafar/places/still.jpg',
      publicId: 'palsasafar/places/still',
    });
    socialApi.createReel.mockResolvedValue({
      data: {
        id: 'photo_reel',
        videoUrl: 'https://res.cloudinary.com/demo/image/upload/v1/palsasafar/places/still.jpg',
      },
    });

    await creatorUploadManager.startReelUpload({
      videoUri: 'file:///tmp/still.jpg',
      caption: 'Photo reel',
      tags: [],
      userId: 'user_1',
      userName: 'Creator',
      mimeType: 'image/jpeg',
      fileName: 'still.jpg',
      mediaKind: 'image',
    });

    await wait(120);
    expect(uploadApi.uploadImage).toHaveBeenCalled();
    expect(uploadApi.uploadVideo).not.toHaveBeenCalled();
    expect(socialApi.createReel).toHaveBeenCalledWith(expect.objectContaining({
      thumbnail: 'https://res.cloudinary.com/demo/image/upload/v1/palsasafar/places/still.jpg',
    }));
    expect(creatorUploadManager.getJobs()[0]?.status).toBe('POSTED');
  });

  it('publishes vendor reels through the vendor API', async () => {
    uploadApi.uploadVideo.mockResolvedValue({
      url: 'https://cdn.example/vendor.mp4',
      publicId: 'palsasafar/reels/vendor',
    });
    vendorsApi.createVendorReel.mockResolvedValue({
      id: 'vreel_1',
      videoUrl: 'https://cdn.example/vendor.mp4',
      title: 'Offer',
    });

    await creatorUploadManager.startReelUpload({
      kind: 'VENDOR',
      videoUri: 'file:///tmp/video.mp4',
      caption: '{"caption":"Promo"}',
      title: 'Offer',
      tags: [],
      userId: 'vendor_user',
      userName: 'Cafe',
      vendorId: 'vendor_1',
    });

    await wait(120);
    expect(vendorsApi.createVendorReel).toHaveBeenCalledTimes(1);
    expect(socialApi.createReel).not.toHaveBeenCalled();
    expect(creatorUploadManager.getJobs()[0]?.status).toBe('POSTED');
    expect(creatorUploadManager.getJobs()[0]?.reelId).toBe('vreel_1');
  });

  it('keeps creator reels on the social API when a vendor is tagged as location', async () => {
    uploadApi.uploadVideo.mockResolvedValue({
      url: 'https://cdn.example/v.mp4',
      publicId: 'palsasafar/reels/v',
    });
    socialApi.createReel.mockResolvedValue({
      data: { id: 'tagged_reel', videoUrl: 'https://cdn.example/v.mp4' },
    });

    await creatorUploadManager.startReelUpload({
      kind: 'CREATOR',
      videoUri: 'file:///tmp/video.mp4',
      caption: 'At the cafe',
      tags: [],
      userId: 'user_1',
      userName: 'Creator',
      vendorId: 'vendor_1',
    });

    await wait(120);
    expect(socialApi.createReel).toHaveBeenCalledWith(expect.objectContaining({ vendorId: 'vendor_1' }));
    expect(vendorsApi.createVendorReel).not.toHaveBeenCalled();
  });

  it('persists jobs to AsyncStorage', async () => {
    uploadApi.uploadVideo.mockResolvedValue({
      url: 'https://cdn.example/v.mp4',
      publicId: 'palsasafar/reels/v',
    });
    socialApi.createReel.mockResolvedValue({
      data: { id: 'reel_persist', videoUrl: 'https://cdn.example/v.mp4' },
    });

    await creatorUploadManager.startReelUpload({
      videoUri: 'file:///tmp/video.mp4',
      caption: 'Persist',
      tags: [],
      userId: 'user_1',
      userName: 'Creator',
    });

    await wait(40);
    expect(AsyncStorage.setItem).toHaveBeenCalled();
  });

  it('publishes draft without creating a second reel record path', async () => {
    uploadApi.uploadVideo.mockResolvedValue({
      url: 'https://cdn.example/draft.mp4',
      publicId: 'palsasafar/reels/draft',
    });
    creatorApi.publishDraft.mockResolvedValue({
      data: { id: 'draft_1', videoUrl: 'https://cdn.example/draft.mp4', rewardPoints: 50 },
    });
    socialApi.getReelById.mockResolvedValue({
      data: { id: 'draft_1', videoUrl: 'https://cdn.example/draft.mp4' },
    });

    await creatorUploadManager.startReelUpload({
      videoUri: 'file:///tmp/video.mp4',
      caption: 'Draft publish',
      tags: [],
      userId: 'user_1',
      userName: 'Creator',
      editReelId: 'draft_1',
      publishDraft: true,
    });

    await wait(80);
    expect(creatorApi.publishDraft).toHaveBeenCalledWith('draft_1');
    expect(socialApi.createReel).not.toHaveBeenCalled();
    expect(creatorUploadManager.getJobs()[0]?.rewardPoints).toBe(50);
  });

  it('persists the uploaded videoUrl before the publish call so a crash cannot force re-upload (BUG 4)', async () => {
    let resolveUpload!: (r: { url: string; publicId: string }) => void;
    let resolveCreate!: (r: any) => void;
    uploadApi.uploadVideo.mockReturnValue(new Promise((res) => { resolveUpload = res; }));
    socialApi.createReel.mockReturnValue(new Promise((res) => { resolveCreate = res; }));

    const localUploadId = await creatorUploadManager.startReelUpload({
      videoUri: 'file:///tmp/video.mp4',
      caption: 'Crash proof',
      tags: [],
      userId: 'user_1',
      userName: 'Creator',
    });

    resolveUpload({ url: 'https://cdn.example/crash.mp4', publicId: 'palsasafar/reels/crash' });
    await wait(40);

    // Publish is still in flight (PROCESSING), but the URL is already durable.
    const inFlight = creatorUploadManager.getJobs().find((j) => j.localUploadId === localUploadId);
    expect(inFlight?.status).toBe('PROCESSING');
    expect(inFlight?.videoUrl).toBe('https://cdn.example/crash.mp4');

    resolveCreate({ data: { id: 'crash_reel', videoUrl: 'https://cdn.example/crash.mp4' } });
    await wait(40);
    expect(creatorUploadManager.getJobs().find((j) => j.localUploadId === localUploadId)?.status).toBe('POSTED');
  });

  it('resumes a stored PROCESSING job reusing the saved URL instead of re-uploading (BUG 4 no-duplicate)', async () => {
    creatorUploadManager.__resetForTests();
    const stored: ReelUploadJob = {
      localUploadId: 'resumed_1',
      status: 'PROCESSING',
      progress: 90,
      videoUri: 'file:///tmp/video.mp4',
      videoUrl: 'https://cdn.example/resume.mp4',
      caption: 'Resume me',
      tags: [],
      userId: 'user_1',
      userName: 'Creator',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify([stored]));
    socialApi.createReel.mockResolvedValue({
      data: { id: 'resumed_reel', videoUrl: 'https://cdn.example/resume.mp4' },
    });

    await creatorUploadManager.init();
    await wait(120);

    // No new upload (would mint a new URL); the publish continues with the saved URL.
    expect(uploadApi.uploadVideo).not.toHaveBeenCalled();
    expect(socialApi.createReel).toHaveBeenCalledWith(expect.objectContaining({
      videoUrl: 'https://cdn.example/resume.mp4',
    }));
    expect(creatorUploadManager.getJobs()[0]?.status).toBe('POSTED');
    expect(creatorUploadManager.getJobs()[0]?.reelId).toBe('resumed_reel');
  });

  it('watchdog fails a PROCESSING job that hangs instead of leaving it stuck forever (BUG 4)', async () => {
    jest.useFakeTimers();
    try {
      uploadApi.uploadVideo.mockResolvedValue({
        url: 'https://cdn.example/hang.mp4',
        publicId: 'palsasafar/reels/hang',
      });
      // createReel never settles — simulates a server call that hangs.
      socialApi.createReel.mockReturnValue(new Promise(() => {}));

      await creatorUploadManager.startReelUpload({
        videoUri: 'file:///tmp/video.mp4',
        caption: 'Hang me',
        tags: [],
        userId: 'user_1',
        userName: 'Creator',
      });

      for (let i = 0; i < 30; i++) {
        if (creatorUploadManager.getJobs()[0]?.status === 'PROCESSING') break;
        await Promise.resolve();
      }
      expect(creatorUploadManager.getJobs()[0]?.status).toBe('PROCESSING');

      jest.advanceTimersByTime(PROCESSING_TIMEOUT_MS + 1000);
      await Promise.resolve();

      // Never fake-complete: it must fail, and keep the uploaded URL for retry.
      expect(creatorUploadManager.getJobs()[0]?.status).toBe('FAILED');
      expect(creatorUploadManager.getJobs()[0]?.error).toMatch(/timed out/i);
      expect(creatorUploadManager.getJobs()[0]?.videoUrl).toBe('https://cdn.example/hang.mp4');
      expect(uploadApi.deleteMedia).not.toHaveBeenCalled();
    } finally {
      await Promise.resolve();
      creatorUploadManager.__resetForTests();
      jest.useRealTimers();
    }
  });

  it('truncates captions to the server 2000-character limit', async () => {
    uploadApi.uploadVideo.mockResolvedValue({
      url: 'https://cdn.example/v.mp4',
      publicId: 'palsasafar/reels/v',
    });
    socialApi.createReel.mockResolvedValue({
      data: { id: 'reel_long', videoUrl: 'https://cdn.example/v.mp4' },
    });

    await creatorUploadManager.startReelUpload({
      videoUri: 'file:///tmp/video.mp4',
      caption: 'x'.repeat(2200),
      tags: [],
      userId: 'user_1',
      userName: 'Creator',
    });
    await wait(120);

    expect(socialApi.createReel).toHaveBeenCalledWith(expect.objectContaining({
      description: 'x'.repeat(2000),
    }));
    expect(creatorUploadManager.getJobs()[0]?.status).toBe('POSTED');
  });

  it('fails processing when createReel returns no reel id', async () => {
    uploadApi.uploadVideo.mockResolvedValue({
      url: 'https://cdn.example/v.mp4',
      publicId: 'palsasafar/reels/v',
    });
    socialApi.createReel.mockResolvedValue({ data: { videoUrl: 'https://cdn.example/v.mp4' } });

    await creatorUploadManager.startReelUpload({
      videoUri: 'file:///tmp/video.mp4',
      caption: 'No id',
      tags: [],
      userId: 'user_1',
      userName: 'Creator',
    });
    await wait(120);

    expect(creatorUploadManager.getJobs()[0]?.status).toBe('FAILED');
    expect(creatorUploadManager.getJobs()[0]?.error).toMatch(/not created/i);
  });

  it('hides posted jobs from Uploading Reels after a short success flash', () => {
    const now = Date.now();
    const posted: ReelUploadJob = {
      localUploadId: 'reel_upload_1',
      status: 'POSTED',
      progress: 100,
      videoUri: 'file:///tmp/video.mp4',
      caption: 'Test reel',
      tags: [],
      userId: 'user_1',
      userName: 'Creator',
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
    };
    expect(isUploadJobVisible(posted, now)).toBe(true);
    expect(isUploadJobVisible(posted, now + AUTO_HIDE_POSTED_MS)).toBe(false);
    expect(isUploadJobVisible({ ...posted, status: 'FAILED' }, now + AUTO_HIDE_POSTED_MS)).toBe(true);
    expect(isUploadJobVisible({
      ...posted,
      updatedAt: new Date(now - 60_000).toISOString(),
    }, now)).toBe(false);
  });

  it('notifies subscribers so posted cards drop without tapping dismiss', async () => {
    jest.useFakeTimers();
    try {
      uploadApi.uploadVideo.mockResolvedValue({
        url: 'https://cdn.example/v.mp4',
        publicId: 'palsasafar/reels/v',
      });
      socialApi.createReel.mockResolvedValue({
        data: { id: 'reel_autohide', videoUrl: 'https://cdn.example/v.mp4' },
      });

      await creatorUploadManager.startReelUpload({
        videoUri: 'file:///tmp/video.mp4',
        caption: 'Test reel',
        tags: [],
        userId: 'user_1',
        userName: 'Creator',
      });

      for (let i = 0; i < 30; i++) {
        if (creatorUploadManager.getJobs()[0]?.status === 'POSTED') break;
        await Promise.resolve();
      }

      expect(creatorUploadManager.getJobs()[0]?.status).toBe('POSTED');
      expect(creatorUploadManager.getVisibleJobs()).toHaveLength(1);

      jest.advanceTimersByTime(AUTO_HIDE_POSTED_MS);
      expect(creatorUploadManager.getJobs()[0]?.status).toBe('POSTED');
      expect(creatorUploadManager.getVisibleJobs()).toHaveLength(0);
    } finally {
      creatorUploadManager.__resetForTests();
      jest.useRealTimers();
    }
  });

  it('fails a stale PROCESSING job on hydrate instead of leaving it stuck (BUG 4 restart)', async () => {
    creatorUploadManager.__resetForTests();
    const stored: ReelUploadJob = {
      localUploadId: 'stale_1',
      status: 'PROCESSING',
      progress: 90,
      videoUri: 'file:///tmp/video.mp4',
      videoUrl: 'https://cdn.example/stale.mp4',
      processingStartedAt: new Date(Date.now() - PROCESSING_TIMEOUT_MS - 5000).toISOString(),
      caption: 'Stale',
      tags: [],
      userId: 'user_1',
      userName: 'Creator',
      createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - PROCESSING_TIMEOUT_MS - 5000).toISOString(),
    };
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify([stored]));

    await creatorUploadManager.init();
    await wait(40);

    expect(creatorUploadManager.getJobs()[0]?.status).toBe('FAILED');
    expect(creatorUploadManager.getJobs()[0]?.error).toMatch(/timed out/i);
    expect(socialApi.createReel).not.toHaveBeenCalled();
  });
});

describe('mapReelUploadError', () => {
  it('maps HTTP status codes to meaningful messages', () => {
    expect(mapReelUploadError({ status: 413, message: 'too big' })).toMatch(/too large/i);
    expect(mapReelUploadError({ status: 415, message: 'bad type' })).toMatch(/not supported/i);
    expect(mapReelUploadError({ status: 500, message: 'Internal Server Error' })).toMatch(/Server could not process/i);
  });

  it('maps network abort to connection message', () => {
    const err = new Error('Request timed out');
    err.name = 'AbortError';
    expect(mapReelUploadError(err)).toMatch(/interrupted/i);
  });
});

describe('CreateReel background upload wiring', () => {
  it('starts upload manager and navigates to Creator Workspace', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '../screens/CreateReelScreen.tsx'), 'utf8');
    expect(src).toMatch(/creatorUploadManager\.startReelUpload/);
    expect(src).toMatch(/navigateToWorkspaceHome\(navigation, 'CREATOR'\)/);
    expect(src).toMatch(/submitLockRef/);
    expect(src).toMatch(/if \(submitLockRef\.current\) return;/);
    expect(src).toMatch(/mediaType: 'mixed'/);
    expect(src).not.toMatch(/uploadReelVideo/);
  });
});

describe('CreateVendorReel background upload wiring', () => {
  it('queues a background vendor upload and returns to vendor home', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '../screens/CreateVendorReelScreen.tsx'), 'utf8');
    expect(src).toMatch(/creatorUploadManager\.startReelUpload/);
    expect(src).toMatch(/kind: 'VENDOR'/);
    expect(src).toMatch(/submitLockRef/);
    expect(src).toMatch(/navigateToWorkspaceHome\(navigation, 'VENDOR'\)/);
    expect(src).not.toMatch(/uploadApi\.uploadVideo/);
  });
});
