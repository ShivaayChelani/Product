# Itinerary Hardening Report

**Scope:** itinerary state, navigation, and CRUD only.  
**Date:** 2026-08-14 (second pass completed same day)  
**Production database:** untouched. No Prisma migration applied. Server tests used `TEST_DATABASE_URL` from `server/.env.test` only.

---

## Second pass — additional root causes fixed

### Build Manually missing places (deeper cause)
- **Stale AsyncStorage snapshot race:** after `quickAdd`, the mount effect could re-apply an old snapshot *after* a fresh `getById`, wiping the new stop. Fix: clear `DRAFT_TRIP_SNAPSHOT_KEY` before refetch; TripBuilder uses `serverFetchGen` so snapshots cannot overwrite a newer server fetch.
- **8s add timeout:** `TripBuilderEmptyRoute` could treat a slow-but-successful save as failure. Fix: removed `withTimeout` wrapper; rely on server persist + cache seed.

### Cross-city mixing (deeper cause)
- **`addStop` / `replaceStop` had no city check** — Map/timeline duplicate/replace could attach any place. Fix: shared `tripCanAcceptPlaceCity` + `assertTripAcceptsPlace` on all write paths.
- **Empty `place.city` bypass:** `canAdoptForCity` returned true when `!cityKey`. Fix: unknown city only allowed on empty generic drafts with zero stops.
- **Search blocked Option A:** itinerary Search rejected different-city taps. Fix: city filter applies only in **replace** mode; itinerary Search allows add → server creates separate city draft.
- **“Add all recommended”** chained one `tripId` across mixed cities. Fix: omit `tripId` per add; refresh the trip that actually received stops.
- **“Add More Places”** opened Map (no city guard). Fix: opens Search with current trip destination.
- **`isCityMismatchError`:** treated any HTTP 409 as mismatch (e.g. duplicate stop). Fix: only `code === 'CITY_MISMATCH'`.

### Cache additions
- Per-city draft map: `@palsafar_draft_trip_ids_by_city`
- `invalidateMyTripsList()` after add/delete (React Query `['my-trips','saved']`)

---

## Bug 1 — Places from different cities merge into one itinerary

### Root cause
- Place has no city FK; city is `place.city` + `place.state`. Trip has a `destination` string.
- `tripsService.quickAdd` reused any latest `DRAFT` for the user when `tripId` was omitted.
- `ensureManualDraftTrip` created/reused a single global draft titled “My Itinerary” / destination “My Trip”.
- `findServerPlaceId` could take `hits[0]` from a mixed-city name search.

### Fix
**Backend**
- Normalize city via `canonicalizeDestination` / `cityKeyFromPlace` / `formatDestinationLabel` (`server/src/shared/utils/destination.ts`).
- Without `tripId`: reuse a `DRAFT` whose destination matches that city; adopt a generic empty draft (“My Trip” / empty, no stops); otherwise **create** a new city draft. Do not merge into a draft that already has another city’s stops.
- With explicit `tripId`: reject a mismatched city with **409 `CITY_MISMATCH`** unless the trip destination is generic/empty and has no foreign-city stops (then adopt the city).
- New trips set `destination` to the canonical place city label.

**Frontend**
- `quickAddPlaceToTrip` retries without `tripId` on `CITY_MISMATCH`.
- `findServerPlaceId` filters hits by city; does not fall back to a mixed-city `hits[0]`.
- Search itinerary/replace mode filters results with `placeBelongsToDestination` when destination is known and not generic.
- `ensureManualDraftTrip(city?)` is city-aware.

**Schema:** none.

### Regression test
- Server: `keeps same-city quick-adds on one itinerary and does not merge a second city`
- Server: `rejects an explicit tripId when the place city does not match (409 CITY_MISMATCH)`
- Frontend: `city key helpers` in `src/__tests__/trip-navigation.test.ts`
- Server unit: destination generic/city-key helpers

### Verification
- **PASS** — trips integration (TEST_DATABASE_URL): both city-isolation cases passed as part of 38/38.
- **PASS** — destination unit tests 11/11.
- Device add-from-Search/Map: **NOT VERIFIED**.

---

## Bug 2 — Build manually: added places not showing

### Root cause
1. `SearchWrapper.handleAddToItinerary` returned silently when `tripId` was undefined (`TripBuilderEmptyRoute` can navigate without an id).
2. `quickAddPlaceToTrip` wrote `DRAFT_TRIP_ID_KEY` but did not refetch + `seedDraftTripCache`.
3. `loadBestDraftTrip` returned an in-memory snapshot for 45s, so the builder could show a stale trip.
4. TripBuilder focus used `tripRef.current?.id` or a stale snapshot instead of a server fetch by stored id.

### Fix
- Search add works **without** `tripId`; server creates/finds the city draft.
- After a successful quick-add: `invalidateDraftTripCache` → `getById` → `seedDraftTripCache`.
- TripBuilder focus: fetch `route.tripId` or `DRAFT_TRIP_ID_KEY` from the server; else `loadBestDraftTrip({ forceServer: true })`.
- Failed adds show an error; `alreadyExists` shows “Already added” and does not claim a new add.
- No polling / `setTimeout` “wait then refetch” loop.

### Regression test
- Frontend source: SearchWrapper no longer early-returns on missing `tripId`; seeds via `quickAddPlaceToTrip`.
- Frontend source: TripBuilder uses `DRAFT_TRIP_ID_KEY` + `forceServer: true`.
- Persistence path covered by `quickAdd invalidates memory, refetches by id, and seeds the draft cache`.

### Verification
- **PASS** — `src/__tests__/itinerary-hardening.test.ts`.
- Device “Build manually → Search → add → builder shows stop”: **NOT VERIFIED**.

---

## Bug 3 + 7 — Delete trip error + cannot re-add places

### Root cause
1. After `tripsApi.delete`, client did not clear `DRAFT_TRIP_ID_KEY`, snapshot, or memory. Next quick-add reused the deleted id → 404.
2. `AiGenerationLog.tripPlanId` has **no** `onDelete: Cascade`. Deleting a trip with AI logs failed on FK.

### Fix
**Backend (no schema change)**  
`delete()` runs in a transaction: `aiGenerationLog.updateMany({ tripPlanId: null })` then `tripPlan.delete`.

**Frontend**
- After a successful delete (or owner 404 = already gone): `clearDraftTripCache(tripId)` then invalidate my-trips via `refresh()`.
- Network / non-404 errors: message shown, local cache **unchanged**.
- Other-user delete still 404 (no leak).
- Delete confirm opens immediately (removed `setTimeout` before confirm).

Unique `@@unique([tripPlanDayId, placeId])` unchanged. Re-add to a **new** trip is allowed after the stale id is cleared.

### Regression test
- Server: `deletes a trip that has AI generation logs by nulling the FK first`
- Server: `allows re-adding the same place after the previous trip is deleted`
- Server: `rejects mutations on a deleted trip`
- Frontend source: `clearDraftTripCache` + no delayed confirm

### Verification
- **PASS** — trips integration (TEST_DATABASE_URL).
- Device delete + re-add: **NOT VERIFIED**.

---

## Bug 4 — Explore Places opens Reels

### Root cause
MyTrips completed empty CTA used `navigateTo('MainTabs', { screen: 'Explore' })`. Explore is the Reels tab. Label is “Explore Places”.

### Fix
Navigate to `MainTabs` `{ screen: 'Map' }`.  
ItineraryScreen empty already went to Map (unchanged).

### Regression test
- Frontend: `Explore Places on completed empty state navigates to Map, not Explore/Reels`
- Frontend: `ItineraryScreen empty explore action already goes to Map`

### Verification
- **PASS** — source tests.
- Device tap: **NOT VERIFIED**.

---

## Bug 5 — Continue vs Itinerary lead to the same UI

### Intended routes (no new screen)
| Action | DRAFT | UPCOMING | ACTIVE | COMPLETED |
|---|---|---|---|---|
| **Itinerary** | TripBuilder if stops exist (plan editor); else TripDetail | TripDetail | TripDetail | TripDetail |
| **Continue** | TripBuilder | TripDetail `{ resume: true }` (start trip, then progress) | TripDetail `{ resume: true }` (fetch progress) | Itinerary only / TripDetail |

### Fix
- `resolveItineraryNavigation` / `resolveContinueNavigation` in `src/utils/tripNavigation.ts`.
- `TripDetail` params include `resume?: boolean`; wrapper passes it.
- If `resume` and status is `UPCOMING`, `startTrip` then show itinerary/progress. ACTIVE fetches progress.

### Regression test
- `src/__tests__/trip-navigation.test.ts` (Itinerary vs Continue routes).
- Source: TripDetail `resume?: boolean` + `handleStartTrip` on UPCOMING.

### Verification
- **PASS** — unit + source tests.
- Device Continue / Itinerary taps: **NOT VERIFIED**.

---

## Bug 6 — Regenerate vs Refine with AI are the same action

### Root cause
`onRegenerateItinerary={openRefineModal}`. `handleRegenerateFullItinerary` existed but was unwired. Bottom “Refine with AI” also opened the refine modal.

### Fix
- **Regenerate** → `handleRegenerateFullItinerary` (`aiGenerate` with existing prefs, `fillWithAi: true`, same `tripId`).
- **Refine** → modal + `handleAiRefine` (pace/budget/avoid/notes).
- Distinct state: `regenerating` vs `refining`. Failed AI does not call `setTrip`.
- Pinned stops remain the engine’s responsibility (unchanged `fillWithAi` / pin behavior).
- Regeneration only targets the current `tripId`.

### Regression test
- Source: `onRegenerateItinerary={handleRegenerateFullItinerary}` and Refine still `openRefineModal`.
- Distinct `setRegenerating` / `setRefining`.

### Verification
- **PASS** — source test.
- Live AI regenerate/refine on device: **NOT VERIFIED**.

---

## Bug 8 — Backend auth / IDOR

### Audit (touched itinerary endpoints)
| Endpoint | Auth | Owner / collaborator check |
|---|---|---|
| `POST /trips/quick-add` | `authenticate` | Explicit `tripId` requires owner or non-VIEWER collaborator; else 404 |
| `DELETE /trips/:id` | `authenticate` | `findFirst({ id, userId })` — other user 404 |
| `GET /trips/:id` | `authenticate` | existing access check — other user 404 |
| `PATCH /trips/:id` | `authenticate` | existing — other user 403/404 |
| Add/update/delete stop | `authenticate` | `assertTripAccess` |

Auth was not weakened. City mismatch is validated server-side. Deleted trip + explicit `tripId` → 404.

### Regression test
- Existing: other-user GET/PATCH.
- New: `rejects delete and quick-add against another user's trip (IDOR)`
- New: `rejects mutations on a deleted trip`

### Verification
- **PASS** — trips integration (TEST_DATABASE_URL).

---

## Bug 9 — Transactions

| Operation | Transaction |
|---|---|
| `quickAdd` | Existing `$transaction` (find/create draft + stop). City match/adopt runs inside it. |
| `delete` | **New** `$transaction`: null AI logs, then delete trip. |
| `addStop` | Single create after access check (no extra writes). |

No schema change. No blanket transactions.

### Verification
- **PASS** — delete-with-AI-log integration test.

---

## Bug 10 — State / cache

After add / city switch / delete:
- Memory draft invalidated then re-seeded from `getById`.
- `DRAFT_TRIP_ID_KEY` updated to the trip actually written.
- `clearDraftTripCache(tripId)` on delete of that draft.
- TripBuilder prefers server id over 45s memory TTL (`forceServer`).
- Search `itineraryPlaceIds` only grows after a successful add.

### Regression test
- Source + `clearDraftTripCache` wiring; city-isolation integration.

### Verification
- **PASS** — unit/source + server city isolation.
- Multi-city UI after reload on device: **NOT VERIFIED**.

---

## Bug 11 — No random / fallback itinerary data

Searched itinerary flow (`quickAddPlace.ts`, TripBuilder, MyTrips, Search add, trip navigation). No `Math.random` itinerary, no fake places, no hardcoded trip/city IDs, no fake success delays added.

Legitimate empty defaults (empty draft UI, generic “My Trip” only for city-less places) kept.

### Regression test
- Source scan in `itinerary-hardening.test.ts`.

### Verification
- **PASS** — source scan.

---

## Changes by layer

### Backend
- `server/src/modules/trips/trips.service.ts` — city-isolated `quickAdd`, **`addStop`**, **`replaceStop`**; transactional `delete` with AI-log nulling; `assertTripAcceptsPlace`.
- `server/src/shared/utils/destination.ts` — `isGenericDestination`, `cityKeyFromPlace`, `destinationMatchesCity`, **`tripCanAcceptPlaceCity`**.
- `server/src/shared/utils/ApiError.ts` — `CITY_MISMATCH`.
- Controllers/routes unchanged (auth middleware already applied).

### Frontend
- `src/utils/quickAddPlace.ts` — snapshot clear before refetch, per-city draft map, `invalidateMyTripsList`, city-mismatch retry (code-only), `clearDraftTripCache`.
- `src/utils/destination.ts` — same city helpers as server including `tripCanAcceptPlaceCity`.
- `src/utils/tripNavigation.ts` — Continue vs Itinerary + **`isCityMismatchError` (code only)**.
- `src/features/myTrips/myTripsCache.ts` — My Trips list invalidation hook.
- `src/features/buildTrip/components/TripBuilderEmptyRoute.tsx` — no add timeout; add-all without chained tripId.
- `src/features/buildTrip/components/TripBuilderLoadedView.tsx` — Add More Places → Search; day tab tracks stop count.
- `src/screens/SearchScreen.tsx` — itinerary mode allows cross-city add (Option A).
- `src/navigation/RootNavigator.tsx` — Search add without tripId; TripDetail `resume`; TripBuilder `tripId`.
- `src/navigation/types.ts` — `TripBuilder.tripId`, `TripDetail.resume`.
- `src/screens/MyTripsScreen.tsx` — distinct nav, Map CTA, cache-clearing delete.
- `src/screens/TripBuilderScreen.tsx` — server-first focus load.
- `src/screens/TripDetailScreen.tsx` — resume start; regenerate vs refine.
- `src/screens/SearchScreen.tsx` — filter hits by known city.
- `src/components/trip/TripItineraryView.tsx` — regenerate loading state.
- `src/services/api/client.ts` — `CITY_MISMATCH` code.

### Schema
- **None.** Proposed only if we later want `AiGenerationLog.tripPlanId` `onDelete: SetNull` — **not applied**. Workaround is the service transaction.

### Production
- No production DB writes from this workstream. Integration tests used `TEST_DATABASE_URL` only.

---

## Tests added

| File | What |
|---|---|
| `server/src/__tests__/trips.test.ts` | City isolation, 409 mismatch, **addStop mismatch**, **unknown-city rejected**, **Jabalpur/Ujjain independent trips**, delete + AI logs, re-add, IDOR |
| `server/src/__tests__/destination.test.ts` | Generic destination + city key match + **`tripCanAcceptPlaceCity`** |
| `src/__tests__/trip-navigation.test.ts` | Continue vs Itinerary, city isolation helpers, mismatch code |
| `src/__tests__/itinerary-hardening.test.ts` | Search add, cache seed, add-all wiring, Search Option A, no fake delays |
| `src/__tests__/quick-add-place.test.ts` | **Persist/refetch, snapshot race, city switch, duplicate 409 vs mismatch, delete clears cache** |

---

## Tests passed

| Suite | Result |
|---|---|
| Frontend `npx tsc --noEmit` | PASS |
| Frontend `npm run lint` | PASS |
| Frontend itinerary Jest (`quick-add-place`, `itinerary-hardening`, `trip-navigation`) | PASS 27/27 |
| Server `destination.test.ts` (unit) | PASS 12/12 |
| Server `trips.test.ts` (integration, `TEST_DATABASE_URL`) | PASS 41/41 |

Integration uses `TEST_DATABASE_URL` from `server/.env.test` only. Production DB untouched.

---

## Tests not run

| Suite | Reason |
|---|---|
| Full server `npm run test:integration` / `test:e2e` / `test:all` | Only itinerary-relevant files were run |
| Device / emulator UI flows | `adb devices` empty — no hardware attached |

---

## Final status (second pass)

| Check | Status |
|---|---|
| BUILD MANUALLY PERSISTENCE | PASS (code + tests) |
| PLACE REAPPEARS AFTER REFETCH | PASS (code + tests) |
| SAME-CITY GROUPING | PASS |
| CROSS-CITY ISOLATION | PASS |
| DELETE + RE-ADD | PASS |
| CONTINUE ROUTE | PASS |
| ITINERARY ROUTE | PASS |
| TYPESCRIPT | PASS |
| LINT | PASS |
| SERVER TESTS | PASS (41/41 trips + 12/12 destination) |
| DEVICE VERIFICATION | **NOT VERIFIED** |
| PRODUCTION | **UNTOUCHED** |

---

## Manual QA status

| Flow | Status |
|---|---|
| Add City A then City B from Search/Map | **NOT VERIFIED** |
| Build manually → add place → builder shows stop | **NOT VERIFIED** |
| Kill app / reload → draft persists | **NOT VERIFIED** |
| Delete trip → re-add same place | **NOT VERIFIED** |
| Explore Places → Map (not Reels) | **NOT VERIFIED** |
| Continue vs Itinerary on DRAFT / UPCOMING / ACTIVE | **NOT VERIFIED** |
| Regenerate vs Refine with AI (live model) | **NOT VERIFIED** |

---

## Mapping to required cases A–M

| Case | Covered by | Evidence |
|---|---|---|
| A City isolation | trips.test city isolation + 409 | PASS (TEST_DATABASE_URL) |
| B Manual add appears | SearchWrapper + cache seed tests | PASS (source); device NOT VERIFIED |
| C Persistence after reload | seed + forceServer fetch-by-id | PASS (source); device NOT VERIFIED |
| D Delete succeeds | delete + AI log test | PASS |
| E Re-add after deletion | re-add test | PASS |
| F Explore Places → Map | MyTrips + ItineraryScreen source | PASS |
| G Continue routes | trip-navigation.test | PASS |
| H Itinerary routes | trip-navigation.test | PASS |
| I Regenerate distinct | TripDetail source | PASS (wiring); live AI NOT VERIFIED |
| J Refine distinct | TripDetail source | PASS (wiring); live AI NOT VERIFIED |
| K Delete authorization | IDOR delete 404 | PASS |
| L Cross-user trip access | IDOR get/quick-add/delete | PASS |
| M Duplicate place | existing quick-add idempotent + alreadyExists UI | PASS (existing + new city-B duplicate) |

---

## Production untouched confirmation

- No `prisma migrate` / `db push`.
- No edits to `server/prisma/schema.prisma`.
- Tests refused localhost-as-production fallback; successful run used `TEST_DATABASE_URL` only.
- AI log FK handled in application code (null then delete), not by changing production schema.
