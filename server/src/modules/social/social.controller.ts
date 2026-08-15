import { Response } from 'express';
import { socialService } from './social.service';
import { catchAsync } from '../../shared/utils/catchAsync';
import { sendSuccess, sendCreated } from '../../shared/utils/response';
import { ApiError } from '../../shared/utils/ApiError';
import { prisma } from '../../config/database';

export const socialController = {
  // ── Creator Handlers ──

  applyCreator: catchAsync(async (req: any, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw new ApiError(401, 'Unauthorized');
    const application = await socialService.applyCreator(userId, req.body);
    sendCreated(res, application, 'Creator profile application submitted.');
  }),

  verifyCreator: catchAsync(async (req: any, res: Response) => {
    const { id } = req.params;
    const { status, rejectionReason } = req.body;
    const updated = await socialService.verifyCreator(id, status, rejectionReason, req.user.id);
    sendSuccess(res, updated, { message: `Creator profile application ${status.toLowerCase()}.` });
  }),

  getCreatorProfile: catchAsync(async (req: any, res: Response) => {
    const { username } = req.params;
    if (!username || username === 'check-username' || username === 'me') {
      throw new ApiError(400, 'Invalid creator handle parameter.');
    }
    const currentUserId = req.user?.id;
    const profile = await socialService.getCreatorProfile(username, currentUserId);
    sendSuccess(res, profile);
  }),

  checkUsername: catchAsync(async (req: any, res: Response) => {
    const username = (req.query.username as string) || '';
    const userId = req.user?.id;
    const result = await socialService.checkUsernameAvailability(username, userId);
    sendSuccess(res, result);
  }),

  updateProfile: catchAsync(async (req: any, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw new ApiError(401, 'Unauthorized');
    const updated = await socialService.updateProfile(userId, req.body);
    sendSuccess(res, updated, { message: 'Profile updated successfully.' });
  }),

  getCreatorDashboard: catchAsync(async (req: any, res: Response) => {
    const dashboard = await socialService.getCreatorDashboard(req.user.id);
    sendSuccess(res, dashboard);
  }),

  getCreatorAnalytics: catchAsync(async (req: any, res: Response) => {
    const analytics = await socialService.getCreatorAnalytics(req.user.id, req.query.period as string | undefined);
    sendSuccess(res, analytics);
  }),

  listMyReels: catchAsync(async (req: any, res: Response) => {
    const reels = await socialService.listMyReels(req.user.id, req.query.page as string, req.query.limit as string);
    sendSuccess(res, reels);
  }),

  getCreatorLeaderboard: catchAsync(async (req: any, res: Response) => {
    const leaderboard = await socialService.getCreatorLeaderboard(req.query.limit as string | undefined);
    sendSuccess(res, leaderboard);
  }),

  followCreator: catchAsync(async (req: any, res: Response) => {
    const followerId = req.user?.id;
    if (!followerId) throw new ApiError(401, 'Unauthorized');
    const { id: creatorProfileId } = req.params;
    const follow = await socialService.followCreator(followerId, creatorProfileId);
    sendSuccess(res, follow, { message: 'Followed successfully.' });
  }),

  unfollowCreator: catchAsync(async (req: any, res: Response) => {
    const followerId = req.user?.id;
    if (!followerId) throw new ApiError(401, 'Unauthorized');
    const { id: creatorProfileId } = req.params;
    await socialService.unfollowCreator(followerId, creatorProfileId);
    sendSuccess(res, null, { message: 'Unfollowed successfully.' });
  }),

  // ── Reel Handlers ──

  createReel: catchAsync(async (req: any, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw new ApiError(401, 'Unauthorized');
    const reel = await socialService.createReel(userId, req.body);
    sendCreated(res, reel, 'Reel published successfully.');
  }),

  listReels: catchAsync(async (req: any, res: Response) => {
    const currentUserId = req.user?.id;
    const query = {
      category: req.query.category as string,
      lat: req.query.lat as string,
      lng: req.query.lng as string,
      radius: req.query.radius as string,
      page: req.query.page as string,
      limit: req.query.limit as string,
      q: req.query.q as string,
    };
    const reels = await socialService.listReels(currentUserId, query);
    sendSuccess(res, reels);
  }),

  getReelById: catchAsync(async (req: any, res: Response) => {
    const { id } = req.params;
    const currentUserId = req.user?.id;
    const reel = await socialService.getReelById(id, currentUserId);
    sendSuccess(res, reel);
  }),

  likeReel: catchAsync(async (req: any, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw new ApiError(401, 'Unauthorized');
    const { id: reelId } = req.params;
    const like = await socialService.likeReel(userId, reelId);
    sendSuccess(res, like, { message: 'Reel liked.' });
  }),

  unlikeReel: catchAsync(async (req: any, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw new ApiError(401, 'Unauthorized');
    const { id: reelId } = req.params;
    await socialService.unlikeReel(userId, reelId);
    sendSuccess(res, null, { message: 'Reel unliked.' });
  }),

  saveReel: catchAsync(async (req: any, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw new ApiError(401, 'Unauthorized');
    const { id: reelId } = req.params;
    const save = await socialService.saveReel(userId, reelId);
    sendSuccess(res, save, { message: 'Reel saved.' });
  }),

  unsaveReel: catchAsync(async (req: any, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw new ApiError(401, 'Unauthorized');
    const { id: reelId } = req.params;
    await socialService.unsaveReel(userId, reelId);
    sendSuccess(res, null, { message: 'Reel unsaved.' });
  }),

  addComment: catchAsync(async (req: any, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw new ApiError(401, 'Unauthorized');
    const { id: reelId } = req.params;
    const { text } = req.body;
    const comment = await socialService.addComment(userId, reelId, text);
    sendCreated(res, comment, 'Comment posted.');
  }),

  listComments: catchAsync(async (req: any, res: Response) => {
    const { id: reelId } = req.params;
    const comments = await socialService.listComments(reelId);
    sendSuccess(res, comments);
  }),

  reportReel: catchAsync(async (req: any, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw new ApiError(401, 'Unauthorized');
    const { id: reelId } = req.params;
    const reason = String(req.body?.reason || 'UNSPECIFIED').slice(0, 500);
    const report = await socialService.reportReel(userId, reelId, reason);
    sendCreated(res, report, 'Report submitted.');
  }),

  listReelReports: catchAsync(async (req: any, res: Response) => {
    const status = req.query.status ? String(req.query.status) : undefined;
    const data = await socialService.listReelReports(status);
    sendSuccess(res, data);
  }),

  incrementViews: catchAsync(async (req: any, res: Response) => {
    const { id: reelId } = req.params;
    const data = await socialService.incrementViews(reelId);
    sendSuccess(res, data, { message: 'View count updated.' });
  }),

  incrementShares: catchAsync(async (req: any, res: Response) => {
    const { id: reelId } = req.params;
    const data = await socialService.incrementShares(reelId);
    sendSuccess(res, data, { message: 'Share count updated.' });
  }),

  updateReel: catchAsync(async (req: any, res: Response) => {
    const reel = await socialService.updateOwnReel(req.user.id, req.params.id, req.body);
    sendSuccess(res, reel, { message: 'Reel updated successfully.' });
  }),

  deleteOwnReel: catchAsync(async (req: any, res: Response) => {
    await socialService.deleteOwnReel(req.user.id, req.params.id);
    sendSuccess(res, null, { message: 'Reel deleted.' });
  }),

  // ── Admin Moderation Handlers ──

  listCreatorApplications: catchAsync(async (req: any, res: Response) => {
    const status = req.query.status;
    const applications = await socialService.listCreatorApplications(
      typeof status === 'string' ? status : undefined,
    );
    sendSuccess(res, applications);
  }),

  deleteReel: catchAsync(async (req: any, res: Response) => {
    const { id } = req.params;
    await socialService.deleteReel(id);
    sendSuccess(res, null, { message: 'Reel deleted.' });
  }),

  toggleFeatureReel: catchAsync(async (req: any, res: Response) => {
    const { id } = req.params;
    const { featured } = req.body;
    const updated = await socialService.toggleFeatureReel(id, featured);
    sendSuccess(res, updated, { message: featured ? 'Reel featured.' : 'Reel unfeatured.' });
  }),

  createCollection: catchAsync(async (req: any, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw new ApiError(401, 'Unauthorized');
    const collection = await socialService.createCollection(userId, req.body);
    sendCreated(res, collection, 'Collection created successfully.');
  }),

  listCollections: catchAsync(async (req: any, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw new ApiError(401, 'Unauthorized');
    const collections = await socialService.listCollections(userId);
    sendSuccess(res, collections);
  }),

  getCollection: catchAsync(async (req: any, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw new ApiError(401, 'Unauthorized');
    const { id } = req.params;
    const collection = await socialService.getCollection(id, userId);
    sendSuccess(res, collection);
  }),

  updateCollection: catchAsync(async (req: any, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw new ApiError(401, 'Unauthorized');
    const { id } = req.params;
    const collection = await socialService.updateCollection(id, userId, req.body);
    sendSuccess(res, collection, { message: 'Collection updated successfully.' });
  }),

  deleteCollection: catchAsync(async (req: any, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw new ApiError(401, 'Unauthorized');
    const { id } = req.params;
    await socialService.deleteCollection(id, userId);
    sendSuccess(res, null, { message: 'Collection deleted successfully.' });
  }),

  addPlaceToCollection: catchAsync(async (req: any, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw new ApiError(401, 'Unauthorized');
    const { id: collectionId } = req.params;
    const added = await socialService.addPlaceToCollection(collectionId, userId, req.body);
    sendCreated(res, added, 'Place added to collection.');
  }),

  removePlaceFromCollection: catchAsync(async (req: any, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw new ApiError(401, 'Unauthorized');
    const { id: collectionId, placeId } = req.params;
    await socialService.removePlaceFromCollection(collectionId, placeId, userId);
    sendSuccess(res, null, { message: 'Place removed from collection.' });
  }),

  // ── Admin: List ALL reels (regardless of creator status) ──
  listAllReels: catchAsync(async (req: any, res: Response) => {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '30', 10)));
    const skip = (page - 1) * limit;
    const q = req.query.q as string | undefined;

    const where: any = {};
    if (q) {
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { creator: { username: { contains: q, mode: 'insensitive' } } },
        { creator: { fullName: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const [reels, total] = await Promise.all([
      prisma.reel.findMany({
        where,
        include: {
          creator: { select: { id: true, username: true, fullName: true, avatar: true } },
          place: { select: { id: true, name: true, city: true } },
          _count: { select: { likesList: true, comments: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.reel.count({ where }),
    ]);

    sendSuccess(res, reels, {
      pagination: {
        page, limit, total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    });
  }),
};
