import { Response } from 'express';
import { prisma } from '../../config/database';
import { redemptionsService } from './redemptions.service';
import { catchAsync } from '../../shared/utils/catchAsync';
import { sendSuccess, sendCreated } from '../../shared/utils/response';

export const redemptionsController = {
  redeemOffer: catchAsync(async (req: any, res: Response) => {
    const { offerId, vendorCode } = req.body;
    const redemption = await redemptionsService.redeemOffer(req.user.id, offerId, vendorCode);
    sendCreated(res, redemption, 'Offer redeemed successfully');
  }),

  myRedemptions: catchAsync(async (req: any, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const result = await redemptionsService.getUserRedemptions(req.user.id, page, limit);
    sendSuccess(res, result.data, { pagination: result.pagination });
  }),

  vendorRedemptions: catchAsync(async (req: any, res: Response) => {
    const vendor = await prisma.vendor.findUnique({ where: { userId: req.user.id } });
    if (!vendor) { sendSuccess(res, []); return; }
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const result = await redemptionsService.getVendorRedemptions(vendor.id, page, limit);
    sendSuccess(res, result.data, { pagination: result.pagination });
  }),

  adminRefund: catchAsync(async (req: any, res: Response) => {
    const redemption = await redemptionsService.refund(req.params.id, req.user.id, req.body.notes);
    sendSuccess(res, redemption, { message: 'Redemption refunded' });
  }),

  adminListAll: catchAsync(async (req: any, res: Response) => {
    const q = req.query as {
      page?: number;
      limit?: number;
      status?: string;
      userId?: string;
      vendorId?: string;
      offerId?: string;
      receiptNumber?: string;
      vendorSearch?: string;
      userSearch?: string;
    };
    const result = await redemptionsService.adminListAll({
      page: q.page || 1,
      limit: q.limit || 20,
      status: q.status,
      userId: q.userId,
      vendorId: q.vendorId,
      offerId: q.offerId,
      receiptNumber: q.receiptNumber,
      vendorSearch: q.vendorSearch,
      userSearch: q.userSearch,
    });
    sendSuccess(res, result.data, { pagination: result.pagination });
  }),

  adminExport: catchAsync(async (req: any, res: Response) => {
    const csv = await redemptionsService.adminExportCsv({
      status: req.query.status as string,
      receiptNumber: req.query.receiptNumber as string,
      vendorSearch: req.query.vendorSearch as string,
      userSearch: req.query.userSearch as string,
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="redemptions.csv"');
    res.send(csv);
  }),

  adminFraudAlerts: catchAsync(async (_req: any, res: Response) => {
    const alerts = await redemptionsService.getFraudAlerts();
    sendSuccess(res, alerts);
  }),

  pay: catchAsync(async (req: any, res: Response) => {
    const result = await redemptionsService.payPoints(req.user.id, req.body.vendorCode, req.body.points);
    sendCreated(res, result, 'Points transferred');
  }),
};
