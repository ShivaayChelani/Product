import { z } from 'zod';

const coord = z.coerce.number();

export const rideProvidersQuerySchema = z.object({
  pickupLatitude: coord.min(-90).max(90).optional(),
  pickupLongitude: coord.min(-180).max(180).optional(),
});

export const rideOpenBodySchema = z.object({
  provider: z.enum(['uber', 'ola', 'rapido', 'blusmart']),
  pickupLatitude: coord.min(-90).max(90),
  pickupLongitude: coord.min(-180).max(180),
  destinationLatitude: coord.min(-90).max(90),
  destinationLongitude: coord.min(-180).max(180),
  pickupAddress: z.string().max(500).optional(),
  destinationAddress: z.string().max(500).optional(),
  vehicleType: z.enum(['bike', 'auto', 'cab', 'xl', 'electric']).optional(),
});
