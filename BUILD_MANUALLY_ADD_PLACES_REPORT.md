# PalSafar — Build Manually Add Places Search Fix Report

**Date:** 2026-08-14  
**Scope:** Build Manually → + Add More Places → Search flow only  
**Production database:** UNTOUCHED  
**Production API:** UNTOUCHED  

---

## 1. Root cause

Search showed **“1 results found”** (or similar) but **no visible cards** when adding places from Trip Builder because:

1. **Count used pre-filter metadata** — `meta.totalResults` or raw section lengths were shown before client-side filters ran.
2. **`renderItem()` returned `null`** for already-added places and city-filtered places, so FlatList/ScrollView rendered empty rows while the count still reflected API totals.
3. **Plural filter chip mismatch** — default itinerary filter `Places` did not match singular API type `Place`, hiding all place rows when that filter was active.
4. **Universal search debounce lacked a stale-response guard** — slower responses could overwrite newer query results (nearby/GPS paths already had `fetchGenRef`; universal did not).
5. **API envelope inconsistency** — `searchUniversal` cast raw axios/`{ success, data }` payloads without normalizing missing arrays.

---

## 2. Files changed

| File | Change |
|------|--------|
| `src/services/searchService.ts` | Added `normalizeUniversalSearchResults()`; `searchUniversal` uses it |
| `src/utils/searchItineraryRows.ts` | **New** — pure row builders, filter matching, stale-gen helper |
| `src/screens/SearchScreen.tsx` | Itinerary refactor: `renderableRows`, FlatList, Add button, added state, city badge, gen guard |
| `src/navigation/RootNavigator.tsx` | `SearchWrapper` refreshes `excludePlaceIds` from server after add; preserves `tripId` |
| `src/features/buildTrip/components/TripBuilderLoadedView.tsx` | Verified (no change needed) — passes `tripId`, `destination`, `excludePlaceIds` |
| `src/__tests__/search-itinerary-add.test.ts` | **New** regression tests |

---

## 3. Search data flow (itinerary mode)

```
TripBuilderLoadedView.handleSelectPlaces
    ↓ navigate Search { mode: 'itinerary', tripId, destination, excludePlaceIds }
SearchWrapper
    ↓ props + local itineraryPlaceIds (refreshed after add)
SearchScreen
    ↓ debounced searchUniversal(q)
normalizeUniversalSearchResults(response)
    ↓ buildUniversalRenderableRows(results, filters)
FlatList data={activeRenderableRows}
    ↓ count = activeRenderableRows.length
ResultCard { Add | ✓ Added, cityMismatch badge }
    ↓ onAddToItinerary
SearchWrapper.handleAddToItinerary
    ↓ quickAddPlaceToTrip → persistQuickAddResult
    ↓ tripsApi.getById(result.tripId) → refresh excludePlaceIds
```

---

## 4. `normalizeUniversalSearchResults`

Handles:

- Bare payload `{ places, … }`
- Axios `{ data: payload }`
- API envelope `{ success: true, data: payload }`

Always returns `{ places, hiddenGems, vendors, reels, creators, events, offers, meta }` with arrays defaulting to `[]`.

---

## 5. `renderableRows` architecture

`buildUniversalRenderableRows()` (and nearby/city variants) produce typed rows **after**:

- Active filter chip (`Places`, `All`, …) with plural→singular mapping
- Itinerary/replace “places only” restriction
- Replace-mode city hide (itinerary mode keeps rows, flags `cityMismatch`)
- Exclude list → `added: true` (never drops the row)

Displayed count **always** equals `activeRenderableRows.length`.

---

## 6. Count vs render fix

| Before | After |
|--------|-------|
| `{meta.totalResults} results found` | `{renderableCount} results found` |
| `visibleCount` from raw sections | `buildUniversalRenderableRows().length` |
| Cards omitted via `return null` | Every row renders; added = disabled + “✓ Added” |

---

## 7. Added-state UX

- Already-on-itinerary places remain visible.
- Card shows **✓ Added** on the explicit Add button (itinerary mode).
- Tap/add disabled for added rows.
- `SearchWrapper` re-fetches trip stops after successful add so the list stays in sync with the server.

---

## 8. City mismatch behavior

| Mode | UI | Add behavior |
|------|-----|--------------|
| **Itinerary** | “Different city” badge on card | Add allowed; server enforces `CITY_MISMATCH` / separate draft via `quickAddPlaceToTrip` retry |
| **Replace** | Row hidden client-side | Unchanged — replace stays destination-scoped |

City isolation on the server is **preserved**; itinerary Search no longer silently hides API matches.

---

## 9. Stale-response guard

Universal search debounce now mirrors nearby/GPS:

```typescript
const gen = ++fetchGenRef.current;
// … await searchUniversal(q)
if (fetchGenRef.current !== gen) return;
```

`shouldApplySearchResponse(latest, responseGen)` exported for unit tests.

---

## 10. SearchWrapper post-add refresh

After `quickAddPlaceToTrip`:

1. `refreshItineraryPlaceIds(result.tripId)` — `tripsApi.getById` → all stop `placeId`s
2. `activeTripId` updated so subsequent adds keep the resolved trip
3. `persistQuickAddResult` still runs inside `quickAddPlaceToTrip` (snapshot hardening unchanged)

---

## 11. Navigation params (verified)

`TripBuilderLoadedView.handleSelectPlaces`:

```typescript
navigation.navigate('Search', {
  mode: 'itinerary',
  tripId: trip.id,
  destination: trip.destination || undefined,
  excludePlaceIds: existingPlaceIds,
});
```

No changes required — wiring was already correct.

---

## 12. SearchScreen UX tweaks (itinerary)

- Default filter: **Places** (not All)
- Empty query copy: **“Search for places to add to your itinerary”**
- Explicit **Add** button on `ResultCard` in itinerary mode
- Results rendered via **FlatList** from `activeRenderableRows`

---

## 13. Tests added

`src/__tests__/search-itinerary-add.test.ts`:

- `normalizeUniversalSearchResults` — envelope, missing arrays, derived totals
- `buildUniversalRenderableRows` — count === length, added state, city mismatch show/hide, plural filters
- Stale gen guard helper + SearchScreen wiring
- TripBuilder / SearchWrapper param & refresh wiring
- `placeHasCityMismatch` helper

---

## 14. Tests passed / failed

| Check | Result |
|-------|--------|
| `search-itinerary-add.test.ts` | **14/14 PASS** |
| `itinerary-hardening.test.ts` (existing) | **10/10 PASS** |
| `npx tsc --noEmit` | **PASS** |
| `npm run lint` | **PASS** (0 errors; pre-existing warnings only) |

---

## 15. Tests not run

- Full Jest suite (all 79+ tests)
- Server tests (no backend changes in this scope)
- Physical Android device walkthrough

---

## 16. Device verification status

**NOT VERIFIED** — no physical device run in this session.

**Recommended device checks:**

1. Trip Builder → **+ Add More Places** → search a known place → card appears; count matches cards
2. Add place → returns with **✓ Added** on that card; count unchanged but card visible
3. Search a different-city place → badge shown; add either succeeds on same trip or server message for mismatch
4. Type quickly (debounce) → final query results match; no flash of stale results

---

## 17. Final statuses

| Item | Status |
|------|--------|
| Count matches rendered cards | **PASS** (code + tests) |
| Added places visible with ✓ Added | **PASS** |
| Itinerary city mismatch not silently hidden | **PASS** |
| Replace mode city filter preserved | **PASS** |
| Universal search normalization | **PASS** |
| Stale search response guard | **PASS** |
| excludePlaceIds refresh after add | **PASS** |
| tripId navigation preserved | **PASS** (verified existing) |
| TypeScript | See §14 |
| Lint | See §14 |
| **DEVICE VERIFICATION** | **NOT VERIFIED** |
| **PRODUCTION** | **UNTOUCHED** |

---

## ROOT CAUSE (summary)

**Display count was computed before render filters; render filters returned `null` for excluded and city-mismatched rows — so users saw a non-zero count with zero cards.** Secondary issues: plural filter chip mismatch (`Places` vs `Place`), unnormalized API payloads, and missing stale-response guard on universal search.
