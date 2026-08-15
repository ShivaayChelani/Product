import { Request, Response, NextFunction } from 'express';
import { catchAsync } from '../../shared/utils/catchAsync';
import { sendSuccess } from '../../shared/utils/response';
import { ridesService } from './rides.service';
import type { RideDeepLinkParams, RideProviderId } from './ride.types';

export const getRideProviders = catchAsync(async (req: Request, res: Response, _next: NextFunction) => {
  const q = req.query as Record<string, string | undefined>;
  const pickupLatitude = q.pickupLatitude != null ? Number(q.pickupLatitude) : undefined;
  const pickupLongitude = q.pickupLongitude != null ? Number(q.pickupLongitude) : undefined;

  const providers = await ridesService.listProviders(pickupLatitude, pickupLongitude);
  const available = providers.filter(p => p.available && p.enabled);

  sendSuccess(res, available.map(p => ({
    id: p.id,
    name: p.name,
    mode: p.mode,
    status: p.status,
    capabilities: p.capabilities,
    supportsFareEstimate: p.supportsFareEstimate,
    supportsBookingApi: p.supportsBookingApi,
    supportsDeepLink: p.supportsDeepLink,
    supportsWebBooking: p.supportsWebBooking,
    vehicles: p.vehicles,
    icon: p.icon,
    color: p.color,
  })));
});

export const postRideOpen = catchAsync(async (req: Request, res: Response, _next: NextFunction) => {
  const body = req.body as {
    provider: RideProviderId;
    pickupLatitude: number;
    pickupLongitude: number;
    destinationLatitude: number;
    destinationLongitude: number;
    pickupAddress?: string;
    destinationAddress?: string;
    vehicleType?: RideDeepLinkParams['vehicleType'];
  };

  const params: RideDeepLinkParams = {
    pickupLatitude: body.pickupLatitude,
    pickupLongitude: body.pickupLongitude,
    destinationLatitude: body.destinationLatitude,
    destinationLongitude: body.destinationLongitude,
    pickupAddress: body.pickupAddress,
    destinationAddress: body.destinationAddress,
    vehicleType: body.vehicleType,
  };

  const payload = await ridesService.open({
    userId: req.user?.id,
    provider: body.provider,
    params,
  });

  sendSuccess(res, {
    provider: payload.provider,
    deepLink: payload.deepLink,
    webFallbackLink: payload.webFallbackLink,
    playStore: payload.playStore,
    appStore: payload.appStore,
    requestId: payload.requestId,
  });
});
