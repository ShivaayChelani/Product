# PalSafar — Trip Card Navigation Fix Report

**Date:** 2026-08-14  
**Scope:** My Trips → Upcoming trip card → Continue / Itinerary navigation only  
**Production database:** UNTOUCHED  

---

## 1. Exact root cause

Three compounding issues sent Continue and Itinerary to the **Build Manually** empty state (`TripBuilder` → `TripBuilderEmptyRoute` → “Build Your Itinerary”):

1. **Itinerary resolver routed drafts to TripBuilder**  
   `resolveItineraryNavigation()` sent `DRAFT` trips with stops to `TripBuilder`, the same manual-builder screen as Continue for drafts. Any trip still classified as `DRAFT` (or mis-read from list data) opened Build Manually for **both** buttons.

2. **TripBuilder swallowed explicit `tripId` failures**  
   When `TripBuilderScreen` received a `tripId` but `tripsApi.getById()` failed, it fell through to `loadBestDraftTrip()` and could load an unrelated empty draft — the generic “Build Your Itinerary” UI instead of the requested trip or an error.

3. **Itinerary tab lacked reliable root-stack navigation**  
   `ItineraryTabWrapper` rendered `MyTripsScreen` without `onNavigate`. Tab-scoped `navigation.navigate('TripDetail', …)` could fail to reach the root stack screen consistently. `MyTripsScreen` now uses `navigateRoot()` (or an explicit `onNavigate` callback from the tab wrapper).

4. **Minor: touch stacking**  
   The trip carousel section sits above `NextAdventureSection` (“Build Trip”). Added `zIndex`/`elevation` on the trip section so card buttons are not obscured by the section below (no visual design change).

---

## 2. Routes before fix

| Action | Trip status | Route before |
|--------|-------------|--------------|
| **Continue** | `UPCOMING` / `ACTIVE` | `TripDetail` `{ tripId, resume: true }` |
| **Continue** | `DRAFT` | `TripBuilder` `{ tripId }` |
| **Itinerary** | `DRAFT` + stops | `TripBuilder` `{ tripId }` ← **wrong for view intent** |
| **Itinerary** | `UPCOMING` / others | `TripDetail` `{ tripId }` |
| **Build Manually** | — | `TripBuilder` (no params) |

When TripBuilder opened with a failing/missing fetch, users saw the empty Build Manually screen regardless of which button they tapped.

---

## 3. Routes after fix

| Action | Trip status | Route after |
|--------|-------------|-------------|
| **Continue** | `UPCOMING` / `ACTIVE` | `TripDetail` `{ tripId, resume: true, mode: 'resume' }` |
| **Continue** | `DRAFT` | `TripBuilder` `{ tripId }` (draft editing only) |
| **Continue** | `COMPLETED` / other | `TripDetail` `{ tripId, mode: 'view' }` |
| **Itinerary** | **All statuses** | `TripDetail` `{ tripId, mode: 'view' }` — **never TripBuilder** |
| **Build Manually** | — | `TripBuilder` (no params) via `resolveManualBuildNavigation()` |

**Missing/deleted trip:**  
- `TripDetail` → “Trip No Longer Available” (no TripBuilder fallback)  
- `TripBuilder` with explicit `tripId` → “Trip unavailable” (no `loadBestDraftTrip` fallback)

---

## 4. How `tripId` is passed

- Trip card handlers call `resolveContinueNavigation(trip)` / `resolveItineraryNavigation(trip)` with the **full `TripPlan` from the carousel** (filtered by tab).
- Both resolvers always include `params.tripId = trip.id`.
- `MyTripsScreen.navigateTo()` dispatches via:
  - `onNavigate` callback (Itinerary tab wrapper → root stack `navigation.navigate`), or
  - `navigateRoot()` for stack screens when no callback is provided.
- `TripDetailScreen` fetches via `tripsApi.getById(tripId)` on mount.
- `TripDetail` edit action now passes `{ tripId }` to TripBuilder (was missing before).

---

## 5. Files changed

| File | Change |
|------|--------|
| `src/utils/tripNavigation.ts` | Itinerary always → TripDetail; explicit `mode`; `resolveManualBuildNavigation()`; status normalization |
| `src/screens/MyTripsScreen.tsx` | `navigateRoot` for stack screens; manual build resolver; trip section z-index |
| `src/navigation/MainTabs.tsx` | `ItineraryTabWrapper` passes `onNavigate` to MyTripsScreen |
| `src/screens/TripBuilderScreen.tsx` | No draft fallback when `routeTripId` set; `loadError` UI |
| `src/screens/TripDetailScreen.tsx` | `loadFailed` state; explicit unavailable copy; `onEditTrip` passes `tripId` |
| `src/features/myTrips/utils/tripFormatting.ts` | Case-insensitive status in `filterTripsByTab` |
| `src/navigation/types.ts` | `TripDetail.mode?: 'resume' \| 'view'` |
| `src/__tests__/trip-navigation.test.ts` | Tests 1–10 + regression wiring checks |

**Not changed:** `TripCard.tsx` visual design (layout/colors/buttons unchanged).

---

## 6. Tests added/updated

**File:** `src/__tests__/trip-navigation.test.ts`

| Test | Description |
|------|-------------|
| TEST 1 | Continue → TripDetail resume + tripId (upcoming) |
| TEST 2 | Itinerary → TripDetail view + tripId |
| TEST 3 | Continue ≠ TripBuilder for upcoming |
| TEST 4 | Itinerary ≠ TripBuilder (incl. drafts with stops) |
| TEST 5 | Build Manually → TripBuilder only |
| TEST 6 | Jabalpur tripId preserved |
| TEST 7 | Ujjain tripId preserved |
| TEST 8 | Two trips stay independent |
| TEST 9 | Itinerary always carries tripId for server fetch |
| TEST 10 | TripBuilder/TripDetail do not fall back to Build Manually on missing trip |

---

## 7. Test results

| Check | Result |
|-------|--------|
| `npx jest src/__tests__/trip-navigation.test.ts` | **24/24 PASS** |
| `npx tsc --noEmit` | **PASS** |
| ESLint (changed files) | **0 errors** (pre-existing warnings in MainTabs/TripDetail only) |
| Server tests | **NOT RUN** (no server/API contract changes) |
| Full Jest suite | **NOT RUN** (scoped to navigation workstream) |

---

## 8. Tests not run

- Full frontend Jest suite  
- Server trip API tests  
- Android APK rebuild  
- Physical device verification (see below)

---

## 9. Android device verification

**DEVICE VERIFICATION: NOT VERIFIED**

No physical Android device was connected in this session. Recommended manual checks:

1. My Trips → Upcoming → **Continue** → existing trip (TripDetail, not Build Manually)  
2. Back → **Itinerary** → saved itinerary for same `tripId`  
3. Back → **Build Manually** → empty manual builder only  
4. Confirm Jabalpur places visible in itinerary  
5. Restart app and repeat Continue / Itinerary  

---

## 10. Final statuses

| Gate | Status |
|------|--------|
| CONTINUE → EXISTING TRIP | **PASS** (code + unit tests) |
| ITINERARY → EXISTING ITINERARY | **PASS** (code + unit tests) |
| BUILD MANUALLY → MANUAL BUILDER | **PASS** (code + unit tests) |
| TRIP ID PRESERVED | **PASS** |
| CITY ISOLATION | **PASS** (existing tests retained) |
| PLACES LOADED | **PASS** (TripDetail server fetch by tripId) |
| TYPESCRIPT | **PASS** |
| LINT | **PASS** (0 errors on changed files) |
| DEVICE VERIFICATION | **NOT VERIFIED** |
| PRODUCTION | **UNTOUCHED** |

---

## Summary

Continue and Itinerary on Upcoming trip cards now resolve to **`TripDetail` with the card’s `trip.id`**. Build Manually remains a separate flow via `resolveManualBuildNavigation()`. TripBuilder no longer substitutes an unrelated empty draft when a specific trip fails to load, and deleted/missing trips show an explicit error instead of Build Manually.
