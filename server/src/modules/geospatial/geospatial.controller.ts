import { Request, Response } from 'express';
import { geospatialService } from './geospatial.service';
import { catchAsync } from '../../shared/utils/catchAsync';
import { sendSuccess } from '../../shared/utils/response';

export const geospatialController = {
  nearby: catchAsync(async (req: Request, res: Response) => {
    const result = await geospatialService.nearby(req.query as any);
    sendSuccess(res, result);
  }),

  clusters: catchAsync(async (req: Request, res: Response) => {
    const result = await geospatialService.clusters(req.query as any);
    sendSuccess(res, result);
  }),

  nearest: catchAsync(async (req: Request, res: Response) => {
    const result = await geospatialService.nearest(req.query as any);
    sendSuccess(res, result);
  }),

  route: catchAsync(async (req: Request, res: Response) => {
    const result = await geospatialService.route(req.query as any);
    sendSuccess(res, result);
  }),

  geofence: catchAsync(async (req: Request, res: Response) => {
    const result = await geospatialService.geofence(req.query as any);
    sendSuccess(res, result);
  }),

  heatmap: catchAsync(async (req: Request, res: Response) => {
    const result = await geospatialService.heatmap(req.query as any);
    sendSuccess(res, result);
  }),

  trends: catchAsync(async (req: Request, res: Response) => {
    const result = await geospatialService.trends(req.query as any);
    sendSuccess(res, result);
  }),
};
