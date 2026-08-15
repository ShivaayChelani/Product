import { Request, Response } from 'express';
import { ApiError } from '../../shared/utils/ApiError';
import { catchAsync } from '../../shared/utils/catchAsync';
import { sendSuccess } from '../../shared/utils/response';
import { DirectionsBody } from './directions.validation';
import { fetchOsrmDirections } from './directions.service';

export const directionsController = {
  driving: catchAsync(async (req: Request, res: Response) => {
    const { originLat, originLng, destinationLat, destinationLng } = req.body as DirectionsBody;
    const result = await fetchOsrmDirections(
      { lat: originLat, lng: originLng },
      { lat: destinationLat, lng: destinationLng },
      { geometry: true },
    );
    if (!result) {
      throw new ApiError(
        502,
        'Directions service is temporarily unavailable. Please try again later.',
      );
    }
    sendSuccess(res, { ...result, provider: 'osrm' });
  }),
};
