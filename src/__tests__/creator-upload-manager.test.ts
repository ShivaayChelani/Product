import AsyncStorage from '@react-native-async-storage/async-storage';
import { creatorUploadManager, type ReelUploadJob } from '../services/creator/creatorUploadManager';
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
  uploadReelVideo: jest.fn(),
  mapReelUrls: jest.fn((reel: any) => reel),
}));

jest.mock('../services/api', () => ({
  socialApi: {
    createReel: jest.fn(),
    getReelById: jest.fn(),
    updateReel: jest.fn(),
  },
}));

jest.mock('../features/creator/api/creatorApi', () => ({
  creatorApi: {
    publishDraft: jest.fn(),
  },
}));

const { uploadReelVideo } = require('../services/reelService');
const { socialApi } = require('../services/api');
const { creatorApi } = require('../features/creator/api/creatorApi');

describe('creatorUploadManager', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    creatorUploadManager.__resetForTests();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
    await creatorUploadManager.init();
  });

  it('registers a job and notifies subscribers before upload completes', async () => {
    const seen: ReelUploadJob[][] = [];
    creatorUploadManager.subscribe((jobs) => seen.push([...jobs]));

    let resolveUpload!: (url: string) => void;
    uploadReelVideo.mockReturnValue(new Promise((res) => { resolveUpload = res; }));
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

    resolveUpload('https://cdn.example/v.mp4');
    await new Promise((r) => setTimeout(r, 100));

    const jobs = creatorUploadManager.getJobs();
    expect(jobs[0]?.status).toBe('POSTED');
    expect(jobs[0]?.reelId).toBe('reel_1');
  });

  it('retry reuses stored videoUrl and skips re-upload after a failure', async () => {
    uploadReelVideo.mockResolvedValueOnce('https://cdn.example/retry.mp4');
    socialApi.createReel.mockRejectedValueOnce(new Error('Server could not process your reel'));

    const localUploadId = await creatorUploadManager.startReelUpload({
      videoUri: 'file:///tmp/video.mp4',
      caption: 'Retry me',
      tags: [],
      userId: 'user_1',
      userName: 'Creator',
    });

    await new Promise((r) => setTimeout(r, 100));
    expect(creatorUploadManager.getJobs()[0]?.status).toBe('FAILED');
    expect(creatorUploadManager.getJobs()[0]?.videoUrl).toBe('https://cdn.example/retry.mp4');

    uploadReelVideo.mockClear();
    socialApi.createReel.mockClear();
    socialApi.createReel.mockResolvedValue({
      data: { id: 'reel_retry', videoUrl: 'https://cdn.example/retry.mp4', rewardPoints: 0 },
    });

    await creatorUploadManager.retryUpload(localUploadId);
    await new Promise((r) => setTimeout(r, 100));

    expect(uploadReelVideo).not.toHaveBeenCalled();
    expect(socialApi.createReel).toHaveBeenCalledTimes(1);
    expect(creatorUploadManager.getJobs()[0]?.status).toBe('POSTED');
  });

  it('persists jobs to AsyncStorage', async () => {
    uploadReelVideo.mockResolvedValue('https://cdn.example/v.mp4');
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

    await new Promise((r) => setTimeout(r, 30));
    expect(AsyncStorage.setItem).toHaveBeenCalled();
  });

  it('publishes draft without creating a second reel record path', async () => {
    uploadReelVideo.mockResolvedValue('https://cdn.example/draft.mp4');
    creatorApi.publishDraft.mockResolvedValue(undefined);
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

    await new Promise((r) => setTimeout(r, 50));
    expect(creatorApi.publishDraft).toHaveBeenCalledWith('draft_1');
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
    expect(src).toMatch(/navigation\.navigate\('CreatorTabs', \{ screen: 'Dashboard' \}\)/);
  });
});
