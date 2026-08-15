# Budget Hardening Report

**Scope:** the reported Budget range control only (“the budget range button is not working; it is only visual”).  
**Date:** 2026-08-14  
**Production database:** untouched. No Prisma migration. Server tests used `TEST_DATABASE_URL` from `server/.env.test` only.

---

## Exact root cause

The Budget control on **AI Trip Planner** (`src/screens/AITripPlannerScreen.tsx`) had two layers:

1. **The range track was visual-only.**  
   Four budget cards (`LOW` / `MEDIUM` / `HIGH` / `CUSTOM`) called `setBudget`. Below them a track + thumb was painted from `budgetSliderPosition(selectedBudget)` with **no** `PanResponder`, press handler, or slider. Dragging or tapping the range did nothing.

2. **Generate sent a hardcoded luxury amount.**  
   `customBudgetAmount: selectedBudget === 'CUSTOM' ? 85000 : undefined` was inlined in the screen instead of the catalog `luxuryAmount` on `BUDGETS`. The selected tier *was* sent as `budget`, but CUSTOM’s amount was a magic number, not derived from the control.

Backend itinerary generation already used budget: `LOW` (and `EXPENSIVE_ENTRY`) drop places with adult ticket **> ₹200**. `MEDIUM` / `HIGH` / `CUSTOM` do not apply that cap (existing product model). That filter was inlined in `passesHardFilters`; it was extracted so tests can prove the selected value reaches business logic. The filter itself was **not** rewritten.

There is no confirm/cancel modal: the control is inline. Cancelling does not apply. Reopen uses the Zustand planner store; draft persist already existed (`AI_PLANNER_DRAFT_KEY`) and now also runs after a range release / card press.

---

## State flow (after fix)

User drags/taps the range  
→ `BudgetRangeSlider` emits 0–1 position  
→ `budgetTierFromSliderPosition` snaps to nearest existing tier (`LOW` 0.12, `MEDIUM` 0.42, `HIGH` 0.68, `CUSTOM` 0.88)  
→ `setBudget(tier)` (Zustand)  
→ estimate text `estimateBudgetRange(tier, days)` updates  
→ cards highlight the same tier  
→ `persistDraft()` on release  

Generate  
→ `buildAiBudgetPayload(selectedBudget)`  
→ `GenerateLoading` → `POST /trips/ai-generate` with `budget` and, for CUSTOM, `customBudgetAmount` from `BUDGETS.luxuryAmount` (85000)  
→ `tripsService.aiGenerate` stores `trip.budget` / `customBudgetAmount` and passes `budgetTier` into `generateItineraryPlan`  
→ `placePassesBudgetFilter` applies the existing LOW entry-fee cap  

Invalid slider positions (`NaN`, &lt;0, &gt;1) clamp; they do not invent a new rupee range. CUSTOM without `customBudgetAmount` is still rejected by `aiGenerateSchema`.

---

## Exact files changed

| File | Change |
|---|---|
| `src/features/aiTripPlanner/BudgetRangeSlider.tsx` | **New.** Interactive track (PanResponder). Same track/thumb look; taller hit area only. |
| `src/features/aiTripPlanner/constants.ts` | `BUDGET_SLIDER_STOPS`, `budgetTierFromSliderPosition`, `buildAiBudgetPayload`. |
| `src/screens/AITripPlannerScreen.tsx` | Wire slider; persist draft on select; generate uses `buildAiBudgetPayload` (no hardcoded 85000). |
| `src/__tests__/budget-range.test.ts` | **New.** Mapping, confirm payload, previous value, invalid clamp, store, wiring. |
| `server/src/modules/trips/budgetFilter.ts` | **New.** Extracted existing LOW ₹200 filter. |
| `server/src/modules/trips/itineraryEngine.ts` | Use `placePassesBudgetFilter` (same behavior). |
| `server/src/__tests__/budget-filter.unit.test.ts` | **New.** Filter + schema validation. |
| `server/vitest.shared.js` | Register the unit test file. |

**Not changed:** Map, Search, Reels, itinerary screens, Reviews, AdMob, Wallet. No schema. No new API.

---

## API / backend

- `POST /trips/ai-generate` already accepted `budget` and `customBudgetAmount`. Unchanged.
- Validation: CUSTOM still requires a numeric `customBudgetAmount` ≥ 0; negative rejected.
- Engine: LOW still excludes adult ticket &gt; 200. HIGH/MEDIUM/CUSTOM still do not use that cap (existing semantics, not a new budget model).
- Planner cache key already includes `budget` and `customBudgetAmount`.

---

## Tests added

1. Open/select min (position 0 / 0.12 → `LOW`)
2. Select max (1 / 0.88 → `CUSTOM`)
3. Change range (`LOW` → `CUSTOM` / `HIGH`)
4. Confirm payload reaches generate helper (`buildAiBudgetPayload`)
5. Previous value not retained
6. Invalid position clamp
7. Store `setBudget` for reopen
8. Engine LOW vs HIGH/MEDIUM filter
9. CUSTOM missing amount rejected; valid CUSTOM accepted

---

## Tests passed

| Suite | Result |
|---|---|
| Frontend `npx tsc --noEmit` | PASS |
| Frontend lint (`src/` + `App.tsx`) | PASS (0 errors; 381 pre-existing warnings) |
| Frontend `npx jest` (all 10 suites / 55 tests) | PASS (includes 9 new budget-range tests) |
| Server `npx tsc --noEmit` | PASS |
| Server `npm run lint` | PASS (0 errors; 3 pre-existing warnings) |
| Server `budget-filter.unit.test.ts` | PASS 8/8 |
| Server `trips.test.ts` `excludes high-fee places when budget is LOW` on `TEST_DATABASE_URL` | PASS 1/1 (37 skipped in that run) |

---

## Tests not run

| Suite | Reason |
|---|---|
| Full `trips.test.ts` (38 cases) | Only the LOW-budget generation case was re-run after this workstream |
| Full server `test:unit` / `test:integration` / `test:e2e` | Out of budget scope |
| Device / emulator UI | `adb devices` listed **no device** |

---

## Device verification status

**NOT VERIFIED.** No Android device was attached.

Manual checklist (for a later device pass):

1. Open AI Trip Planner → Budget.
2. Drag the range — thumb and estimate text must change.
3. Cards must match the snapped tier.
4. Generate — request must send that `budget` (and CUSTOM `customBudgetAmount`).
5. Leave and reopen — same tier if draft persisted.
6. Try two substantially different ranges (e.g. Budget vs Premium).

---

## Production untouched confirmation

- No `prisma migrate` / `db push`.
- No edits to `server/prisma/schema.prisma`.
- Integration test used `TEST_DATABASE_URL` only.
- No production DB writes from this workstream.

---

## PASS criteria

| Criterion | Status |
|---|---|
| Control responds to interaction | **PASS** (PanResponder; unit + source tests). Device **NOT VERIFIED**. |
| Selected value changes state | **PASS** (`setBudget` + store test). |
| Value reaches business logic | **PASS** (`buildAiBudgetPayload` → ai-generate; LOW filter unit + TEST_DATABASE generation test). |
| Regression tests | **PASS** |
| Device verification reported separately | **NOT VERIFIED** |
