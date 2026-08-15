import { prisma } from '../../../config/database';
import { env } from '../../../config/env';
import { normalizeForMatch } from '../../../shared/utils/canonicalText';
import { publicVerifiedRawSqlSuffix } from '../../places/services/places-public-visibility';
import { embeddingService, rankByEmbedding } from './embedding.service';

export type HybridSearchHit = {
  id: string;
  name: string;
  slug: string;
  publicPlaceId: string | null;
  city: string;
  state: string;
  score: number;
  signals: {
    fts: number;
    trigram: number;
    alias: number;
    vector: number;
  };
};

export type SearchInspectorHit = HybridSearchHit & {
  matchedFields: string[];
  searchReason: string;
  aliasesUsed: string[];
  fuzzyMatchScore: number;
  semanticScore: number | null;
  rankingScore: number;
};

export type SearchInspectorResult = {
  query: string;
  mode: 'lexical' | 'hybrid';
  semanticEnabled: boolean;
  hits: SearchInspectorHit[];
};

const WEIGHTS = { fts: 0.35, trigram: 0.25, alias: 0.2, vector: 0.2 };

export const hybridSearchService = {
  async search(q: string, limit = 20): Promise<HybridSearchHit[]> {
    const query = q.trim();
    if (!query) return [];

    const verifiedSuffix = publicVerifiedRawSqlSuffix();
    const qNorm = normalizeForMatch(query);

    const lexicalRows = await prisma.$queryRawUnsafe<
      Array<{
        id: string;
        name: string;
        slug: string;
        public_place_id: string | null;
        city: string;
        state: string;
        fts: number;
        trigram: number;
        alias_hit: number;
      }>
    >(
      `
      SELECT
        p.id,
        p.name,
        p.slug,
        p.public_place_id,
        p.city,
        p.state,
        COALESCE(ts_rank(p.search_vector, plainto_tsquery('english', $1)), 0) AS fts,
        COALESCE(similarity(lower(p.name), lower($1)), 0) AS trigram,
        CASE WHEN EXISTS (
          SELECT 1 FROM place_aliases pa
          WHERE pa.place_id = p.id
            AND (pa.normalized_alias = $2 OR pa.alias ILIKE '%' || $1 || '%')
        ) THEN 1 ELSE 0 END AS alias_hit
      FROM places p
      WHERE p.status = 'APPROVED'
        AND p.merged_into_id IS NULL
        ${verifiedSuffix}
        AND (
          p.search_vector @@ plainto_tsquery('english', $1)
          OR similarity(lower(p.name), lower($1)) > 0.12
          OR p.name ILIKE '%' || $1 || '%'
          OR EXISTS (
            SELECT 1 FROM place_aliases pa
            WHERE pa.place_id = p.id
              AND (pa.normalized_alias = $2 OR pa.alias ILIKE '%' || $1 || '%')
          )
          OR p.public_place_id ILIKE '%' || $1 || '%'
        )
      ORDER BY fts DESC, trigram DESC
      LIMIT $3
      `,
      query,
      qNorm,
      Math.min(limit * 3, 60),
    ).catch(async () => {
      return prisma.$queryRawUnsafe<
        Array<{
          id: string;
          name: string;
          slug: string;
          public_place_id: string | null;
          city: string;
          state: string;
          fts: number;
          trigram: number;
          alias_hit: number;
        }>
      >(
        `
        SELECT p.id, p.name, p.slug, p.public_place_id, p.city, p.state,
               COALESCE(ts_rank(p.search_vector, plainto_tsquery('english', $1)), 0) AS fts,
               0::float AS trigram,
               0::int AS alias_hit
        FROM places p
        WHERE p.status = 'APPROVED' AND p.merged_into_id IS NULL ${verifiedSuffix}
          AND p.search_vector @@ plainto_tsquery('english', $1)
        LIMIT $2
        `,
        query,
        Math.min(limit * 2, 40),
      );
    });

    const vectorScores = new Map<string, number>();
    if (env.hybridSearchEnabled && embeddingService.isConfigured()) {
      const queryEmbedding = await embeddingService.embedText(query);
      if (queryEmbedding) {
        const ids = lexicalRows.map((r) => r.id);
        const embeddings = await prisma.placeSearchEmbedding.findMany({
          where: { placeId: { in: ids } },
          select: { placeId: true, embedding: true },
        });
        const ranked = rankByEmbedding(
          queryEmbedding,
          embeddings.map((e) => ({ placeId: e.placeId, embedding: e.embedding })),
        );
        for (const [id, score] of ranked) vectorScores.set(id, score);
      }
    }

    const hits: HybridSearchHit[] = lexicalRows.map((row) => {
      const fts = Number(row.fts) || 0;
      const trigram = Number(row.trigram) || 0;
      const alias = Number(row.alias_hit) || 0;
      const vector = vectorScores.get(row.id) ?? 0;
      const score =
        fts * WEIGHTS.fts +
        trigram * WEIGHTS.trigram +
        alias * WEIGHTS.alias +
        vector * WEIGHTS.vector;
      return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        publicPlaceId: row.public_place_id,
        city: row.city,
        state: row.state,
        score,
        signals: { fts, trigram, alias, vector },
      };
    });

    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, limit);
  },

  async inspect(q: string, limit = 20): Promise<SearchInspectorResult> {
    const query = q.trim();
    if (!query) {
      return {
        query,
        mode: env.hybridSearchEnabled ? 'hybrid' : 'lexical',
        semanticEnabled: embeddingService.isConfigured(),
        hits: [],
      };
    }

    const hits = await this.search(query, limit);
    const ids = hits.map((h) => h.id);
    const aliasRows = ids.length
      ? await prisma.placeAlias.findMany({
          where: { placeId: { in: ids } },
          select: { placeId: true, alias: true, normalizedAlias: true },
        })
      : [];
    const qNorm = normalizeForMatch(query);
    const qLower = query.toLowerCase();

    const enriched: SearchInspectorHit[] = hits.map((hit) => {
      const matchedFields: string[] = [];
      if (hit.signals.fts > 0) matchedFields.push('full_text_search');
      if (hit.signals.trigram > 0.12) matchedFields.push('name_fuzzy');
      if (hit.name.toLowerCase().includes(qLower)) matchedFields.push('name_exact');
      if (hit.publicPlaceId?.toLowerCase().includes(qLower)) matchedFields.push('public_place_id');
      if (hit.city.toLowerCase().includes(qLower)) matchedFields.push('city');
      if (hit.state.toLowerCase().includes(qLower)) matchedFields.push('state');
      if (hit.signals.alias > 0) matchedFields.push('alias');

      const aliasesUsed = aliasRows
        .filter(
          (a) =>
            a.placeId === hit.id &&
            (a.normalizedAlias === qNorm || a.alias.toLowerCase().includes(qLower)),
        )
        .map((a) => a.alias);

      let searchReason = 'composite_ranking';
      if (hit.signals.alias > 0 && aliasesUsed.length) searchReason = 'alias_match';
      else if (hit.signals.fts >= hit.signals.trigram) searchReason = 'full_text_match';
      else if (hit.signals.trigram > 0.12) searchReason = 'fuzzy_name_match';
      else if (hit.signals.vector > 0) searchReason = 'semantic_similarity';

      return {
        ...hit,
        matchedFields,
        searchReason,
        aliasesUsed,
        fuzzyMatchScore: hit.signals.trigram,
        semanticScore: hit.signals.vector > 0 ? hit.signals.vector : null,
        rankingScore: hit.score,
      };
    });

    return {
      query,
      mode: env.hybridSearchEnabled ? 'hybrid' : 'lexical',
      semanticEnabled: embeddingService.isConfigured(),
      hits: enriched,
    };
  },
};
