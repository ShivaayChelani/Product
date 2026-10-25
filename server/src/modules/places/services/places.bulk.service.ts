import { prisma } from '../../../config/database';
import { generateSlug, sanitizeImageMetadata } from './places.helpers';
import { validateBulkCoordinates } from './place-coordinates';
import { normalizeForMatch } from '../../../shared/utils/canonicalText';

export interface BulkPlaceInput {
  name: string;
  description?: string;
  shortDescription?: string;
  canonicalName?: string | null;
  latitude?: number;
  longitude?: number;
  category?: string;
  tags?: string[];
  images?: string[];
  city?: string;
  district?: string;
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
  imageMetadata?: {
    image_page_url?: string | null;
    image_source?: string | null;
    image_author?: string | null;
    image_license?: string | null;
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

type DuplicateRecord = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  slug: string;
  latitude: number | null;
  longitude: number | null;
  canonicalName?: string | null;
  status?: string | null;
};

function importStatus(requested?: string): 'APPROVED' | 'PENDING' {
  return requested === 'PENDING' ? 'PENDING' : 'APPROVED';
}

function identityKeys(place: {
  name?: string | null;
  canonicalName?: string | null;
  city?: string | null;
  state?: string | null;
  slug?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): string[] {
  const name = normalizeForMatch(place.name || '');
  const canonical = normalizeForMatch(place.canonicalName || '');
  const city = normalizeForMatch(place.city || '');
  const state = normalizeForMatch(place.state || '');
  const keys: string[] = [];
  if (name && city && state) keys.push(`ncs:${name}|${city}|${state}`);
  if (canonical && city && state) keys.push(`ccs:${canonical}|${city}|${state}`);
  if (name && city && !state) keys.push(`nc:${name}|${city}`);
  if (canonical && city && !state) keys.push(`cc:${canonical}|${city}`);
  if (place.slug) keys.push(`slug:${place.slug}`);
  if (place.latitude != null && place.longitude != null
    && Number.isFinite(place.latitude) && Number.isFinite(place.longitude)) {
    keys.push(`xy:${Number(place.latitude).toFixed(4)}|${Number(place.longitude).toFixed(4)}`);
  }
  return keys;
}

function remember(index: Map<string, DuplicateRecord>, record: DuplicateRecord, extra?: {
  name?: string | null;
  canonicalName?: string | null;
  city?: string | null;
  state?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}) {
  for (const key of identityKeys({ ...record, ...extra })) {
    index.set(key, record);
  }
}

function findDuplicate(index: Map<string, DuplicateRecord>, place: BulkPlaceInput): DuplicateRecord | undefined {
  for (const key of identityKeys(place)) {
    const hit = index.get(key);
    if (hit) return hit;
  }
  return undefined;
}

export const placesBulkService = {
  async bulkImport(
    input: BulkPlaceInput[],
    options?: { overwrite?: boolean; source?: string; status?: string; userId?: string }
  ): Promise<BulkImportResult> {
    if (!Array.isArray(input)) {
      throw new Error('Bulk import payload must be an array of place records.');
    }
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
      select: {
        id: true,
        name: true,
        city: true,
        state: true,
        slug: true,
        latitude: true,
        longitude: true,
        canonicalName: true,
        status: true,
      },
    });

    const duplicateIndex = new Map<string, DuplicateRecord>();
    for (const p of existingPlaces) {
      remember(duplicateIndex, p);
    }

    const resolvedStatus = importStatus(options?.status);

    for (let i = 0; i < input.length; i += BATCH_SIZE) {
      const batch = input.slice(i, i + BATCH_SIZE);
      const toCreate: any[] = [];
      const toUpdate: any[] = [];

      for (const place of batch) {
        const coords = validateBulkCoordinates(place.latitude, place.longitude);
        if (!coords.ok) {
          result.errors++;
          result.errorDetails.push({ name: place.name, error: coords.reason });
          continue;
        }

        const existing = findDuplicate(duplicateIndex, {
          ...place,
          latitude: coords.latitude,
          longitude: coords.longitude,
        });

        if (existing) {
          const reviveRejected = existing.status === 'REJECTED';
          result.skipped++;
          result.skippedReasons.push({
            name: place.name,
            reason: reviveRejected
              ? `Duplicate of rejected "${existing.name}" — will restore instead of creating another`
              : `Duplicate: already exists as "${existing.name}" in ${existing.city}, ${existing.state}`,
          });

          if (options?.overwrite || reviveRejected) {
            toUpdate.push({ id: existing.id, ...place, latitude: coords.latitude, longitude: coords.longitude, status: resolvedStatus });
          }
          remember(duplicateIndex, existing, {
            name: place.name,
            canonicalName: place.canonicalName,
            city: place.city,
            state: place.state,
            latitude: coords.latitude,
            longitude: coords.longitude,
          });
          continue;
        }

        const pending: DuplicateRecord = {
          id: `pending:${place.name}|${place.city}|${place.state}`,
          name: place.name,
          city: place.city || '',
          state: place.state || '',
          slug: '',
          latitude: coords.latitude,
          longitude: coords.longitude,
          canonicalName: place.canonicalName,
          status: resolvedStatus,
        };
        remember(duplicateIndex, pending, place);
        toCreate.push({ ...place, latitude: coords.latitude, longitude: coords.longitude });
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
                district: p.district ?? '',
                canonicalName: p.canonicalName || null,
                imageMetadata: sanitizeImageMetadata(p.imageMetadata),
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
                status: resolvedStatus,
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

      if (toUpdate.length > 0) {
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
              if (p.district) data.district = p.district;
              if (p.canonicalName !== undefined) data.canonicalName = p.canonicalName || null;
              if (p.imageMetadata !== undefined) data.imageMetadata = sanitizeImageMetadata(p.imageMetadata);
              if (p.openingHours) data.openingHours = p.openingHours;
              if (p.ticketPrice) data.ticketPrice = p.ticketPrice;
              if (p.bestTimeToVisit) data.bestTimeToVisit = { bestMonths: p.bestTimeToVisit };
              if (p.bestTimeReason) data.bestTimeReason = p.bestTimeReason;
              if (typeof p.editorialPriority === 'number') data.editorialPriority = p.editorialPriority;
              if (p.status) data.status = p.status;
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
