-- Community Events — standalone `events` + `event_reports` tables.
--
-- STATUS: NOT EXECUTED against production as part of this change. This file is
-- the migration Prisma will apply via `prisma migrate deploy` when an operator
-- runs it deliberately against the verified target database.
--
-- WHY A NEW TABLE INSTEAD OF EXTENDING `place_events`
--   `place_events` is structurally incapable of Community Events: it has no
--   latitude/longitude (so it can never be pinned on a map), no owner, no
--   moderation status, and no independent address. Every one of those is
--   required. See PALSAFAR_EXISTING_EVENTS_MAP_FORENSIC_AUDIT.md defects C1–C3.
--
-- SAFETY PROPERTIES OF THIS FILE
--   1. NO destructive DDL. Nothing is dropped, truncated, or recreated. The
--      only dropped object is the `reels.event_id` foreign key, which is
--      re-created 40 lines later against `events` in the same transaction — so
--      there is no window in which `reels.event_id` is unconstrained.
--   2. `place_events` is RETAINED. Its rows are copied, not moved, so the
--      legacy data still exists afterwards and the copy can be re-verified.
--   3. Row IDs are PRESERVED. Every `place_events.id` becomes the matching
--      `events.id`, which is what makes the `reels.event_id` migration
--      deterministic rather than a lookup table.
--   4. Two guard blocks ABORT the whole transaction (PostgreSQL has
--      transactional DDL) if any row or any Reel relation would be lost.
--   5. `CREATE INDEX` is used, never `CREATE INDEX CONCURRENTLY`: `prisma
--      migrate deploy` wraps each migration in a transaction and PostgreSQL
--      rejects CONCURRENTLY inside one. `events` starts empty, so the builds are
--      instantaneous.

-- Guard: `events.location` needs PostGIS. The baseline already creates it; this
-- makes the migration self-sufficient on a database where it is missing.
CREATE EXTENSION IF NOT EXISTS postgis;

-- ── 1. Audit actions ────────────────────────────────────────────────────────
-- `ALTER TYPE ... ADD VALUE` is allowed inside a transaction on PG 12+, as long
-- as the new value is not USED in the same transaction. This migration only
-- writes them later, from the application.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EVENT_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EVENT_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EVENT_APPROVED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EVENT_REJECTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EVENT_UNPUBLISHED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EVENT_CANCELLED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EVENT_FEATURED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EVENT_DELETED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EVENT_REPORTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EVENT_REPORT_RESOLVED';

-- ── 2. Enums ────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EventType') THEN
    CREATE TYPE "EventType" AS ENUM (
      'FESTIVAL', 'RELIGIOUS', 'CULTURAL', 'FAIR_MELA', 'CONCERT',
      'EXHIBITION', 'SPORTS', 'FOOD', 'COMMUNITY', 'LOCAL', 'OTHER'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EventStatus') THEN
    CREATE TYPE "EventStatus" AS ENUM (
      'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EventReportReason') THEN
    CREATE TYPE "EventReportReason" AS ENUM (
      'FAKE_EVENT', 'WRONG_LOCATION', 'DUPLICATE', 'CANCELLED',
      'INAPPROPRIATE', 'MISLEADING', 'OTHER'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EventReportStatus') THEN
    CREATE TYPE "EventReportStatus" AS ENUM (
      'PENDING', 'REVIEWED', 'RESOLVED', 'DISMISSED'
    );
  END IF;
END
$$;

-- ── 3. events ───────────────────────────────────────────────────────────────
CREATE TABLE "events" (
    "id"                    TEXT NOT NULL,
    "slug"                  TEXT NOT NULL,
    "title"                 TEXT NOT NULL,
    "description"           TEXT,
    "event_type"            "EventType" NOT NULL DEFAULT 'OTHER',
    "status"                "EventStatus" NOT NULL DEFAULT 'PENDING',

    "start_date"            TIMESTAMP(3) NOT NULL,
    -- NOT NULL, not optional: the public feed is a single `end_date >= today`
    -- comparison, so a NULL here would make the row silently invisible forever
    -- instead of failing loudly. The write path defaults endDate to startDate.
    "end_date"              TIMESTAMP(3) NOT NULL,
    "start_time"            TEXT,
    "end_time"              TEXT,

    "latitude"              DOUBLE PRECISION,
    "longitude"             DOUBLE PRECISION,
    "location"              geography(Point,4326),

    "address"               TEXT,
    "city"                  TEXT NOT NULL DEFAULT '',
    "state"                 TEXT NOT NULL DEFAULT '',
    "country"               TEXT NOT NULL DEFAULT 'India',

    "cover_image"           TEXT,
    "images"                TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

    "created_by_id"         TEXT,
    "approved_by_id"        TEXT,
    "approved_at"           TIMESTAMP(3),
    "rejected_at"           TIMESTAMP(3),
    "rejection_reason"      TEXT,
    -- CANCELLED is distinct from REJECTED: the organiser (not moderation)
    -- withdrew an event that had already been published, so the public needs to
    -- know it was withdrawn rather than never approved.
    "cancelled_at"          TIMESTAMP(3),
    "cancellation_reason"   TEXT,
    "published_at"          TIMESTAMP(3),
    "is_featured"           BOOLEAN NOT NULL DEFAULT false,

    "linked_place_id"       TEXT,
    "linked_vendor_id"      TEXT,

    "legacy_place_event_id" TEXT,

    "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"            TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- ── 4. event_reports ────────────────────────────────────────────────────────
CREATE TABLE "event_reports" (
    "id"         TEXT NOT NULL,
    "event_id"   TEXT NOT NULL,
    "user_id"    TEXT NOT NULL,
    "reason"     "EventReportReason" NOT NULL,
    "details"    TEXT,
    "status"     "EventReportStatus" NOT NULL DEFAULT 'PENDING',
    -- Resolution trail, so an admin decision on a report is auditable rather
    -- than the row just silently flipping to RESOLVED.
    "reviewed_by_id"  TEXT,
    "reviewed_at"     TIMESTAMP(3),
    "resolution_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_reports_pkey" PRIMARY KEY ("id")
);

-- One user may raise each distinct reason once per event; re-reporting the
-- same reason is a no-op rather than a queue-farming vector.
CREATE UNIQUE INDEX "event_reports_event_user_reason_key"
    ON "event_reports"("event_id", "user_id", "reason");
CREATE INDEX "event_reports_event_id_idx" ON "event_reports"("event_id");
CREATE INDEX "event_reports_user_id_idx"  ON "event_reports"("user_id");
CREATE INDEX "event_reports_status_idx"   ON "event_reports"("status");

-- ── 5. Coordinate sync trigger ──────────────────────────────────────────────
-- Application code NEVER writes `location`. It writes latitude/longitude and
-- this trigger derives the PostGIS point, exactly like the `places` trigger —
-- so there is a single source of truth and no way for the two to drift.
--
-- Unlike `places_location_sync`, this version also NULLs `location` when a
-- coordinate is cleared. Leaving a stale point behind would let an event
-- disappear from the map list yet remain findable through a stale bbox query.
CREATE OR REPLACE FUNCTION events_location_sync() RETURNS trigger AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.location := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
  ELSE
    NEW.location := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_events_location ON "events";
CREATE TRIGGER trg_events_location
    BEFORE INSERT OR UPDATE OF latitude, longitude ON "events"
    FOR EACH ROW EXECUTE FUNCTION events_location_sync();

-- ── 6. Indexes ──────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX "events_slug_key" ON "events"("slug");
CREATE UNIQUE INDEX "events_legacy_place_event_id_key" ON "events"("legacy_place_event_id");
CREATE INDEX "events_status_idx"            ON "events"("status");
CREATE INDEX "events_start_date_idx"        ON "events"("start_date");
CREATE INDEX "events_end_date_idx"          ON "events"("end_date");
CREATE INDEX "events_created_by_id_idx"     ON "events"("created_by_id");
CREATE INDEX "events_event_type_idx"        ON "events"("event_type");
CREATE INDEX "events_city_idx"              ON "events"("city");
CREATE INDEX "events_state_idx"             ON "events"("state");
CREATE INDEX "events_linked_place_id_idx"   ON "events"("linked_place_id");
CREATE INDEX "events_linked_vendor_id_idx"  ON "events"("linked_vendor_id");
CREATE INDEX "events_latitude_longitude_idx" ON "events"("latitude", "longitude");

-- Public feed predicate is `status = 'APPROVED' AND end_date >= today`, which
    -- is why end_date is COALESCEd above. This composite serves the status
    -- filter without a sort; the date range rides on the separate
    -- events_end_date_idx.
CREATE INDEX "events_status_start_date_idx" ON "events"("status", "start_date");

-- Required by ST_Intersects(location, ST_MakeEnvelope(...)) on the event map.
-- Without it the viewport query sequentially scans every event on every pan —
-- the exact failure that took /places/map down (see the
-- 20260929090000_restore_places_spatial_index migration header).
CREATE INDEX IF NOT EXISTS events_location_idx
    ON events USING GIST (location);

-- ── 7. Foreign keys ─────────────────────────────────────────────────────────
-- ON DELETE SET NULL (not CASCADE): deleting a Place or Vendor must never
-- destroy a real-world event. The event simply loses its optional link.
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "events" ADD CONSTRAINT "events_approved_by_id_fkey"
    FOREIGN KEY ("approved_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "events" ADD CONSTRAINT "events_linked_place_id_fkey"
    FOREIGN KEY ("linked_place_id") REFERENCES "places"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "events" ADD CONSTRAINT "events_linked_vendor_id_fkey"
    FOREIGN KEY ("linked_vendor_id") REFERENCES "vendors"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "event_reports" ADD CONSTRAINT "event_reports_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "events"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_reports" ADD CONSTRAINT "event_reports_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_reports" ADD CONSTRAINT "event_reports_reviewed_by_id_fkey"
    FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 8. Copy legacy place_events → events (ids preserved) ─────────────────────
-- STATUS mapping, derived from legacy visibility (PlaceEvent itself has no
-- status column, so the parent Place is the only available signal):
--   * parent Place APPROVED and not merged  → APPROVED (was publicly readable)
--   * parent Place REJECTED                → REJECTED
--   * anything else (PENDING etc.)         → PENDING
--   * parent Place has NULL coordinates    → PENDING, ALWAYS. A public event
--     with no position cannot be pinned, so it must not silently appear in a
--     public feed. Such rows surface in the admin queue for a human to place.
--
-- created_by_id stays NULL: legacy PlaceEvent recorded no owner, and inventing
-- one would misattribute data. approved_by_id likewise.
INSERT INTO "events" (
    id, slug, title, description, event_type, status,
    start_date, end_date, start_time, end_time,
    latitude, longitude, address, city, state, country,
    cover_image, images,
    created_by_id, approved_by_id, approved_at, rejected_at, rejection_reason,
    published_at, is_featured, linked_place_id, linked_vendor_id,
    legacy_place_event_id, created_at, updated_at
)
SELECT
    pe.id,
    -- Readable but guaranteed-unique: the preserved id is appended, so two
    -- legacy events with the same title can never collide on slug.
    COALESCE(
        NULLIF(
          LEFT(
            COALESCE(
              NULLIF(trim(BOTH '-' FROM regexp_replace(lower(pe.title), '[^a-z0-9]+', '-', 'g')), ''),
              'event'
            ),
            60
          ) || '-' || pe.id,
          ''
        ),
        'legacy-event-' || pe.id
    ),
    pe.title,
    pe.description,
    -- Both casts are required: a CASE expression resolves to `text`, and
    -- Postgres will NOT implicitly coerce text to an enum. (A bare string
    -- literal like 'OTHER' is `unknown` and coerces fine — which is exactly why
    -- only `status` failed on the first attempt.)
    'OTHER'::"EventType",
    (CASE
        WHEN p.id IS NULL OR p.latitude IS NULL OR p.longitude IS NULL THEN 'PENDING'
        WHEN p.status = 'APPROVED' AND p.merged_into_id IS NULL             THEN 'APPROVED'
        WHEN p.status = 'REJECTED'                                           THEN 'REJECTED'
        ELSE 'PENDING'
    END)::"EventStatus",
    -- Legacy is TIMESTAMPTZ; `events` is TIMESTAMP(3). The bare cast would use
    -- the *session* TimeZone, so on a non-UTC server an event silently shifts a
    -- day and public "is it finished?" comparisons break. Pin the conversion.
    pe.start_date AT TIME ZONE 'UTC',
    -- end_date was nullable in the legacy table but the new public feed
    -- requires it populated (visibility is a single end_date >= today
    -- comparison, with no heuristic). A legacy single-day event therefore gets
    -- end_date === start_date.
    COALESCE(pe.end_date, pe.start_date) AT TIME ZONE 'UTC',
    NULL,
    NULL,
    p.latitude,
    p.longitude,
    NULL,
    COALESCE(p.city, ''),
    COALESCE(p.state, ''),
    'India',
    pe.image_url,
    CASE
        WHEN pe.image_url IS NOT NULL AND pe.image_url <> '' THEN ARRAY[pe.image_url]
        ELSE ARRAY[]::TEXT[]
    END,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    CASE
        WHEN p.id IS NOT NULL
         AND p.latitude IS NOT NULL
         AND p.longitude IS NOT NULL
         AND p.status = 'APPROVED'
         AND p.merged_into_id IS NULL
        THEN COALESCE(p.reviewed_at, pe.created_at)
        ELSE NULL
    END,
    false,
    pe.place_id,
    NULL,
    pe.id,
    pe.created_at,
    pe.updated_at
FROM place_events pe
LEFT JOIN places p ON p.id = pe.place_id
ON CONFLICT (id) DO NOTHING;

-- GUARD A — no legacy row may be dropped silently.
DO $$
DECLARE
  legacy_count BIGINT;
  migrated_count BIGINT;
BEGIN
  SELECT count(*) INTO legacy_count FROM place_events;
  SELECT count(*) INTO migrated_count FROM events WHERE legacy_place_event_id IS NOT NULL;

  IF migrated_count < legacy_count THEN
    RAISE EXCEPTION
      'Refusing to complete community events migration: % place_events row(s) but only % migrated.',
      legacy_count, migrated_count;
  END IF;
END
$$;

-- ── 9. Repoint reels.event_id → events ──────────────────────────────────────
-- Dropped and re-added inside this same transaction, so the column is never
-- left unconstrained. Because ids were preserved in step 8, every existing
-- `reels.event_id` already resolves to the copied row — the relation survives
-- without a lookup table.
ALTER TABLE "reels" DROP CONSTRAINT IF EXISTS "reels_event_id_fkey";

ALTER TABLE "reels" ADD CONSTRAINT "reels_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "events"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "reels_event_id_idx" ON "reels"("event_id");

-- GUARD B — every Reel→Event relation must still resolve, or the migration
-- aborts and rolls back entirely rather than shipping a dangling reference.
DO $$
DECLARE
  orphans BIGINT;
BEGIN
  SELECT count(*) INTO orphans
  FROM reels r
  WHERE r.event_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM events e WHERE e.id = r.event_id);

  IF orphans > 0 THEN
    RAISE EXCEPTION
      'Refusing to complete community events migration: % reel(s) reference a missing event.',
      orphans;
  END IF;
END
$$;

-- Keep planner statistics current for the brand-new indexes.
ANALYZE events;
ANALYZE event_reports;