import {
  Prisma,
  EventStatus,
  type Place,
  type PlaceDataQuality,
} from '@prisma/client';
import { canPublicViewPlace, isPublicVerifiedOnly } from '../places/services/places-public-visibility';

/**
 * The single definition of "an event the public may see".
 *
 * Three rules combine here and must never be inlined into a `where` object
 * separately, because every read path in the app depends on them agreeing:
 *
 *   1. status must be APPROVED (PENDING / REJECTED / CANCELLED / EXPIRED are
 *      invisible to everyone but the owner and admins)
 *   2. the event must not have finished
 *   3. if it hangs off a Place, that Place must itself be publicly visible
 *
 * There is deliberately NO nightly job that flips APPROVED -> EXPIRED. Instead
 * every public query re-derives expiry from `endDate`, so an event can never
 * linger on the map after it ended just because a cron job was down. The
 * `EXPIRED` enum value exists for the admin queue's benefit and for a future
 * optional reaper.
 */

/** Start-of-today in UTC — the same day boundary `parseEventDate` uses. */
export function startOfTodayUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * An event is finished once its `endDate` is before today. `endDate` is
 * inclusive: an event whose endDate is today is still live all day, which is
 * what users expect from a "last day of the fair".
 *
 * `endDate` is non-nullable at the DB level, so no null branch exists here —
 * that is deliberate, so a caller cannot reintroduce one.
 */
export function isEventPastEnd(event: { endDate: Date }, now: Date = new Date()): boolean {
  return event.endDate.getTime() < startOfTodayUtc(now).getTime();
}

/**
 * Whether a linked Place's visibility may veto an event.
 *
 * Events carry their OWN coordinates precisely so they are mappable without a
 * parent Place. But when an event *is* attached to a Place, hiding that Place
 * should hide the event too — otherwise a rejected or merged Place keeps
 * surfacing on the map through its events.
 *
 * Delegates to the Places policy rather than re-deriving "approved and not
 * merged": `PALSAFAR_PLACES_PUBLIC_VERIFIED_ONLY` also gates on
 * `dataQuality`, and a second, looser copy of that rule here is how a hidden
 * gem ends up one API call away from being public.
 */
export function placeVisibilityWhere(
  place: Pick<Place, 'status' | 'mergedIntoId' | 'dataQuality' | 'source' | 'verificationLevel'> | null | undefined,
  isAdmin = false,
): boolean {
  if (!place) return true; // standalone event — no parent to defer to
  return canPublicViewPlace(place, isAdmin);
}

/**
 * Prisma fragment for publicly-visible, date-valid, *plottable* events.
 *
 * The coordinate predicates matter: `Event.latitude`/`longitude` are nullable
 * in the schema only so legacy PlaceEvent rows can be migrated without a
 * fabricated position. A row that never got coordinates is invisible to the
 * map and the list rather than being plotted at (0,0). Note this checks
 * `isNot: null` — it is NOT `latitude: { gt: -90 }`, which would pass a
 * swapped-axis or Null-Island value through to the marker layer.
 *
 * Only `endDate` gates visibility. A future start date does NOT hide an event:
 * an upcoming fair is exactly what a user browsing the map wants to see.
 */
export const publicEventWhere = (now: Date = new Date()): Prisma.EventWhereInput => {
  const cutoff = startOfTodayUtc(now);
  // Derived from `isPublicVerifiedOnly()` — the Places module's single policy
  // flag — so the verified-only rule cannot drift between the two features.
  const parentPlace: Prisma.PlaceWhereInput = {
    mergedIntoId: null,
    status: 'APPROVED',
    ...(isPublicVerifiedOnly() ? { dataQuality: 'VERIFIED' as PlaceDataQuality } : {}),
  };

  return {
    status: EventStatus.APPROVED,
    endDate: { gte: cutoff },
    latitude: { not: null },
    longitude: { not: null },
    OR: [
      // A standalone event has nothing to inherit from.
      { linkedPlaceId: null },
      // ...and an attached one only survives while its parent does.
      { place: { is: parentPlace } },
    ],
  } satisfies Prisma.EventWhereInput;
};

/**
 * Same rule as `publicEventWhere`, expressed for the PostGIS map feed.
 *
 * Kept adjacent to the Prisma fragment so the two are edited together. The
 * `places p` LEFT JOIN is what stops a hidden Place's events from being plotted
 * without loading the parent row into JS: doing it in SQL also means the GIST
 * index still does the filtering.
 */
export function publicEventSqlConditions(now: Date = new Date()): { sql: string; params: unknown[] } {
  const cutoff = startOfTodayUtc(now);
  const parentConditions = [`p.id IS NOT NULL`, `p.merged_into_id IS NULL`, `p.status = 'APPROVED'`];
  if (isPublicVerifiedOnly()) parentConditions.push(`p.data_quality = 'VERIFIED'`);

  return {
    sql: `e.status = 'APPROVED'
           AND e.end_date >= $1
           AND e.latitude IS NOT NULL
           AND e.longitude IS NOT NULL
           AND (e.latitude <> 0 OR e.longitude <> 0)
           AND (e.linked_place_id IS NULL OR (${parentConditions.join(' AND ')}))`,
    params: [cutoff],
  };
}

/**
 * Append the public-visibility conditions onto an existing `Prisma.Sql[]` for
 * the events map/nearby/featured queries (which already alias `e`).
 */
export function appendPublicEventSql(conditions: Prisma.Sql[], now: Date = new Date()): void {
  const cutoff = startOfTodayUtc(now);
  conditions.push(Prisma.sql`e.status = 'APPROVED'`);
  // No OR-null branch: end_date is NOT NULL (see the 20260930120000 migration).
  conditions.push(Prisma.sql`e.end_date >= ${cutoff}`);
  conditions.push(Prisma.sql`e.latitude IS NOT NULL AND e.longitude IS NOT NULL`);
  // Belt and braces: never plot Null Island even if a NULL slipped through.
  conditions.push(Prisma.sql`(e.latitude <> 0 OR e.longitude <> 0)`);
  // Parent-Place gate, evaluated in SQL so the GIST index still does the
  // filtering and no parent row has to be loaded into JS. A standalone event
  // (no linked Place) passes on the IS NULL branch.
  const parentPlace = isPublicVerifiedOnly()
    ? Prisma.sql`AND parent.merged_into_id IS NULL
         AND parent.status = 'APPROVED'
         AND parent.data_quality = 'VERIFIED'`
    : Prisma.sql`AND parent.merged_into_id IS NULL AND parent.status = 'APPROVED'`;
  conditions.push(Prisma.sql`
    (e.linked_place_id IS NULL OR EXISTS (
      SELECT 1 FROM places parent WHERE parent.id = e.linked_place_id ${parentPlace}
    ))
  `);
}