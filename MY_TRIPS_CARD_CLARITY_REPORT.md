# My Trips Card Clarity — Implementation Report

## A. Authoritative field

**Field:** `TripPlan.generationSource` (`GenerationSource` enum)

| Value | Server semantics | Card label |
|-------|------------------|------------|
| `AI_PROMPT` | Created via AI Trip Planner (`tripsService.aiGenerate`) | ✨ AI PLANNED |
| `HYBRID` | AI planner with user-pinned/manual places | ✨ AI PLANNED |
| `MANUAL` | Build Manually / `create` / quick-add draft (Prisma default) | 🗺️ MANUAL TRIP |
| `null` / missing / unknown | Legacy or unmigrated rows | TRIP (neutral) |

**Verified on server:**
- `server/prisma/schema.prisma` — `generationSource @default(MANUAL)`
- `server/src/modules/trips/trips.service.ts` — `aiGenerate` sets `AI_PROMPT` or `HYBRID`; manual `create` and quick-add use default `MANUAL`
- `server/src/__tests__/trips.test.ts` — asserts `generationSource === 'AI_PROMPT'` on AI generate
- List/getById return full `TripPlan` via `TRIP_INCLUDE` (field included in Prisma model)

**Not used for classification:** trip name, destination, stop count, status, budget, description.

---

## B. Files changed

| File | Change |
|------|--------|
| `src/features/myTrips/utils/tripFormatting.ts` | Added `resolveTripOriginDisplay()` |
| `src/components/trips/TripCard.tsx` | Origin badge row + props `originLabel`, `originKind` |
| `src/screens/MyTripsScreen.tsx` | Bind `trip.generationSource` → TripCard |
| `src/__tests__/trip-card-origin.test.ts` | New tests (origin labels, navigation, wiring) |
| `MY_TRIPS_CARD_CLARITY_REPORT.md` | This report |

---

## C. UI changes

Compact card layout (no full redesign):

```
[✨ AI PLANNED] or [🗺️ MANUAL TRIP] or [TRIP]     ⋮
Trip title
[Status: Ongoing / Upcoming / Draft / Completed]
📍 destination …
[Continue] [Itinerary]
```

- **Text labels required** — not color-only; distinct badge styles per kind (blue tint AI, warm tan manual, gray unknown).
- **Status badge unchanged** — green pill below title; separate from origin row.
- **No sublabel on card** — kept compact for small Android screens; sublabel available from helper for future use.

---

## D. Backend/API changes

**None.** Read-only use of existing `generationSource` on list/getById responses.

---

## E. AI trip — Continue behavior

| Status | Continue target |
|--------|-----------------|
| UPCOMING / ACTIVE | `TripDetail` with `{ tripId, resume: true, mode: 'resume' }` |
| DRAFT (with stops) | Same as manual draft — `TripBuilder` only when `status === 'DRAFT'` |

AI `generationSource` does **not** alter routing.

---

## F. AI trip — Itinerary behavior

Always `TripDetail` with `{ tripId, mode: 'view' }` — never `TripBuilder`.

---

## G. Manual trip — Continue / Itinerary behavior

| Action | DRAFT | UPCOMING / ACTIVE |
|--------|-------|-------------------|
| Continue | `TripBuilder` + `tripId` | `TripDetail` resume |
| Itinerary | `TripDetail` view | `TripDetail` view |

Same as pre-change navigation hardening; `generationSource` does not affect routes.

---

## H. Tests passed

Run after implementation:

- `npx tsc --noEmit` — **PASS**
- `npm test -- trip-card-origin.test.ts trip-navigation.test.ts itinerary-hardening.test.ts` — **PASS (47 tests)**
- `npm run lint` — **PASS**

**New/updated coverage:**
1. AI → `✨ AI PLANNED`
2. Manual → `🗺️ MANUAL TRIP`
3. Unknown/null → `TRIP` (no false AI/manual)
4. Status vs origin independence
5–8. AI/manual Continue & Itinerary navigation
9. City isolation — `trip-navigation.test.ts` (unchanged, re-run)
10. Build Manually persistence — `itinerary-hardening.test.ts` (unchanged, re-run)

---

## I. Tests not run

- Full `npm test` suite (all packages)
- Server `trips.test.ts` (no server changes)
- E2E / Detox / device manual QA

---

## J. Production DB/API touched

**UNTOUCHED** — no migrations, no schema changes, no production deploy.

---

## K. Remaining ambiguity

1. **HYBRID** — Shown as “AI PLANNED” because server sets it only when AI planner runs with pinned places; users may expect a third label (e.g. “AI + Manual”). Current spec maps hybrid to AI side.
2. **Legacy rows** — Pre-`generationSource` trips default to `MANUAL` in DB; truly unknown API values show neutral `TRIP`.
3. **Manual trip later refined with AI** — Regenerating itinerary on a manual trip may not flip `generationSource` on server (line 881 preserves `AI_PROMPT` only if already AI); card may still show MANUAL until server updates source.

---

## Final status

| Item | Status |
|------|--------|
| Origin field audit | ✅ Complete |
| UI labels on all cards | ✅ Complete |
| Navigation regression | ✅ Verified in unit tests |
| Backend changes | ✅ None |
| **DEVICE VERIFICATION** | **NOT VERIFIED** |
