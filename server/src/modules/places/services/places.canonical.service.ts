import { PlaceAliasType, PlaceDataQuality, PlaceStatus } from '@prisma/client';
import { prisma } from '../../../config/database';
import { ApiError } from '../../../shared/utils/ApiError';
import { normalizeForMatch, nameSimilarityScore } from '../../../shared/utils/canonicalText';
import { isCoordinateInIndia } from '../../../shared/utils/indiaGeo';
import { generateSlug, placeListSelect } from './places.helpers';
import { placesQualityService } from './places.quality.service';
import { withPlaceGeohash } from './place-geo.helpers';

const DUPLICATE_RADIUS_M = 1500;
const NAME_MATCH_THRESHOLD = 0.82;

export type CanonicalUpsertInput = {
  name: string;
  description: string;
  shortDescription?: string;
  latitude: number;
  longitude: number;
  category: string;
  subcategory?: string;
  state: string;
  district?: string;
  city?: string;
  village?: string;
  fullAddress?: string;
  history?: string;
  tags?: string[];
  searchKeywords?: string[];
  aliases?: { alias: string; locale?: string; aliasType?: PlaceAliasType; source?: string }[];
  externalId?: string;
  website?: string;
  googleMapsUrl?: string;
  /** Only from verified reviews — never synthetic */
  rating?: number | null;
  reviewCount?: number;
  markVerified?: boolean;
};

export type DuplicateCandidate = {
  placeId: string;
  name: string;
  slug: string;
  state: string;
  district: string;
  distanceM: number;
  nameScore: number;
  reason: string;
};

export const placesCanonicalService = {
  async resolveCanonicalPlaceId(identifier: string): Promise<string> {
    const byId = await prisma.place.findUnique({
      where: { id: identifier },
      select: { id: true, mergedIntoId: true },
    });
    if (byId) return this.followMergeChain(byId.id, byId.mergedIntoId);

    const bySlug = await prisma.place.findUnique({
      where: { slug: identifier },
      select: { id: true, mergedIntoId: true },
    });
    if (bySlug) return this.followMergeChain(bySlug.id, bySlug.mergedIntoId);

    const norm = normalizeForMatch(identifier);
    const aliasHit = await prisma.placeAlias.findFirst({
      where: { normalizedAlias: norm },
      select: { place: { select: { id: true, mergedIntoId: true } } },
    });
    if (aliasHit?.place) {
      return this.followMergeChain(aliasHit.place.id, aliasHit.place.mergedIntoId);
    }

    throw new ApiError(404, 'Place not found.');
  },

  async followMergeChain(placeId: string, mergedIntoId: string | null): Promise<string> {
    let current = placeId;
    let next = mergedIntoId;
    let hops = 0;
    while (next && hops < 8) {
      const row = await prisma.place.findUnique({
        where: { id: next },
        select: { id: true, mergedIntoId: true },
      });
      if (!row) break;
      current = row.id;
      next = row.mergedIntoId;
      hops++;
    }
    return current;
  },

  async findDuplicateCandidates(input: {
    name: string;
    latitude: number;
    longitude: number;
    state?: string;
    district?: string;
    category?: string;
    excludePlaceId?: string;
  }): Promise<DuplicateCandidate[]> {
    if (!isCoordinateInIndia(input.latitude, input.longitude)) {
      return [];
    }

    const rows: {
      id: string;
      name: string;
      slug: string;
      state: string;
      district: string;
      category: string;
      latitude: number | null;
      longitude: number | null;
      dist_m: number;
    }[] = await prisma.$queryRaw`
      SELECT p.id, p.name, p.slug, p.state, p.district, p.category, p.latitude, p.longitude,
        ST_Distance(
          p.location::geography,
          ST_SetSRID(ST_MakePoint(${input.longitude}, ${input.latitude}), 4326)::geography
        ) AS dist_m
      FROM places p
      WHERE p.merged_into_id IS NULL
        AND p.status IN ('APPROVED', 'PENDING')
        AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL
        AND ST_DWithin(
          p.location::geography,
          ST_SetSRID(ST_MakePoint(${input.longitude}, ${input.latitude}), 4326)::geography,
          ${DUPLICATE_RADIUS_M}
        )
      ORDER BY dist_m ASC
      LIMIT 40
    `;

    const candidates: DuplicateCandidate[] = [];
    const candidateIds = rows
      .map((r) => r.id)
      .filter((id) => !(input.excludePlaceId && id === input.excludePlaceId));

    const aliasRows = candidateIds.length
      ? await prisma.placeAlias.findMany({
          where: { placeId: { in: candidateIds } },
          select: { placeId: true, alias: true },
        })
      : [];
    const aliasesByPlace = new Map<string, string[]>();
    for (const a of aliasRows) {
      const list = aliasesByPlace.get(a.placeId) ?? [];
      list.push(a.alias);
      aliasesByPlace.set(a.placeId, list);
    }

    for (const row of rows) {
      if (input.excludePlaceId && row.id === input.excludePlaceId) continue;
      const nameScore = nameSimilarityScore(input.name, row.name);
      const stateMatch = !input.state || !row.state
        || normalizeForMatch(row.state) === normalizeForMatch(input.state);
      const categoryMatch = !input.category
        || normalizeForMatch(row.category) === normalizeForMatch(input.category);

      let aliasScore = 0;
      for (const alias of aliasesByPlace.get(row.id) ?? []) {
        aliasScore = Math.max(aliasScore, nameSimilarityScore(input.name, alias));
      }

      const bestNameScore = Math.max(nameScore, aliasScore);
      const geoClose = row.dist_m <= 400;
      const isDup =
        bestNameScore >= NAME_MATCH_THRESHOLD
        || (bestNameScore >= 0.65 && geoClose && stateMatch)
        || (geoClose && categoryMatch && bestNameScore >= 0.55);

      if (!isDup) continue;

      candidates.push({
        placeId: row.id,
        name: row.name,
        slug: row.slug,
        state: row.state,
        district: row.district,
        distanceM: Math.round(row.dist_m),
        nameScore: Math.round(bestNameScore * 100) / 100,
        reason: bestNameScore >= NAME_MATCH_THRESHOLD ? 'name_or_alias_match' : 'geo_name_cluster',
      });
    }

    return candidates;
  },

  async addAliases(
    placeId: string,
    aliases: { alias: string; locale?: string; aliasType?: PlaceAliasType; source?: string }[],
  ) {
    const canonicalId = await this.resolveCanonicalPlaceId(placeId);
    const created: string[] = [];
    for (const a of aliases) {
      const alias = a.alias.trim();
      if (!alias) continue;
      const normalizedAlias = normalizeForMatch(alias);
      if (!normalizedAlias) continue;
      await prisma.placeAlias.upsert({
        where: { placeId_normalizedAlias: { placeId: canonicalId, normalizedAlias } },
        create: {
          placeId: canonicalId,
          alias,
          normalizedAlias,
          locale: a.locale,
          aliasType: a.aliasType ?? PlaceAliasType.SEARCH_KEYWORD,
          source: a.source,
        },
        update: {
          alias,
          locale: a.locale ?? undefined,
          aliasType: a.aliasType ?? undefined,
          source: a.source ?? undefined,
        },
      });
      created.push(alias);
    }
    if (created.length) {
      await prisma.place.update({
        where: { id: canonicalId },
        data: { name: (await prisma.place.findUnique({ where: { id: canonicalId }, select: { name: true } }))!.name },
      });
    }
    return { placeId: canonicalId, aliases: created };
  },

  async mergeIntoCanonical(params: {
    canonicalPlaceId: string;
    duplicatePlaceIds: string[];
    mergedById?: string;
    reason?: string;
  }) {
    const { placesMergeService } = await import('./places.merge.service');
    const canonicalId = await this.resolveCanonicalPlaceId(params.canonicalPlaceId);
    return placesMergeService.mergeDuplicates({
      ...params,
      canonicalPlaceId: canonicalId,
    });
  },

  async upsertCanonical(input: CanonicalUpsertInput, actorId?: string) {
    if (!isCoordinateInIndia(input.latitude, input.longitude)) {
      throw new ApiError(400, 'Coordinates must be within India.');
    }

    const duplicates = await this.findDuplicateCandidates({
      name: input.name,
      latitude: input.latitude,
      longitude: input.longitude,
      state: input.state,
      district: input.district,
      category: input.category,
    });

    if (duplicates.length > 0) {
      throw new ApiError(
        409,
        'Potential duplicate place detected.',
        true,
        'DUPLICATE_CANDIDATES',
        { candidates: duplicates },
      );
    }

    const quality = placesQualityService.canMarkVerified({
      name: input.name,
      description: input.description,
      latitude: input.latitude,
      longitude: input.longitude,
      category: input.category,
      state: input.state,
      district: input.district,
      rating: input.rating,
      reviewCount: input.reviewCount ?? 0,
      dataQuality: input.markVerified ? PlaceDataQuality.VERIFIED : PlaceDataQuality.PENDING_REVIEW,
    });

    const dataQuality = input.markVerified && quality.verified
      ? PlaceDataQuality.VERIFIED
      : PlaceDataQuality.PENDING_REVIEW;

    const slug = await generateSlug(input.name);
    const place = await prisma.place.create({
      select: placeListSelect,
      data: withPlaceGeohash({
        name: input.name,
        slug,
        description: input.description,
        shortDescription: input.shortDescription ?? input.description.slice(0, 200),
        latitude: input.latitude,
        longitude: input.longitude,
        category: input.category,
        subcategory: input.subcategory,
        state: input.state,
        district: input.district ?? '',
        city: input.city ?? '',
        village: input.village ?? '',
        fullAddress: input.fullAddress,
        history: input.history,
        tags: input.tags ?? [],
        searchKeywords: input.searchKeywords ?? [],
        website: input.website,
        googleMapsUrl: input.googleMapsUrl,
        externalId: input.externalId,
        rating: input.reviewCount ? input.rating ?? null : null,
        reviewCount: input.reviewCount ?? 0,
        status: PlaceStatus.APPROVED,
        dataQuality,
        verificationScore: placesQualityService.computeVerificationScore(quality.failures.length),
        lastVerifiedAt: dataQuality === PlaceDataQuality.VERIFIED ? new Date() : null,
        verificationLevel: dataQuality === PlaceDataQuality.VERIFIED ? 3 : 1,
        submittedById: actorId,
        approvedById: actorId,
        reviewedAt: new Date(),
        source: 'ADMIN',
      }),
    });

    if (input.aliases?.length) {
      await this.addAliases(place.id, input.aliases);
    }

    return place;
  },

  async searchByAliasOrName(q: string, limit = 10): Promise<{ placeId: string; matchedAs: string }[]> {
    const trimmed = q.trim();
    if (!trimmed) return [];

    const norm = normalizeForMatch(trimmed);
    const aliasExact = await prisma.placeAlias.findMany({
      where: { normalizedAlias: norm },
      take: limit,
      select: { alias: true, place: { select: { id: true, mergedIntoId: true } } },
    });

    const hits: { placeId: string; matchedAs: string }[] = [];
    for (const row of aliasExact) {
      const id = await this.followMergeChain(row.place.id, row.place.mergedIntoId);
      hits.push({ placeId: id, matchedAs: row.alias });
    }
    if (hits.length) return hits;

    const fuzzy: { id: string; name: string; merged_into_id: string | null; sim: number }[] =
      await prisma.$queryRaw`
        SELECT p.id, p.name, p.merged_into_id,
          GREATEST(similarity(p.name, ${trimmed}), word_similarity(p.name, ${trimmed})) AS sim
        FROM places p
        WHERE p.merged_into_id IS NULL
          AND p.status = 'APPROVED'
          AND (
            similarity(p.name, ${trimmed}) > 0.35
            OR word_similarity(p.name, ${trimmed}) > 0.5
          )
        ORDER BY sim DESC
        LIMIT ${limit}
      `;

    const out: { placeId: string; matchedAs: string }[] = [];
    for (const row of fuzzy) {
      const id = await this.followMergeChain(row.id, row.merged_into_id);
      out.push({ placeId: id, matchedAs: row.name });
    }
    return out;
  },
};
