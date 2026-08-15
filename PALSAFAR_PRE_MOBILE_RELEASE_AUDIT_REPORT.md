# PalSafar Pre-Mobile Release Audit

**Date:** 2026-08-14  
**Auditor:** Code-level release readiness pass (no physical device QA)  
**Production database:** UNTOUCHED  
**Production API:** UNTOUCHED  
**Migrations:** NONE  

---

## 1. Executive Verdict

## CODE READY FOR MOBILE QA

All critical user flows have passing code-level tests and targeted integration coverage. Remaining gaps are documented as **known limitations** or **blocked product scope** — they do not prevent starting physical Android QA on core flows (trips, search/add places, map, reels, hidden gems, PalPoints, creator upload).

---

## 2. Completed Workstreams

| Workstream | Status | Tests |
|------------|--------|-------|
| Build Manually / Add More Places | **PASS** | `search-itinerary-add.test.ts` 14/14, `itinerary-hardening.test.ts` 10/10 |
| Hidden Gems lifecycle | **PASS** (with known gaps) | `hidden-gems.test.ts` 12/12 |
| PalPoints — vendor review | **PASS** (fixed this audit) | `place-review.test.ts` +10/10 |
| PalPoints — other paths | **PASS** (server-authoritative) | `palpoints-rule-defaults`, `palpoints-actions` |
| Creator Reel upload | **PASS** | `reel-upload.test.ts`, `creator-upload-manager.test.ts` |
| Creator Portfolio | **PASS** (core path) | `creator-upload-copy.test.ts` |
| My Trips navigation & labels | **PASS** | `trip-navigation.test.ts` 24/24, `trip-card-origin.test.ts` |
| Map / Travel Time | **PASS** | `travel-time.test.ts`, `place-card-travel-time.test.ts` |
| Budget | **PASS** | `budget-range.test.ts` — uses `BUDGETS.luxuryAmount` |
| Global + itinerary Search | **PASS** | `search-itinerary-add.test.ts` |
| Reels / Sharing | **PASS** | `reel-like.test.ts`, `share-links.test.ts`, `reel-navigation.test.ts` |
| Navigation hardening | **PASS** | `trip-navigation.test.ts`, `itinerary-hardening.test.ts` |
| Quick-add / persistence | **PASS** | `quick-add-place.test.ts` |
| Upload security (413/502) | **PASS** | `reel-upload.test.ts`, errorHandler fix |
| Release APK | **PASS** | Built successfully |

---

## 3. Fixed During This Audit

### Build Manually / Search (prior session + verified)
- Search result count now equals rendered rows (`buildUniversalRenderableRows`)
- Places filter plural→singular mapping
- Stale universal search debounce guard (`fetchGenRef`)
- API response normalization (`normalizeUniversalSearchResults`)
- ✓ Added state for excluded places; city mismatch badge (not silent hide)
- `SearchWrapper` refreshes `excludePlaceIds` after server add

### PalPoints
- **Vendor review now awards `review_write` PalPoints** on first review only (`vendors.service.addReview`)
- Integration test: `awards PalPoints on first vendor review only`
- `PalPointsScreen` uses correct rule key `reel_upload` (was `creator_reel`)
- Complete Itinerary card shows `itinerary_completion` (+100) not checkpoint (+10)

### Hidden Gems
- Pending duplicate detection includes other `PENDING` submissions (not just approved)
- Approve sets `dataQuality: PENDING_REVIEW` + `verificationLevel` for discovery under verified-only mode
- Merge PalPoints idempotency uses submission id (not target place id)
- Mobile admin loads approved/rejected lists (parallel fetch)
- AddHiddenGem: removed duplicate coordinate UI block; enforces ≥2 photos (matches UI copy)
- Integration test uses unique gem name + `force: true` on approve

### Creator / Reels
- Reel edit no longer sends unresolved `spotName` as `placeId` (`RootNavigator`)
- `updateOwnReel` invalid placeId → `null` (matches createReel)
- `publishDraft` awards daily reel PalPoints via `awardDailyReelUploadReward`
- `createDraft` resolves placeId before insert
- CreateReel UI: video limit copy 100MB (matches server)

### Upload / errors
- Multer 413 message distinguishes image (5MB) vs video routes

### Search service
- `normalizeUniversalSearchResults` meta fallback no longer defaults `totalResults` to 0 when meta absent

---

## 4. Remaining Code Issues

| Issue | Severity | Status |
|-------|----------|--------|
| Hidden Gem manual/map coordinate entry not in mobile UI | Medium | **BLOCKED** — GPS-only confirm works; manual lat/lng picker is a feature gap |
| Mobile admin Hidden Gems: no merge/force-approve UI | Medium | **BLOCKED** — web admin has full flow; server APIs exist |
| Mobile admin unpublish button | Low | **BLOCKED** — server `unpublish` works; mobile UI not wired |
| Complete Collab PalPoints earn path | Medium | **BLOCKED** — UI advertises; no server wallet path |
| Itinerary GPS PalPoints in production | Medium | **BLOCKED** — requires `ITINERARY_GPS_REWARDS_ENABLED=true` (intentional gate) |
| Place check-in server GPS attestation | Medium | **BLOCKED** — client checks distance; server accepts any auth check-in |
| Creator portfolio per-file retry / AsyncStorage draft | Low | **BLOCKED** — uploads work; resilience polish deferred |
| OS kills app mid-reel-upload | Low | **BLOCKED** — JS upload manager cannot survive process death |
| `/places/hidden-gems` engagement feed excludes new approvals | Low | **BLOCKED** — map/search/nearby discovery works |

No open **P0** code failures in scoped release flows.

---

## 5. Known Limitations

1. **Reel background upload:** If Android OS kills the app during upload, the in-process JS manager cannot continue. No native background transfer.
2. **Collaboration reel upload:** Remains synchronous (by design); separate from creator background upload path.
3. **Itinerary PalPoints in production:** Disabled unless env flag explicitly enables GPS-attested rewards.
4. **Hidden Gem submission:** Requires explicit GPS confirmation at place OR future manual/map picker — never auto-fills submitter GPS.
5. **Complete Collab earn:** Shown in PalPoints UI with fallback amount; backend earn not implemented.
6. **Device verification:** None of the above has been validated on a physical Android device in this session.

---

## 6. Test Results

### Frontend
| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | **PASS** |
| `npm run lint` | **PASS** (0 errors; pre-existing warnings) |
| `npm test` (Jest) | **149/149 PASS** (20 suites) |

### Server
| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | **PASS** |
| `npm run test:unit` | **198/198 PASS** (26 suites) |
| Integration (targeted) | **PASS** — `hidden-gems.test.ts`, `place-review.test.ts`, `reel-upload.test.ts` |
| Full `npm run test:integration` | **NOT RUN** (full suite >10 min; targeted coverage used) |

All integration tests used **TEST_DATABASE_URL** from `server/.env.test` (Render test DB — not production).

---

## 7. Release APK

| Field | Value |
|-------|-------|
| **Path** | `android/app/build/outputs/apk/release/app-release.apk` |
| **Size** | ~75.2 MB |
| **applicationId** | `com.palsasafar` |
| **versionName** | `1.0` |
| **versionCode** | `1` |

---

## 8. Production Safety

| Item | Status |
|------|--------|
| Production DB | **UNTOUCHED** |
| Production API | **UNTOUCHED** |
| `prisma migrate` / `db push` | **NOT RUN** |
| Schema changes | **NONE** |

---

## 9. Physical Device Status

**NOT RUN YET**

---

## 10. Mobile QA Checklist

Execute on a physical Android device with the release APK above.

### A. Build Manually / Add Places
- [ ] Open Jabalpur manual trip → **+ Add More Places**
- [ ] Search **Kachnar City** → card visible; count = cards
- [ ] Tap **Add** → **✓ Added**
- [ ] Add **Bhedaghat**, **Rani Durgavati Museum** → all persist
- [ ] Back to Trip Builder → all stops visible
- [ ] Reopen trip → stops still present
- [ ] Search Ujjain place → must NOT attach to Jabalpur itinerary

### B. My Trips
- [ ] AI trip shows **✨ AI PLANNED**; manual shows **🗺️ MANUAL TRIP**
- [ ] **Continue** → TripDetail (resume)
- [ ] **Itinerary** → TripDetail (view) — never TripBuilder
- [ ] **Build Manually** → TripBuilder only

### C. Map / Travel Time
- [ ] Place card **Travel Time** = GPS→place drive time
- [ ] Visit duration labeled separately
- [ ] Switch places → no stale time from previous place
- [ ] GPS off → Travel Time unavailable

### D. Hidden Gems
- [ ] Submit with explicit **Use My Location** at place
- [ ] Admin approve → discoverable in search/map
- [ ] Coordinates match selected location (not home GPS if not at place)

### E. PalPoints
- [ ] Write vendor review → +10 PalPoints (once)
- [ ] Watch ad → SSV credit (if AdMob test configured)
- [ ] Upload place photo → pending; admin approve → points
- [ ] Post reel → POSTED → daily reel points once

### F. Creator
- [ ] Portfolio image uploads immediately; remote URL on thumbnail
- [ ] Create reel → background upload → dashboard POSTED status
- [ ] Edit reel with typed location (no pick) → must NOT send name as placeId

### G. Reels / Sharing
- [ ] Like/unlike server-confirmed
- [ ] Share URL `https://palsafar.com/reel/<id>`
- [ ] Back from reel does not reset Explore stack

### H. Budget / AI Planner
- [ ] CUSTOM tier uses luxury slider amount (not hardcoded 85000 in payload)

### I. Persistence
- [ ] Kill app after adding places → reopen trip → places remain
- [ ] Kill app mid-upload → verify known limitation message/behavior

---

## Workstream Inventory (Pre-existing + This Audit)

Reports already in repo:
- `BUILD_MANUALLY_ADD_PLACES_REPORT.md`
- `TRIP_CARD_NAVIGATION_FIX_REPORT.md`
- `MY_TRIPS_CARD_CLARITY_REPORT.md`
- `MAP_PLACE_CARD_TRAVEL_TIME_REPORT.md`
- `PALSAFAR_RELEASE_HARDENING_FINAL_REPORT.md`
- Plus budget, map location, itinerary, reels sharing, security reports

Modified files this audit (non-exhaustive):
- `server/src/modules/vendors/vendors.service.ts`
- `server/src/modules/hidden-gems/hiddenGems.service.ts`
- `server/src/modules/social/social.service.ts`
- `server/src/modules/creator/creator.service.ts`
- `server/src/middleware/errorHandler.ts`
- `src/navigation/RootNavigator.tsx`
- `src/screens/PalPointsScreen.tsx`
- `src/screens/AddHiddenGemScreen.tsx`
- `src/screens/AdminHiddenGemReviewScreen.tsx`
- `src/screens/CreateReelScreen.tsx`
- `server/src/__tests__/place-review.test.ts`
- `server/src/__tests__/hidden-gems.test.ts`
