# PalSafar — Map Place Card Travel Time Hardening Report

**Date:** 2026-08-14  
**Scope:** Map place card travel time only  
**Production database:** UNTOUCHED  
**Production API:** UNTOUCHED  

---

## 1. Root cause

The Map place card had **two separate time concepts** that were easy to confuse:

| Concept | Source | Correct label |
|---------|--------|---------------|
| **Travel time** | User GPS → place coordinates (OSRM or fallback) | Travel Time |
| **Visit duration** | Place `estimatedDuration` / `estimatedDurationMinutes` from DB | Recommended Visit |

**Issues found:**

1. **Visit duration column labeled "Visit Time"** — looked like travel time when both appeared on the card.
2. **Stale travel time on place switch** — `useTravelTime` kept the previous place’s result while loading the next (Place A’s minutes could flash on Place B).
3. **Missing unavailable state** — when GPS was stale or coords invalid, the card showed `—` instead of an explicit unavailable message.
4. **No loading copy** — spinner only, no “Calculating…” text.

**Not a current bug (already fixed in prior map hardening):**

- Hardcoded `1 hr` as travel time (removed earlier)
- Duplicate Haversine in MapScreen
- `estimatedDuration ?? 90` default on markers
- OSRM URL duplicated in MapScreen (centralized in `travelTime.ts`)

---

## 2. Files changed

| File | Change |
|------|--------|
| `src/services/location/travelTime.ts` | Exported `DEFAULT_DRIVING_SPEED_KMH = 28` |
| `src/services/location/useTravelTime.ts` | Clear stale result on change; `destinationKey`; error catch |
| `src/components/MapPlaceDetailCard.tsx` | Travel Time unavailable/loading states; rename visit column to **Recommended Visit** |
| `src/screens/MapScreen.tsx` | Pass `destinationKey` + `travelTimeUnavailable` to card |
| `src/__tests__/travel-time.test.ts` | Expanded formatter + constant + wiring tests |
| `src/__tests__/place-card-travel-time.test.ts` | UI regression + stale-request + coordinate tests |

---

## 3. Travel-time data flow

```
User GPS (LocationContext → effectivePosition)
    ↓ isFreshUserPosition (≤5 min, valid lat/lng)
parseLatLng(origin)
    ↓
Selected marker lat/lng (from place record via parseLatLng)
    ↓
useTravelTime(origin, destination, selectedMarker.id)
    ↓
getEstimatedTravelTime()
    ├─ OSRM driving route (source: "routing") → formatTravelTimeLabel
    └─ fallback: geodesic × 1.25 @ 28 km/h (source: "fallback") → "Est. …"
    ↓
MapPlaceDetailCard.travelTimeLabel + "Travel Time" label
```

**Distance** (header row): same origin + destination via `haversineDistance` + `formatDistanceFromYou` — independent of OSRM road distance but **same GPS origin and place destination**.

---

## 4. Routing API vs fallback

| Priority | Provider | Label |
|----------|----------|-------|
| 1 | OSRM public demo (`router.project-osrm.org`) | `13 min` (example) |
| 2 | Geodesic fallback | `Est. 13 min` |

Fallback is **not** presented as exact driving time.

---

## 5. Canonical constants

| Constant | Value | Location |
|----------|-------|----------|
| `DEFAULT_DRIVING_SPEED_KMH` | 28 | `travelTime.ts` |
| `FALLBACK_ROAD_FACTOR` | 1.25 | `travelTime.ts` |
| `ORIGIN_BUCKET_DEG` | 0.001 | `travelTime.ts` (cache key) |
| `CACHE_TTL_MS` | 10 min | `travelTime.ts` |
| `LOCATION_FRESH_MS` | 5 min | `distance.ts` |
| `NEARBY_SEARCH_RADIUS_M` | 30_000 | `categoryNearbyFilter.ts` (unchanged) |

---

## 6. Coordinate validation

Reuses canonical `parseLatLng` from `distance.ts`:

- Rejects null, NaN, 0,0, swapped India lat/lng
- Place markers built via `parseLatLng(p.latitude, p.longitude)` — **stored place coords**, not submitter GPS
- Hidden gems use the same `apiPlaceToMarker` / `mapPlaceToMarker` path

---

## 7. GPS behavior

- Origin: `effectivePosition` only when `isFreshUserPosition` is true
- Stale or missing GPS → no distance label, `travelTimeUnavailable`, card shows **Unavailable**
- **No invented travel time** when GPS missing

---

## 8. Stale-request protection

| Layer | Mechanism |
|-------|-----------|
| `useTravelTime` | `genRef` generation counter + `setResult(null)` on each new request |
| Place switch | `destinationKey = selectedMarker.id` in effect deps |
| Travel cache | Key = mode + origin bucket + destination coords |

---

## 9. UI changes (minimal)

- **Travel Time** field: `Calculating…` / `{N min}` / `Est. {N min}` / `Unavailable`
- **Recommended Visit** (only when place has `estimatedDuration`) — replaces misleading **Visit Time** label
- No layout redesign; no new gradients or card resize

---

## 10. Tests added/updated

- `travel-time.test.ts` — 12 tests (formatters, fallback formula, constants, GPS/distance parity)
- `place-card-travel-time.test.ts` — 8 wiring/regression tests

---

## 11. Tests passed

| Check | Result |
|-------|--------|
| `travel-time.test.ts` + `place-card-travel-time.test.ts` | **20/20 PASS** |
| `npx tsc --noEmit` | **PASS** |
| ESLint (changed files) | **0 errors** |

---

## 12. Tests not run

- Full `npm test` suite (all 79+ tests)
- Server tests (no backend changes)
- Physical Android device verification

---

## 13. Device verification status

**NOT VERIFIED** — no physical device run in this session.

**Recommended device checks:**

1. Open Map near Jabalpur with GPS on → select Hanumantal Jain temple (~11.7 km) → confirm **Travel Time** updates and matches reasonable drive estimate
2. Deny/revoke GPS → card shows **Unavailable**, not a fake minute value
3. Switch between two places quickly → Place A time must not appear on Place B
4. Place with `estimatedDuration` → **Recommended Visit** shown separately from **Travel Time**

---

## 14. Production DB/API status

**UNTOUCHED**

---

## Remaining "Visit Time" / hardcoded time occurrences

| Location | Legitimate? |
|----------|-------------|
| `MapPlaceDetailCard.tsx` | **Removed** — now "Recommended Visit" |
| `TripItineraryView.tsx` `45 mins` fallback on stop duration | **Legitimate** — itinerary stop duration, not map travel |
| `MapScreen.tsx` list `1–2 hrs` for city groups | **Legitimate** — browse list hint, not place card travel |
| `SpotDetailScreen.tsx` recommended duration | **Legitimate** — detail screen visit duration |
| `itinerary.ts` / `tripPlanner.ts` visit duration defaults | **Legitimate** — trip planning, not map card |

No map place card path maps `estimatedDuration` into travel time.

---

## Final statuses

| Item | Status |
|------|--------|
| Travel time = GPS → place | **PASS** (code + tests) |
| No visit duration as travel time | **PASS** |
| No hardcoded travel fallback | **PASS** |
| Stale place/GPS protection | **PASS** |
| Consistent "Travel Time" label | **PASS** |
| TypeScript | **PASS** |
| Lint (changed files) | **PASS** |
| **DEVICE VERIFICATION** | **NOT VERIFIED** |
| **PRODUCTION** | **UNTOUCHED** |
