import { prisma } from './database';
import { logger } from './logger';

const EXTENSIONS_SQL_STATEMENTS = [
  `CREATE EXTENSION IF NOT EXISTS postgis;`,
  `CREATE EXTENSION IF NOT EXISTS pg_trgm;`,
  // Speeds up fuzzy name matching (word_similarity / %)
  `CREATE INDEX IF NOT EXISTS places_name_trgm_idx ON places USING GIN (name gin_trgm_ops);`,

  `CREATE OR REPLACE FUNCTION places_search_update() RETURNS trigger AS $$
  DECLARE
    alias_blob TEXT;
  BEGIN
    SELECT COALESCE(string_agg(pa.alias, ' '), '') INTO alias_blob
    FROM place_aliases pa WHERE pa.place_id = NEW.id;

    NEW.search_vector := to_tsvector('english',
      COALESCE(NEW.name, '') || ' ' ||
      COALESCE(alias_blob, '') || ' ' ||
      COALESCE(array_to_string(NEW.search_keywords, ' '), '') || ' ' ||
      COALESCE(NEW.description, '') || ' ' ||
      COALESCE(NEW.category, '') || ' ' ||
      COALESCE(NEW.subcategory, '') || ' ' ||
      COALESCE(NEW.city, '') || ' ' ||
      COALESCE(NEW.district, '') || ' ' ||
      COALESCE(NEW.state, '') || ' ' ||
      COALESCE(array_to_string(NEW.tags, ' '), '')
    );
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;`,

  `CREATE OR REPLACE FUNCTION place_aliases_refresh_parent_search() RETURNS trigger AS $$
  BEGIN
    UPDATE places SET name = name WHERE id = COALESCE(NEW.place_id, OLD.place_id);
    RETURN COALESCE(NEW, OLD);
  END;
  $$ LANGUAGE plpgsql;`,

  `CREATE OR REPLACE TRIGGER trg_place_aliases_search
    AFTER INSERT OR UPDATE OR DELETE ON place_aliases
    FOR EACH ROW EXECUTE FUNCTION place_aliases_refresh_parent_search();`,

  `CREATE OR REPLACE TRIGGER trg_places_search
    BEFORE INSERT OR UPDATE ON "places"
    FOR EACH ROW EXECUTE FUNCTION places_search_update();`,

  `CREATE OR REPLACE FUNCTION places_location_sync() RETURNS trigger AS $$
  BEGIN
    IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
      NEW.location := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
    END IF;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;`,

  `CREATE OR REPLACE TRIGGER trg_places_location
    BEFORE INSERT OR UPDATE OF latitude, longitude ON "places"
    FOR EACH ROW EXECUTE FUNCTION places_location_sync();`,
];

/** Full-table search vector rebuild — opt-in only (113k+ rows on every boot causes deploy timeouts). */
const REBUILD_SEARCH_VECTORS_SQL = `UPDATE "places" SET "name" = "name";`;

async function requiredExtensionsPresent(): Promise<{ postgis: boolean; pg_trgm: boolean }> {
  const rows = await prisma.$queryRaw<{ extname: string }[]>`
    SELECT extname FROM pg_extension WHERE extname IN ('postgis', 'pg_trgm')
  `.catch(() => []);
  const names = new Set(rows.map((r) => r.extname));
  return { postgis: names.has('postgis'), pg_trgm: names.has('pg_trgm') };
}

export async function ensureDbExtensions(): Promise<void> {
  for (const statement of EXTENSIONS_SQL_STATEMENTS) {
    try {
      await prisma.$executeRawUnsafe(statement);
    } catch (error) {
      // Pooler / limited roles may reject DDL even when extensions already exist from migrations.
      logger.warn(
        { err: error, sql: statement.slice(0, 96) },
        'Database DDL statement failed (continuing if extensions already present)',
      );
    }
  }

  if (process.env.REBUILD_PLACE_SEARCH_VECTORS === '1') {
    logger.info('Rebuilding place search vectors (REBUILD_PLACE_SEARCH_VECTORS=1)');
    await prisma.$executeRawUnsafe(REBUILD_SEARCH_VECTORS_SQL);
  }

  const present = await requiredExtensionsPresent();
  if (!present.postgis || !present.pg_trgm) {
    logger.error({ present }, 'Required database extensions missing (postgis, pg_trgm)');
    throw new Error('Required database extensions missing: postgis and/or pg_trgm');
  }

  logger.info('Database extensions and triggers applied successfully');
}
