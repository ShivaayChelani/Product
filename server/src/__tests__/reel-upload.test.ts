import request from 'supertest';
import { vi } from 'vitest';
import app from '../app';
import { getAuthToken } from './helpers/auth';

const { mockCloudinaryVideoUrl } = vi.hoisted(() => ({
  mockCloudinaryVideoUrl: 'https://res.cloudinary.com/demo/video/upload/v1/palsasafar/reels/test.mp4',
}));

vi.mock('../modules/monetization/plan-enforcement.service', () => ({
  planEnforcementService: {
    assertCreatorCanUploadReel: vi.fn().mockResolvedValue({ uploadLimit: -1 }),
    assertVendorCanCreateReel: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../config/upload', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config/upload')>();
  return {
    ...actual,
    validateVideoMagicBytes: actual.validateVideoMagicBytes,
    uploadVideoToCloudinary: vi.fn().mockResolvedValue({
      url: mockCloudinaryVideoUrl,
      publicId: 'palsasafar/reels/test',
      duration: 12,
    }),
  };
});

/** Minimal MP4 ftyp header accepted by validateVideoMagicBytes. */
function minimalMp4Buffer(extra = 0): Buffer {
  const buf = Buffer.alloc(32 + extra);
  buf.writeUInt32BE(24, 0);
  buf.write('ftyp', 4);
  buf.write('isom', 8);
  return buf;
}

describe('Reel video upload + post API', () => {
  let userToken: string;
  let creatorToken: string;

  beforeAll(async () => {
    userToken = await getAuthToken('USER');
    creatorToken = await getAuthToken('CONTENT_CREATOR');
  });

  describe('POST /api/v1/upload/video', () => {
    it('rejects without auth', async () => {
      const res = await request(app)
        .post('/api/v1/upload/video')
        .attach('video', minimalMp4Buffer(), 'clip.mp4');
      expect(res.status).toBe(401);
    });

    it('accepts valid MP4 upload', async () => {
      const res = await request(app)
        .post('/api/v1/upload/video')
        .set('Authorization', `Bearer ${creatorToken}`)
        .attach('video', minimalMp4Buffer(), {
          filename: 'clip.mp4',
          contentType: 'video/mp4',
        });
      expect(res.status).toBe(201);
      expect(res.body.data.url).toBe(mockCloudinaryVideoUrl);
    });

    it('accepts Android generic video/* when bytes are valid MP4', async () => {
      const res = await request(app)
        .post('/api/v1/upload/video')
        .set('Authorization', `Bearer ${creatorToken}`)
        .attach('video', minimalMp4Buffer(), {
          filename: 'VID_0001.mp4',
          contentType: 'video/*',
        });
      expect(res.status).toBe(201);
    });

    it('accepts application/octet-stream when bytes are valid MP4', async () => {
      const res = await request(app)
        .post('/api/v1/upload/video')
        .set('Authorization', `Bearer ${creatorToken}`)
        .attach('video', minimalMp4Buffer(), {
          filename: 'clip.mp4',
          contentType: 'application/octet-stream',
        });
      expect(res.status).toBe(201);
    });

    it('rejects invalid MIME with 400, not 500', async () => {
      const res = await request(app)
        .post('/api/v1/upload/video')
        .set('Authorization', `Bearer ${creatorToken}`)
        .attach('video', minimalMp4Buffer(), {
          filename: 'clip.avi',
          contentType: 'video/x-msvideo',
        });
      expect(res.status).toBe(400);
    });

    it('rejects invalid video bytes with 400', async () => {
      const res = await request(app)
        .post('/api/v1/upload/video')
        .set('Authorization', `Bearer ${creatorToken}`)
        .attach('video', Buffer.from('not-a-video'), {
          filename: 'bad.mp4',
          contentType: 'video/mp4',
        });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Invalid video/i);
    });

    it('rejects when no file provided', async () => {
      const res = await request(app)
        .post('/api/v1/upload/video')
        .set('Authorization', `Bearer ${creatorToken}`);
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/v1/social/reels', () => {
    it('rejects unauthorized user role', async () => {
      const res = await request(app)
        .post('/api/v1/social/reels')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          videoUrl: mockCloudinaryVideoUrl,
          description: 'Test reel from integration test',
        });
      expect(res.status).toBe(403);
    });

    it('creates reel for approved creator', async () => {
      const res = await request(app)
        .post('/api/v1/social/reels')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({
          videoUrl: `${mockCloudinaryVideoUrl}?t=${Date.now()}`,
          description: 'Integration test reel',
          title: 'Test reel',
        });
      expect(res.status).toBe(201);
      expect(res.body.data?.id).toBeTruthy();
      expect(res.body.data?.videoUrl).toContain('cloudinary.com');
    });

    it('does not 500 when placeId does not match any place', async () => {
      const res = await request(app)
        .post('/api/v1/social/reels')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({
          videoUrl: `${mockCloudinaryVideoUrl}?place=${Date.now()}`,
          description: 'Reel with unknown place label',
          placeId: 'Definitely Not A Real Place Name XYZ',
        });
      expect(res.status).toBe(201);
      expect(res.body.data?.placeId).toBeNull();
    });

    it('returns existing reel on duplicate videoUrl retry (idempotency)', async () => {
      const videoUrl = `${mockCloudinaryVideoUrl}?dup=${Date.now()}`;
      const first = await request(app)
        .post('/api/v1/social/reels')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ videoUrl, description: 'Duplicate guard test' });
      expect(first.status).toBe(201);
      const firstId = first.body.data?.id;

      const second = await request(app)
        .post('/api/v1/social/reels')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ videoUrl, description: 'Duplicate guard test retry' });
      expect(second.status).toBe(201);
      expect(second.body.data?.id).toBe(firstId);
      expect(second.body.data?.rewardPoints ?? 0).toBe(0);
    });
  });
});

describe('POST /api/v1/upload/video storage failure', () => {
  it('returns 502 when Cloudinary upload fails', async () => {
    const uploadModule = await import('../config/upload');
    vi.mocked(uploadModule.uploadVideoToCloudinary).mockRejectedValueOnce(new Error('Cloudinary down'));

    const creatorToken = await getAuthToken('CONTENT_CREATOR');
    const res = await request(app)
      .post('/api/v1/upload/video')
      .set('Authorization', `Bearer ${creatorToken}`)
      .attach('video', minimalMp4Buffer(), {
        filename: 'clip.mp4',
        contentType: 'video/mp4',
      });

    expect(res.status).toBe(502);
    expect(res.body.message).toMatch(/temporarily unavailable|try again/i);
  });
});
