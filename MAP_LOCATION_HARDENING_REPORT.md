# PalSafar — Map & Location Correctness Hardening

Date: 2026-08-14  
Scope: map + location only. Production database was not opened, queried, or migrated.

This report does **not** claim a production PASS from TypeScript/lint alone. Each of the three reported bugs has a root cause, a code fix, a regression test, and verification evidence below.

---

## 1. Wrong distance

### Root cause

Displayed distance was not coming from one validated geodesic.

- `MapScreen` used a **second Haversine** (`R = 6371`) that always appended `" km"`, separate from the canonical meter implementation.
- Marker mapping used `Number(v.latitude || v.lat) || 0`. Null/empty/`undefined` coordinates became **0,0 (Null Island)**, so distance was computed to the Gulf of Guinea instead of the place.
- Invalid or **swapped India lat/lng** (e.g. `77.41, 23.26`) were treated as a legal WGS84 pair.
- `HomeScreen` had yet another local `haversineKm` for next-stop distance.

The number on the card was therefore often a real Haversine of the **wrong points**, not a display-rounding issue.

### Fix

- Single canonical implementation: `src/services/location/distance.ts`
  - `parseCoordinate` never coerces null/undefined/`''` to `0`
  - rejects Null Island `(0,0)`
  - rejects swapped India axes
  - `haversineDistance` returns **meters** or `NaN` if either pair is invalid
- Map/home/search/detail cards use that module + `formatDistance` / `formatNearbyDistanceMeters`
- Vendor/place marker mapping uses `parseLatLng`; invalid pins are dropped, not plotted at 0,0

### Regression tests

`src/__tests__/distance.test.ts`

- known pair (~1° latitude ≈ 111.2 km)
- same coordinates → 0
- invalid / null / undefined / empty → rejected (not 0)
- swapped India lat/lng → rejected
- m/km formatting (`250m`, `1.5km`, NaN → `''`)

**Result: PASS (7/7)**

---

## 2. Category buttons show random / unrelated places

### Root cause

Home category chips did not search near GPS.

- **Hotels** navigated as `categoryId: 'hotels'`, which was **not** a `HOME_CATEGORIES` id. Search fell through to `searchUniversal('Hotels')` with **no lat/lng** — a nationwide text search.
- **Temples** had the same miss (`'temples'` was not wired).
- Categories that *did* match (`food`, `stay`, heritage) called `placesApi.list({ city })` / `vendorsApi.listHotels({ city })` after reverse-geocode. That is a **city-name list**, not a radius query. Reverse-geocode failure then used the first nearby place’s city (silent city substitution).
- `GET /vendors/nearby` with **no coordinates** returned **all** approved map vendors (statewide dump). The app client also called nearby with no lat/lng.

### Fix

- Home chips: Hotels → `stay`, Temples → new `temples` GPS category; aliases `hotels`/`hotel`/`temple`.
- `searchHomeCategory` now requires valid GPS, calls `getNearbyPlaces(lat, lng, 30 km)` or `vendorsApi.getNearbyVendors({ lat, lng, radiusKm: 30 })`, then **re-filters by Haversine radius + category**. No `placesApi.list({ city })` nearby path. Reverse-geocode is **label-only**.
- No GPS: Search shows an explicit **Location required** state (does not invent nearby results).
- Map category chip recenters on current GPS when available so the viewport request is local.
- Server `listNearbyApproved`: **returns `[]` if lat/lng missing** (does not dump all vendors).

### Regression tests

`src/__tests__/category-nearby.test.ts`

- nearby in radius included
- Indore-scale distance excluded at 30 km
- temple vs heritage category filter
- current coordinates required (NaN / 0,0 → empty)
- source: no `Math.random`, no hardcoded city, no city-list `placesApi.list` fallback
- Hotels alias → stay

**Result: PASS (5/5)**

---

## 3. City search card appears then disappears (especially first time)

### Root cause

Race + explicit clear, not a 1-second animation bug.

1. Selecting a city group called `flyToCity`, which did **`setSelectedMarker(null)`** — the card was never meant to survive the fly.
2. If a place card did open (`handleMarkerPress`), the in-flight **GPS viewport fetch** (cold load) often finished **after** selection. `fetchMapData` **replaced** `allPlaces` and cleared selection when the selected id was not in the new feed (`city:Bhopal` is synthetic; cluster ids differ from place ids).
3. Leaflet `flyTo` duration (~1.2s) plus a 400ms bounds debounce matches the “about one second” report.
4. No `setTimeout(..., 1000)` was used as a keep-alive (and none was added).

### Fix

- `flyToCity` no longer clears selection.
- City suggestion: **open the city card first** (`handleMarkerPress`), then fly/fit bounds.
- Selecting a marker **increments the map fetch generation** so a stale GPS response cannot apply.
- Viewport feed **merges** the selected marker into the new list instead of dropping the card (`mergeMarkersPreservingSelection`).
- Live search uses a generation counter so an older query cannot overwrite a newer one.
- Vendor viewport fetch has the same generation guard; empty viewport no longer falls back to the full vendor list.

### Regression tests

`src/__tests__/map-city-card.test.ts`

- search → select city → card selected
- stale GPS feed (fetchId 1 vs latest 2) does **not** apply
- later city feed keeps `city:Bhopal` visible even when omitted from payload
- `flyToCity` source no longer contains `setSelectedMarker(null)`
- cold-load sequence covered in the same reducer test

**Result: PASS (5/5)**

---

## 4. Map data integrity (audit)

| Finding | Action |
|---|---|
| `Number(lat \|\| 0)` → 0,0 | Removed; `parseLatLng` + drop invalid |
| Duplicate Haversines on map/home | Canonical `distance.ts` |
| Statewide vendor dump as “nearby” | Server returns [] without GPS; client always sends lat/lng |
| City-list used as nearby | Removed from category search |
| Viewport empty → all context vendors | Removed |
| Reverse-geocode fail → nearest place’s city | Home label stays `"Nearby"` |
| `Math.random()` on map/location path | None introduced; unused in category search |
| DB place coordinates | Untouched |
| Leaflet `haversineKmJs` | Still used **only** for WebView pin de-duplication, not displayed distance |
| `tripPlanner` local Haversine | Left as itinerary clustering (out of this workstream) |

Public map/nearby APIs still require `APPROVED` places/vendors and `showOnMap` where applicable. Authorization was not weakened.

---

## 5. Request races

| Flow | Mechanism |
|---|---|
| Map pan / GPS vs city select | `fetchCounterRef`; stale id ignored |
| Vendor viewport | `vendorFetchCounterRef` |
| Map live search | `searchGenRef` |
| Home/Search category | existing `fetchGenRef` |

No extra polling.

---

## 6. Files changed

**Frontend**

- `src/services/location/distance.ts`
- `src/services/location/categoryNearbyFilter.ts` (new)
- `src/services/homeCategorySearch.ts`
- `src/features/mapExplore/utils/mapSelectionLifecycle.ts` (new)
- `src/screens/MapScreen.tsx`
- `src/screens/HomeScreen.tsx`
- `src/screens/SearchScreen.tsx`
- `src/screens/UploadPlacePhotoScreen.tsx`
- `src/hooks/useNearbyPlacesFromGps.ts`
- `src/components/home/constants.ts`
- `src/services/api/vendors.ts`
- `src/utils/mapMarkerUtils.ts`
- `src/features/buildTrip/hooks/useOsrmLegs.ts` (canonical distance only)
- `src/__tests__/distance.test.ts` (new)
- `src/__tests__/category-nearby.test.ts` (new)
- `src/__tests__/map-city-card.test.ts` (new)

**Backend**

- `server/src/modules/vendors/vendors.service.ts` — `listNearbyApproved` returns `[]` without coordinates

**APIs**

- `GET /vendors/nearby` contract: missing/invalid `lat`+`lng` now returns an empty list instead of every approved vendor. Query params `lat`, `lng`, `radiusKm` are what the app already sent when used correctly.

---

## 7. Validation

| Check | Result |
|---|---|
| Frontend `npx tsc --noEmit` | PASS |
| Frontend `npx eslint src/ App.tsx` | **0 errors**, 388 warnings (pre-existing unused-var noise; not treated as PASS for the bugs) |
| Server `npx tsc --noEmit` | PASS |
| Server eslint on `vendors.service.ts` | PASS (0 errors) |
| `distance.test.ts` | **7/7 PASS** |
| `category-nearby.test.ts` | **5/5 PASS** |
| `map-city-card.test.ts` | **5/5 PASS** |

### Tests not run, and why

- Server integration tests (`vendors.test.ts`, `places.test.ts`, etc.) against **TEST_DATABASE_URL** / PostGIS on `localhost:5433` were **not** run. Docker/PostGIS was not available in this session. **Production database was not used as a substitute.**
- Device GPS / physical map smoke was not re-run in this workstream (no claim of on-device PASS).

---

## 8. Confirmations

- Production database: **untouched** (no Prisma migrate, no seed, no `DATABASE_URL` queries).
- No mock/random/hardcoded tourist coordinates or fallback cities were added for “nearby”.
- No `setTimeout(..., 1000)` keep-alive for the city card.
- No unrelated Reels / Itinerary / Budget / UI restyle work.

Workstream complete.
