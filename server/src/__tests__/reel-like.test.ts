import request from 'supertest';
import app from '../app';
import { getAuthToken } from './helpers/auth';

describe('Reel like API', () => {
  let userToken: string;

  beforeAll(async () => {
    userToken = await getAuthToken('USER');
  });

  it('rejects an unauthenticated like', async () => {
    const res = await request(app).post('/api/v1/social/reels/not-a-reel/like');
    expect(res.status).toBe(401);
  });

  it('rejects an unauthenticated unlike', async () => {
    const res = await request(app).delete('/api/v1/social/reels/not-a-reel/like');
    expect(res.status).toBe(401);
  });

  it('does not like a missing reel', async () => {
    const res = await request(app)
      .post('/api/v1/social/reels/clnonexistentreel00/like')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(404);
  });

  it('likes, ignores duplicate likes, unlikes, and keeps count consistent when a public reel exists', async () => {
    const feed = await request(app)
      .get('/api/v1/social/reels?limit=5')
      .set('Authorization', `Bearer ${userToken}`);
    expect([200, 401]).toContain(feed.status);
    if (feed.status !== 200) return;

    const items = Array.isArray(feed.body.data) ? feed.body.data : [];
    const reel = items.find((r: { id?: string; status?: string }) => r?.id && r.status !== 'HIDDEN');
    if (!reel) return;

    const beforeLikes = Number(reel.likes || 0);
    const wasLiked = !!reel.isLiked;

    if (wasLiked) {
      const unlike = await request(app)
        .delete(`/api/v1/social/reels/${reel.id}/like`)
        .set('Authorization', `Bearer ${userToken}`);
      expect(unlike.status).toBe(200);
    }

    const like = await request(app)
      .post(`/api/v1/social/reels/${reel.id}/like`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(like.status).toBe(200);

    const duplicate = await request(app)
      .post(`/api/v1/social/reels/${reel.id}/like`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(duplicate.status).toBe(200);

    const afterLike = await request(app)
      .get(`/api/v1/social/reels/${reel.id}`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(afterLike.status).toBe(200);
    expect(afterLike.body.data.isLiked).toBe(true);
    const likedCount = Number(afterLike.body.data.likes);
    const expected = wasLiked ? beforeLikes : beforeLikes + 1;
    expect(likedCount).toBe(expected);

    const unlike = await request(app)
      .delete(`/api/v1/social/reels/${reel.id}/like`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(unlike.status).toBe(200);

    const afterUnlike = await request(app)
      .get(`/api/v1/social/reels/${reel.id}`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(afterUnlike.body.data.isLiked).toBe(false);
    expect(Number(afterUnlike.body.data.likes)).toBe(Math.max(0, expected - 1));

    if (wasLiked) {
      await request(app)
        .post(`/api/v1/social/reels/${reel.id}/like`)
        .set('Authorization', `Bearer ${userToken}`);
    }
  });
});
