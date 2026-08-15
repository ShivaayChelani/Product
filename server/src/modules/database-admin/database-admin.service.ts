import { PrismaClient } from '@prisma/client';
import { prisma } from '../../config/database';
import { ensureDbExtensions } from '../../config/db-extensions';
import { ensureSeedData } from '../../config/db-seed';
import { settingsService } from '../settings/settings.service';
import { buildDatabaseQualityReport } from '../canonical/services/database-quality-report.service';

export type MaskedConnection = {
  provider: 'render' | 'local' | 'postgresql' | 'unknown';
  host: string;
  port: string;
  database: string;
  sslMode: string;
  pooled: boolean;
  region: string | null;
  connectionLimit: string | null;
  poolTimeout: string | null;
};

export type EnvCheck = {
  key: string;
  status: 'ok' | 'warn' | 'missing' | 'info';
  message: string;
};

function maskDatabaseUrl(url: string | undefined): MaskedConnection | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const isRender = host.includes('render.com') || host.includes('oregon-postgres.render.com')
      || host.includes('singapore-postgres.render.com')
      || host.includes('frankfurt-postgres.render.com');
    const isLocal = host === 'localhost' || host === '127.0.0.1';
    const isPooler =
      host.includes('-pooler') || u.searchParams.get('pgbouncer') === 'true';
    const renderRegionMatch = host.match(/\.([a-z0-9-]+)-postgres\.render\.com$/);
    return {
      provider: isRender
        ? 'render'
        : isLocal
          ? 'local'
          : 'postgresql',
      host: u.hostname,
      port: u.port || '5432',
      database: u.pathname.replace(/^\//, '') || 'postgres',
      sslMode: u.searchParams.get('sslmode') || (isRender ? 'require' : 'prefer'),
      pooled: isPooler,
      region: renderRegionMatch?.[1] ?? null,
      connectionLimit: u.searchParams.get('connection_limit'),
      poolTimeout: u.searchParams.get('pool_timeout'),
    };
  } catch {
    return {
      provider: 'unknown',
      host: '(invalid url)',
      port: '',
      database: '',
      sslMode: '',
      pooled: false,
      region: null,
      connectionLimit: null,
      poolTimeout: null,
    };
  }
}

async function measureLatency(
  queryFn: () => Promise<unknown>,
): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    await queryFn();
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : 'Connection failed',
    };
  }
}

async function getExtensionsStatus() {
  const rows = await prisma.$queryRaw<{ extname: string; extversion: string }[]>`
    SELECT extname, extversion FROM pg_extension
    WHERE extname IN ('postgis', 'pg_trgm', 'plpgsql')
    ORDER BY extname
  `.catch(() => []);

  const byName = Object.fromEntries(rows.map((r) => [r.extname, r.extversion]));
  const hasPostgis = Boolean(byName.postgis);
  const hasPgTrgm = Boolean(byName.pg_trgm);

  const indexRows = await prisma.$queryRaw<{ indexname: string }[]>`
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'places' AND indexname = 'places_name_trgm_idx'
  `.catch(() => []);

  return {
    postgis: hasPostgis ? byName.postgis : null,
    pgTrgm: hasPgTrgm ? byName.pg_trgm : null,
    searchIndex: indexRows.length > 0,
    allRequired: hasPostgis && hasPgTrgm,
  };
}

async function getPostgresInfo() {
  const [versionRow, sizeRow, connRow] = await Promise.all([
    prisma.$queryRaw<{ version: string }[]>`SELECT version() AS version`.catch(() => []),
    prisma.$queryRaw<{ size_bytes: bigint }[]>`
      SELECT pg_database_size(current_database()) AS size_bytes
    `.catch(() => []),
    prisma.$queryRaw<{ active: bigint; idle: bigint; total: bigint }[]>`
      SELECT
        COUNT(*) FILTER (WHERE state = 'active')::bigint AS active,
        COUNT(*) FILTER (WHERE state = 'idle')::bigint AS idle,
        COUNT(*)::bigint AS total
      FROM pg_stat_activity
      WHERE datname = current_database()
    `.catch(() => []),
  ]);

  const version = versionRow[0]?.version ?? 'unknown';
  return {
    version: version.split(' on ')[0],
    sizeBytes: Number(sizeRow[0]?.size_bytes ?? 0),
    connections: {
      active: Number(connRow[0]?.active ?? 0),
      idle: Number(connRow[0]?.idle ?? 0),
      total: Number(connRow[0]?.total ?? 0),
    },
  };
}

async function getMigrationStatus() {
  const pendingRows = await prisma.$queryRaw<
    { migration_name: string; finished_at: Date | null; applied_steps_count: number }[]
  >`
    SELECT migration_name, finished_at, applied_steps_count
    FROM _prisma_migrations
    WHERE finished_at IS NULL
    ORDER BY started_at DESC NULLS LAST
    LIMIT 20
  `.catch(() => []);

  const recentRows = await prisma.$queryRaw<
    { migration_name: string; finished_at: Date | null; applied_steps_count: number }[]
  >`
    SELECT migration_name, finished_at, applied_steps_count
    FROM _prisma_migrations
    WHERE finished_at IS NOT NULL
    ORDER BY finished_at DESC
    LIMIT 8
  `.catch(() => []);

  const total = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count FROM _prisma_migrations WHERE finished_at IS NOT NULL
  `.catch(() => [{ count: 0n }]);

  return {
    totalApplied: Number(total[0]?.count ?? 0),
    pending: pendingRows.length,
    recent: [
      ...pendingRows.map((r) => ({
        name: r.migration_name,
        finishedAt: null as string | null,
        steps: r.applied_steps_count,
      })),
      ...recentRows.map((r) => ({
        name: r.migration_name,
        finishedAt: r.finished_at?.toISOString() ?? null,
        steps: r.applied_steps_count,
      })),
    ].slice(0, 12),
  };
}

function buildEnvChecks(): EnvCheck[] {
  const checks: EnvCheck[] = [];
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const directUrl = process.env.DIRECT_URL?.trim();
  const isProd = process.env.NODE_ENV === 'production';

  checks.push({
    key: 'DATABASE_URL',
    status: databaseUrl ? 'ok' : 'missing',
    message: databaseUrl ? 'Configured (pooled runtime connection)' : 'Missing — API cannot start',
  });

  checks.push({
    key: 'DIRECT_URL',
    status: directUrl ? 'ok' : isProd ? 'warn' : 'info',
    message: directUrl
      ? 'Configured (migrations & batch jobs)'
      : isProd
        ? 'Missing — prisma migrate deploy may fail against a pooled DATABASE_URL'
        : 'Optional in development',
  });

  if (databaseUrl) {
    const masked = maskDatabaseUrl(databaseUrl);
    if (masked?.provider === 'render') {
      checks.push({
        key: 'DATABASE_PROVIDER',
        status: 'ok',
        message: 'Render PostgreSQL detected',
      });
    }
  }

  if (databaseUrl && directUrl) {
    const pooled = maskDatabaseUrl(databaseUrl);
    const direct = maskDatabaseUrl(directUrl);
    if (pooled?.host === direct?.host && pooled?.pooled === direct?.pooled) {
      checks.push({
        key: 'DB_URL_SPLIT',
        status: 'info',
        message:
          'DATABASE_URL and DIRECT_URL look identical — fine for Render external connections; split only if using a pooler',
      });
    } else {
      checks.push({
        key: 'DB_URL_SPLIT',
        status: 'ok',
        message: 'Runtime URL and direct migration URL are split',
      });
    }
  }

  checks.push({
    key: 'REBUILD_PLACE_SEARCH_VECTORS',
    status: process.env.REBUILD_PLACE_SEARCH_VECTORS === '1' ? 'warn' : 'ok',
    message:
      process.env.REBUILD_PLACE_SEARCH_VECTORS === '1'
        ? 'Enabled — full-table search rebuild on boot (avoid on large production DBs)'
        : 'Disabled (recommended for production)',
  });

  if (isProd && process.env.SYNC_CANONICAL_CREDENTIALS?.trim().toLowerCase() === 'true') {
    checks.push({
      key: 'SYNC_CANONICAL_CREDENTIALS',
      status: 'warn',
      message: 'Enabled on production — overwrites canonical admin passwords on every boot',
    });
  }

  return checks;
}

async function pingDirectConnection(): Promise<{
  ok: boolean;
  latencyMs: number;
  error?: string;
} | null> {
  const directUrl = process.env.DIRECT_URL?.trim();
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!directUrl || directUrl === databaseUrl) return null;

  const directPrisma = new PrismaClient({ datasources: { db: { url: directUrl } } });
  try {
    return await measureLatency(() => directPrisma.$queryRaw`SELECT 1`);
  } finally {
    await directPrisma.$disconnect().catch(() => {});
  }
}

export const databaseAdminService = {
  maskDatabaseUrl,

  async getOverview() {
    const databaseUrl = process.env.DATABASE_URL?.trim();
    const directUrl = process.env.DIRECT_URL?.trim();

    const [ping, extensions, postgres, migrations, directPing] = await Promise.all([
      measureLatency(() => prisma.$queryRaw`SELECT 1`),
      getExtensionsStatus(),
      getPostgresInfo(),
      getMigrationStatus(),
      pingDirectConnection(),
    ]);

    const envChecks = buildEnvChecks();
    const hasBlockers = envChecks.some((c) => c.status === 'missing');
    const status = !ping.ok ? 'down' : !extensions.allRequired || hasBlockers ? 'degraded' : 'healthy';

    return {
      generatedAt: new Date().toISOString(),
      status,
      connection: {
        pooled: maskDatabaseUrl(databaseUrl),
        direct: maskDatabaseUrl(directUrl),
        ping,
        directPing,
      },
      postgres,
      extensions,
      migrations,
      envChecks,
      nodeEnv: process.env.NODE_ENV || 'development',
    };
  },

  async getTableStats() {
    const rows = await prisma.$queryRaw<
      { table_name: string; row_estimate: bigint; total_bytes: bigint }[]
    >`
      SELECT
        relname AS table_name,
        GREATEST(reltuples, 0)::bigint AS row_estimate,
        pg_total_relation_size(relid) AS total_bytes
      FROM pg_stat_user_tables
      ORDER BY pg_total_relation_size(relid) DESC
      LIMIT 40
    `.catch(() => []);

    return {
      generatedAt: new Date().toISOString(),
      tables: rows.map((r) => ({
        table: r.table_name,
        rowEstimate: Number(r.row_estimate),
        sizeBytes: Number(r.total_bytes),
      })),
    };
  },

  async getQualityReport() {
    return buildDatabaseQualityReport();
  },

  async ensureExtensions() {
    await ensureDbExtensions();
    return getExtensionsStatus();
  },

  async runStartupSeed() {
    await ensureSeedData();
    return { seeded: true, at: new Date().toISOString() };
  },

  async seedSettingsDefaults() {
    await settingsService.seedDefaults();
    return { seeded: true, at: new Date().toISOString() };
  },

  async runDuplicateScan(options: { precision?: number; prefixBatch?: number; prefixOffset?: number }) {
    const { runGeohashBlockedDuplicateScanPage } = await import(
      '../canonical/services/corpus-dedupe.service'
    );
    return runGeohashBlockedDuplicateScanPage({
      precision: options.precision ?? 6,
      prefixBatch: options.prefixBatch ?? 100,
      prefixOffset: options.prefixOffset ?? 0,
    });
  },

  async runAutoMerge(options: { minConfidence?: number; limit?: number; mergedById: string }) {
    const { autoMergeHighConfidenceCandidates } = await import(
      '../canonical/services/corpus-dedupe.service'
    );
    return autoMergeHighConfidenceCandidates({
      minConfidence: options.minConfidence ?? 0.86,
      limit: options.limit ?? 50,
      mergedById: options.mergedById,
    });
  },

  async getDataIntegrityStatus() {
    const [
      total,
      missingCoords,
      missingGeohash,
      missingExternalId,
      dupOpen,
      noDescription,
      syntheticRatings,
      verified,
      draft,
    ] = await Promise.all([
      prisma.place.count({ where: { mergedIntoId: null } }),
      prisma.place.count({
        where: { mergedIntoId: null, OR: [{ latitude: null }, { longitude: null }] },
      }),
      prisma.place.count({ where: { mergedIntoId: null, geohash: null, latitude: { not: null } } }),
      prisma.place.count({ where: { mergedIntoId: null, externalId: null } }),
      prisma.placeDuplicateCandidate.count({ where: { status: 'OPEN' } }),
      prisma.place.count({
        where: { mergedIntoId: null, description: '' },
      }),
      prisma.place.count({
        where: {
          mergedIntoId: null,
          reviewCount: 0,
          OR: [{ rating: { not: null } }, { bayesianRating: { not: null } }],
        },
      }),
      prisma.place.count({ where: { mergedIntoId: null, dataQuality: 'VERIFIED' } }),
      prisma.place.count({ where: { mergedIntoId: null, dataQuality: 'DRAFT' } }),
    ]);

    let checkpoint: Record<string, unknown> | null = null;
    try {
      const fs = await import('fs');
      const path = await import('path');
      const cpPath = path.resolve('reports/ops/data-integrity-checkpoint.json');
      if (fs.existsSync(cpPath)) {
        checkpoint = JSON.parse(fs.readFileSync(cpPath, 'utf8'));
      }
    } catch {
      checkpoint = null;
    }

    return {
      generatedAt: new Date().toISOString(),
      dataSources: ['Wikidata', 'OpenStreetMap', 'Nominatim', 'Wikipedia'],
      noGoogleApiRequired: true,
      places: { total, verified, draft },
      gaps: {
        missingCoordinates: missingCoords,
        missingGeohash,
        missingExternalId,
        missingDescription: noDescription,
        duplicateCandidatesOpen: dupOpen,
        syntheticRatings,
      },
      checkpoint,
      recommendedPhases: [
        { phase: 'strip-fake-ratings', label: 'Remove fake ratings (no review backing)' },
        { phase: 'backfill-geohash', label: 'Backfill geohash for duplicate scanning' },
        { phase: 'dedupe', label: 'Scan and queue duplicate pairs' },
        { phase: 'resolve-ids', label: 'Link places to Wikidata/OSM IDs' },
        { phase: 'enrich-wikidata', label: 'Fill descriptions from Wikidata + Wikipedia' },
        { phase: 'enrich-osm', label: 'Fill hours, fees, tags from OSM' },
        { phase: 'geocode', label: 'Fill city/state from coordinates (Nominatim)' },
      ],
    };
  },

  async runDataIntegrityPhase(phase: string, limit = 500) {
    switch (phase) {
      case 'strip-fake-ratings': {
        const result = await prisma.place.updateMany({
          where: {
            mergedIntoId: null,
            reviewCount: 0,
            OR: [{ rating: { not: null } }, { bayesianRating: { not: null } }],
          },
          data: { rating: null, bayesianRating: null, popularityScore: null },
        });
        return { phase, clearedRatings: result.count };
      }
      case 'backfill-geohash': {
        const { backfillPlaceGeohashes } = await import('../canonical/services/duplicate-scan.service');
        const updated = await backfillPlaceGeohashes(Math.min(limit, 10000));
        return { phase, geohashesBackfilled: updated };
      }
      case 'dedupe': {
        const { runGeohashBlockedDuplicateScanPage } = await import(
          '../canonical/services/corpus-dedupe.service'
        );
        const scan = await runGeohashBlockedDuplicateScanPage({
          precision: 6,
          prefixBatch: Math.min(limit, 300),
          prefixOffset: 0,
        });
        return { phase, scan };
      }
      case 'resolve-ids':
      case 'enrich-wikidata':
      case 'enrich-osm':
      case 'geocode': {
        return {
          phase,
          message: `Run from server CLI (uses free Wikidata/OSM/Nominatim — no Google key): npm run job:data-integrity -- --phase=${phase} --limit=${limit}`,
          cliCommand: `npm run job:data-integrity -- --phase=${phase} --limit=${limit}`,
        };
      }
      default:
        throw new Error(`Unknown phase: ${phase}`);
    }
  },
};
