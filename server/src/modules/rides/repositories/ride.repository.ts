import { prisma } from '../../../config/database';
import { Prisma, RideRequestStatus } from '@prisma/client';
import type { RideDeepLinkParams, RideProviderId } from '../ride.types';

export const rideRepository = {
  async listEnabledProviders() {
    return prisma.rideProvider.findMany({
      where: { enabled: true },
      orderBy: { priority: 'asc' },
    });
  },

  async createRequest(input: {
    userId?: string;
    providerId: RideProviderId;
    params: RideDeepLinkParams;
  }) {
    return prisma.rideRequest.create({
      data: {
        userId: input.userId ?? null,
        providerId: input.providerId,
        pickupLatitude: input.params.pickupLatitude,
        pickupLongitude: input.params.pickupLongitude,
        pickupAddress: input.params.pickupAddress ?? null,
        destinationLatitude: input.params.destinationLatitude,
        destinationLongitude: input.params.destinationLongitude,
        destinationAddress: input.params.destinationAddress ?? null,
        vehicleType: input.params.vehicleType ?? null,
        status: RideRequestStatus.PENDING,
      },
    });
  },

  async markOpened(requestId: string) {
    return prisma.rideRequest.update({
      where: { id: requestId },
      data: {
        status: RideRequestStatus.OPENED,
        openedAt: new Date(),
      },
    });
  },

  async appendHistory(input: {
    userId?: string;
    requestId?: string;
    providerId: RideProviderId;
    action: string;
    metadata?: Record<string, unknown>;
  }) {
    return prisma.rideHistory.create({
      data: {
        userId: input.userId ?? null,
        requestId: input.requestId ?? null,
        providerId: input.providerId,
        action: input.action,
        metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  },
};
