import { prisma } from '../../../config/database';
import { generateSlug } from './places.helpers';

export interface BulkPlaceInput {
  name: string;
  description?: string;
  shortDescription?: string;
  latitude?: number;
  longitude?: number;
  category?: string;
  tags?: string[];
  images?: string[];
  city?: string;
  state?: string;
  country?: string;
  openingHours?: Record<string, unknown>;
  bestTimeToVisit?: string;
  bestTimeReason?: string;
  rating?: number;
  externalId?: string;
  status?: 'APPROVED' | 'PENDING' | 'REJECTED';
  source?: string;
  ticketPrice?: {
    currency?: string;
    adult?: number;
    child?: number;
    foreigner?: number;
  };
  editorialPriority?: number;
}

export interface BulkImportResult {
  total: number;
  created: number;
  skipped: number;
  errors: number;
  skippedReasons: { name: string; reason: string }[];
  errorDetails: { name: string; error: string }[];
}

const BATCH_SIZE = 50;
const MAX_IMPORT_SIZE = 1000;

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export const placesBulkService = {
  async bulkImport(
    input: BulkPlaceInput[],
    options?: { overwrite?: boolean; source?: string; status?: string; userId?: string }
  ): Promise<BulkImportResult> {
    if (input.length > MAX_IMPORT_SIZE) {
      throw new Error(`Bulk import limited to ${MAX_IMPORT_SIZE} records. Received ${input.length}.`);
    }

    const result: BulkImportResult = {
      total: input.length,
      created: 0,
      skipped: 0,
      errors: 0,
      skippedReasons: [],
      errorDetails: [],
    };

    const existingPlaces = await prisma.place.findMany({
      select: { id: true, name: true, city: true, state: true, slug: true, latitude: true, longitude: true },
    });

    const duplicateIndex = new Map<string, typeof existingPlaces[0]>();
    for (const p of existingPlaces) {
      const key = `${normalizeName(p.name)}|${normalizeName(p.city || '')}|${normalizeName(p.state || '')}`;
      duplicateIndex.set(key, p);
      duplicateIndex.set(p.slug, p);
      if (p.latitude && p.longitude) {
        duplicateIndex.set(`${p.latitude.toFixed(4)}|${p.longitude.toFixed(4)}`, p);
      }
    }

    for (let i = 0; i < input.length; i += BATCH_SIZE) {
      const batch = input.slice(i, i + BATCH_SIZE);
      const toCreate: any[] = [];
      const toUpdate: any[] = [];

      for (const place of batch) {
        const nameKey = `${normalizeName(place.name)}|${normalizeName(place.city || '')}|${normalizeName(place.state || '')}`;

        if (duplicateIndex.has(nameKey)) {
          const existing = duplicateIndex.get(nameKey)!;
          result.skipped++;
          result.skippedReasons.push({ name: place.name, reason: `Duplicate: already exists as "${existing.name}" in ${existing.city}, ${existing.state}` });

          if (options?.overwrite) {
            toUpdate.push({ id: existing.id, ...place });
          }
          continue;
        }

        if (place.latitude && place.longitude) {
          const coordKey = `${place.latitude.toFixed(4)}|${place.longitude.toFixed(4)}`;
          if (duplicateIndex.has(coordKey)) {
            const existing = duplicateIndex.get(coordKey)!;
            result.skipped++;
            result.skippedReasons.push({ name: place.name, reason: `Duplicate coordinates: matches "${existing.name}"` });
            if (options?.overwrite) {
              toUpdate.push({ id: existing.id, ...place });
            }
            continue;
          }
        }

        toCreate.push(place);
      }

      if (toCreate.length > 0) {
        try {
          const records = await Promise.all(
            toCreate.map(async (p) => {
              const slug = await generateSlug(p.name);
              return {
                name: p.name,
                slug,
                description: p.description || p.shortDescription || '',
                shortDescription: p.shortDescription || (p.description?.substring(0, 200) ?? ''),
                latitude: p.latitude ?? null,
                longitude: p.longitude ?? null,
                category: p.category || 'other',
                tags: p.tags ?? [],
                images: p.images ?? [],
                city: p.city ?? '',
                state: p.state ?? '',
                country: p.country ?? 'India',
                openingHours: p.openingHours ?? undefined,
                ticketPrice: p.ticketPrice ?? undefined,
                bestTimeToVisit: p.bestTimeToVisit ? { bestMonths: p.bestTimeToVisit } : undefined,
                bestTimeReason: p.bestTimeReason ?? undefined,
                rating: p.rating ?? undefined,
                popularityScore: p.rating != null ? Math.round(p.rating * 10) : undefined,
                editorialPriority:
                  typeof p.editorialPriority === 'number' && p.editorialPriority >= 1 && p.editorialPriority <= 5
                    ? p.editorialPriority
                    : 3,
                externalId: p.externalId ?? undefined,
                status: options?.status || p.status || 'PENDING',
                source: options?.source || p.source || 'ADMIN',
                submittedById: options?.userId ?? null,
              };
            })
          );

          await prisma.$transaction(
            records.map((data) =>
              prisma.place.create({ data } as any)
            )
          );
          result.created += records.length;
        } catch (err: any) {
          result.errors += toCreate.length;
          result.errorDetails.push({ name: `batch ${Math.floor(i / BATCH_SIZE) + 1}`, error: err.message });
        }
      }

      if (toUpdate.length > 0 && options?.overwrite) {
        try {
          await Promise.all(
            toUpdate.map(async (p) => {
              const data: any = {};
              if (p.description) data.description = p.description;
              if (p.shortDescription) data.shortDescription = p.shortDescription;
              if (p.latitude != null) data.latitude = p.latitude;
              if (p.longitude != null) data.longitude = p.longitude;
              if (p.category) data.category = p.category;
              if (p.tags) data.tags = p.tags;
              if (p.images) data.images = p.images;
              if (p.city) data.city = p.city;
              if (p.state) data.state = p.state;
              if (p.openingHours) data.openingHours = p.openingHours;
              if (p.ticketPrice) data.ticketPrice = p.ticketPrice;
              if (p.bestTimeToVisit) data.bestTimeToVisit = { bestMonths: p.bestTimeToVisit };
              if (p.bestTimeReason) data.bestTimeReason = p.bestTimeReason;
              if (typeof p.editorialPriority === 'number') data.editorialPriority = p.editorialPriority;
              return prisma.place.update({ where: { id: p.id }, data });
            })
          );
        } catch (err: any) {
          result.errorDetails.push({ name: `overwrite batch ${Math.floor(i / BATCH_SIZE) + 1}`, error: err.message });
        }
      }
    }

    return result;
  },
};
