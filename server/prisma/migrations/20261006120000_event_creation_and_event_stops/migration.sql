-- Community Events: creator-supplied fields + event-anchored itinerary stops.
--
-- STATUS: NOT EXECUTED against production as part of this change. This file is
-- the migration Prisma will apply via `prisma migrate deploy` when an operator
-- runs it deliberately against the verified target database. It was generated
-- offline with `prisma migrate diff --from-schema-datamodel --to-schema-datamodel`
-- against the previous `prisma/schema.prisma`, so no database connection — and
-- specifically NOT the production DATABASE_URL — was touched while producing it.
--
-- WHY THESE FIVE `events` COLUMNS
--   The creation form lets a resident publish a real flyer, which carries an
--   organiser, a contact route, an entry fee and a one-line teaser. None of
--   those existed on `events`, so the form had nowhere to put them. All five
--   are nullable: the rows copied from `place_events` in 20260930120000 have no
--   such data and must not be rewritten to look like they do.
--
-- WHY `trip_plan_stops.place_id` BECOMES NULLABLE
--   An event is a real thing a tourist schedules, but it is NOT a `places`
--   row. Creating a Place for every event would inject fabricated places into
--   search, the map layer, reviews, Nearby and vendor ownership — corrupted
--   place data — and would be indistinguishable from a genuine landmark.
--   So the stop's anchor became a choice: `place_id` OR `event_id`.
--
-- SAFETY PROPERTIES OF THIS FILE
--   1. NO destructive DDL. Nothing is dropped, truncated or recreated. No
--      column is lost, no existing value changes, no row is deleted.
--   2. `ALTER COLUMN ... DROP NOT NULL` is metadata-only in PostgreSQL; it
--      rewrites no rows and takes no table lock beyond a brief ACCESS EXCLUSIVE.
--      Every existing stop keeps `place_id` populated, so the application code
--      that reads `stop.place` keeps working unmodified for all historical
--      trips.
--   3. The new CHECK makes the invariant a database guarantee instead of a
--      convention: a stop must reference exactly one anchor. PostgreSQL
--      validates an added CHECK while scanning, and any violating row aborts
--      this transaction — so a bad row cannot be half-shipped.
--   4. `ON DELETE CASCADE` on the new FK, mirroring the existing
--      `trip_plan_stops.place_id -> places.id` relation. A stop carries no name,
--      image or coordinates of its own — it resolves them through its anchor —
--      so once the anchor is gone the stop is an unrenderable husk. More
--      importantly `ON DELETE SET NULL` is not even possible here: the CHECK in
--      property 3 requires exactly one anchor, so a SET NULL would turn every
--      event deletion into a constraint violation rather than a clean delete.
--   5. `CREATE INDEX` is used, never `CREATE INDEX CONCURRENTLY`: `prisma
--      migrate deploy` wraps each migration in a transaction and PostgreSQL
--      rejects CONCURRENTLY inside one.
--
-- WHY THE UNIQUE INDEX IS LEFT ALONE
--   `trip_plan_stops` keeps `@@unique([tripPlanDayId, placeId])` unchanged.
--   PostgreSQL permits multiple NULLs in a unique index, so event stops (all
--   with `place_id = NULL`) do not collide with it, while place stops retain
--   their "at most one of this place per day" guarantee exactly as before.

-- ── 1. events: creator-supplied fields ───────────────────────────────────────
ALTER TABLE "events"
    ADD COLUMN "short_description" TEXT,
    ADD COLUMN "organizer_name"    TEXT,
    ADD COLUMN "organizer_contact" TEXT,
    ADD COLUMN "website_url"       TEXT,
    -- Rupees; 0 means free. DOUBLE PRECISION matches `trip_plan_stops.entry_fee`
    -- so an event's fee can be copied onto its stop without a conversion.
    ADD COLUMN "entry_fee"         DOUBLE PRECISION;

-- ── 2. trip_plan_stops: the anchor becomes a choice ──────────────────────────
-- Add first, then relax: never a moment where a row could satisfy neither
-- column, because no existing row has a non-NULL `event_id` yet.
ALTER TABLE "trip_plan_stops" ADD COLUMN "event_id" TEXT;
ALTER TABLE "trip_plan_stops" ALTER COLUMN "place_id" DROP NOT NULL;

-- Exactly one anchor. XOR, expressed as a constraint.
--   - neither  -> an unlabelled, unreachable node in the itinerary
--   - both     -> "remove from trip" could drop the place link and silently
--                 leave the event behind, i.e. a half-deleted stop
ALTER TABLE "trip_plan_stops"
    ADD CONSTRAINT "trip_plan_stops_single_anchor_check"
    CHECK (
        ("place_id" IS NOT NULL AND "event_id" IS NULL)
        OR ("place_id" IS NULL AND "event_id" IS NOT NULL)
    );

-- ── 3. Indexes ───────────────────────────────────────────────────────────────
-- Serves "is this event already in any trip?" and the FK's validator.
CREATE INDEX "trip_plan_stops_event_id_idx" ON "trip_plan_stops"("event_id");

-- ── 4. Foreign keys ──────────────────────────────────────────────────────────
-- CASCADE, matching `trip_plan_stops.place_id -> places.id`: a stop has no
-- name or coordinates of its own, so an anchor-less stop could never render.
ALTER TABLE "trip_plan_stops" ADD CONSTRAINT "trip_plan_stops_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "events"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Keep planner statistics current for the new column and index.
ANALYZE "events";
ANALYZE "trip_plan_stops";
