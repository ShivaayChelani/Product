import { prisma } from '../../../config/database';
import { ApiError } from '../../../shared/utils/ApiError';
import { eventBus, AppEvents } from '../../../config/events';
import { UpdatePlaceStatusInput } from '../places.validation';
import { placeListSelect, resolvePlace } from './places.helpers';

export const placesAuditService = {
  async updateStatus(idOrSlug: string, input: UpdatePlaceStatusInput, adminId: string) {
    const { id } = await resolvePlace(idOrSlug);
    const place = await prisma.place.findUnique({
      where: { id },
      select: { name: true, submittedById: true, status: true },
    });
    if (!place) throw new ApiError(404, 'Place not found.');

    const previous = { status: place.status };
    const reason = input.reason?.trim() || null;

    const updated = await prisma.place.update({
      select: placeListSelect,
      where: { id },
      data: {
        status: input.status,
        approvedById: adminId,
        reviewedAt: new Date(),
        ...(input.status === 'REJECTED' ? { rejectionReason: reason } : {}),
      },
    });

    if (input.status === 'APPROVED') {
      eventBus.emit(AppEvents.PLACE_APPROVED, {
        placeId: id,
        actorId: adminId,
        submitterId: place.submittedById,
        placeName: place.name,
        previous,
      });
    } else {
      eventBus.emit(AppEvents.PLACE_REJECTED, {
        placeId: id,
        actorId: adminId,
        submitterId: place.submittedById,
        placeName: place.name,
        reason,
        previous,
      });
    }

    return updated;
  },
};
