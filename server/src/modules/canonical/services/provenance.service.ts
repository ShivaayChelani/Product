import { prisma } from '../../../config/database';

export const provenanceService = {
  async recordField(params: {
    placeId: string;
    fieldName: string;
    value: unknown;
    sourceType: string;
    sourceUri?: string;
    confidence?: number;
    verifiedById?: string;
  }) {
    return prisma.placeFieldProvenance.create({
      data: {
        placeId: params.placeId,
        fieldName: params.fieldName,
        valueJson: params.value as any,
        sourceType: params.sourceType,
        sourceUri: params.sourceUri,
        confidence: params.confidence,
        verifiedById: params.verifiedById,
        verifiedAt: params.verifiedById ? new Date() : undefined,
      },
    });
  },

  async snapshotVersion(placeId: string, createdById?: string, changeSummary?: string) {
    const place = await prisma.place.findUnique({ where: { id: placeId } });
    if (!place) throw new Error('Place not found');

    const last = await prisma.placeVersion.findFirst({
      where: { placeId },
      orderBy: { versionNumber: 'desc' },
      select: { versionNumber: true },
    });
    const versionNumber = (last?.versionNumber ?? 0) + 1;

    return prisma.placeVersion.create({
      data: {
        placeId,
        versionNumber,
        snapshot: place as any,
        changeSummary,
        createdById,
      },
    });
  },

  async logChange(params: {
    placeId: string;
    actorId?: string;
    action: string;
    before?: unknown;
    after?: unknown;
  }) {
    return prisma.placeChangeHistory.create({
      data: {
        placeId: params.placeId,
        actorId: params.actorId,
        action: params.action,
        before: params.before as any,
        after: params.after as any,
      },
    });
  },

  /** Restore place fields from a version snapshot (pre-merge / pre-verify rollback). */
  async rollbackToVersion(placeId: string, versionNumber: number, actorId?: string) {
    const version = await prisma.placeVersion.findUnique({
      where: { placeId_versionNumber: { placeId, versionNumber } },
    });
    if (!version) throw new Error('Version not found');

    const snapshot = version.snapshot as Record<string, unknown>;
    const current = await prisma.place.findUnique({ where: { id: placeId } });
    if (!current) throw new Error('Place not found');

    const restorable: (keyof typeof current)[] = [
      'name',
      'slug',
      'description',
      'shortDescription',
      'latitude',
      'longitude',
      'category',
      'subcategory',
      'state',
      'district',
      'city',
      'village',
      'tags',
      'images',
      'thumbnail',
      'dataQuality',
      'publicPlaceId',
      'verificationScore',
      'qualityScore',
      'mergedIntoId',
      'status',
    ];

    const data: Record<string, unknown> = {};
    for (const key of restorable) {
      if (snapshot[key] !== undefined) {
        data[key] = snapshot[key];
      }
    }

    await this.snapshotVersion(placeId, actorId, `Pre-rollback snapshot before restoring v${versionNumber}`);

    const updated = await prisma.place.update({
      where: { id: placeId },
      data: data as any,
    });

    await this.logChange({
      placeId,
      actorId,
      action: 'ROLLBACK',
      before: current,
      after: { restoredVersion: versionNumber, fields: Object.keys(data) },
    });

    return { place: updated, restoredVersion: versionNumber };
  },
};
