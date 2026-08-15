# PalSafar Release Hardening — Final Report

**Date:** 2026-08-14  
**Workspace:** `D:/PalSafar`  
**Production database:** UNTOUCHED  
**Production API:** UNTOUCHED  
**Production AdMob rewards:** NOT ENABLED  
**Test database:** `TEST_DATABASE_URL` from `server/.env.test` only  

---

## Exact release verdict

# RELEASE BLOCKED

The Android release APK **exists** and targeted automated tests **passed**. That is not enough.

Critical gates that are **not** satisfied:

1. **Physical Android testing: NOT VERIFIED** — `adb devices` returned no device. No install, login, GPS, upload, reel, PalPoints, itinerary, or budget smoke was run on hardware.
2. **Full server regression / e2e: NOT VERIFIED** — targeted integration suites passed on the test DB; the complete `test:integration` + e2e matrix was not completed as one green run.
3. **Creator upload / draft / publish: NOT VERIFIED on device** — `content://` FormData handling and draft API wiring exist in source and unit/source tests; picker → storage → publish was not proven on a phone.
4. **PalPoints earn actions: NOT VERIFIED end-to-end on device** — dead referral cards were removed and navigation was wired; ads, photo, itinerary completion, and wallet updates were not proven on hardware.
5. **Hidden Gem GPS confirmation, Search/nearby, Reels, Itinerary, Budget:** automated/unit evidence exists; **device PASS is missing**.

Do **not** treat this working tree as shippable. It remains a mixed development tree (security, product, admin, reports). Do **not** merge as one batch.

---

## 1. Executive summary

This pass continued master release hardening: Wallet/M-10 (legacy points ledger retired at runtime), Hidden Gem location confirmation + admin unpublish (archive, not hard-delete), PalPoints dead-button cleanup, Creator draft/error/`content://` upload plumbing, canonical distance reuse on the trip planner, and confirmation that AdMob client claim stays **503**.

Automated evidence:

| Gate | Result |
|---|---|
| App `tsc --noEmit` | PASS |
| App lint | PASS (0 errors, ~382 warnings) |
| Frontend Jest | PASS — 14 suites / 63 tests |
| Server `tsc --noEmit` | PASS |
| Server lint | PASS (0 errors, 3 warnings) |
| Server unit | PASS — 25 files / 188 tests |
| Targeted integration (`TEST_DATABASE_URL`) | PASS — hidden-gems, points-wallet, admob-ssv, place-review, reel-like, trips 38/38, plus places/auth/social/vendors/challenges/wallet-extension (6 files / 52 tests) |
| Full integration + e2e | NOT VERIFIED |
| `assembleRelease` | PASS — APK produced |
| `adb devices` | empty — PHYSICAL DEVICE VERIFICATION: **NOT VERIFIED** |
| npm audit | App 13 vulns (6 moderate, 7 high); server 8 moderate. **Not** force-fixed. |

**Status legend used below:** PASS / PASS WITH LIMITATIONS / NOT VERIFIED / BLOCKED.

---

## 2. Workstreams audited (classification A–O)

The working tree is still mixed. Classification of the current change set (not a merge recommendation):

| Class | Workstream | Include in a future release PR? |
|---|---|---|
| A | Security (refresh hashing, OTP replay tests, SSRF `safeFetchUrl`, rate limits, network security config, auth reset) | Yes, as its own PR after review |
| B | AdMob SSV (`admob-ssv.service`, claim 503, SSV tests, AdMob admin page) | Yes, separate from UI work |
| C | Wallet/M-10 (`points.service` → Wallet; `earn()` 410; wallet profile without `pointBalance` alias) | Yes |
| D | Map/location (30 km `NEARBY_SEARCH_RADIUS_M`, city-card lifecycle, GPS required) | Yes |
| E | Search/categories (nearby GPS filter; mic removed from search UI) | Yes |
| F | Hidden Gems (no auto-GPS; confirm-at-place; unpublish → REJECTED) | Yes |
| G | Reels/sharing (server-backed like, `palsafar.com/reel|trip` links, close/back) | Yes |
| H | Itinerary (city isolation, CRUD, nav Continue vs Itinerary, Regenerate vs Refine) | Yes |
| I | Budget (`BudgetRangeSlider`, catalog luxury amount, `budgetFilter.ts`) | Yes |
| J | Reviews (place review blocked; vendor `ratingInput` starts null) | Yes |
| K | Creator (draft save/publish, `toFormFile`, portfolio picker copy, real errors) | Yes, **device-blocked** |
| L | PalPoints (vendor-review nav, referral card removed, no client `totalPoints +=`) | Yes, **device-blocked** |
| M | Admin (Places search + `editorialPriority`; Hidden Gems archive; ads page) | Yes |
| N | Reports/documentation (`*_HARDENING_REPORT.md`, audit JSON, crash dumps) | Do **not** ship into the app; keep out of release commit |
| O | Unrelated/dead (`parse-audit.js`, `tombstone_11.txt`, `palsafar_crash.txt`, archive seed scripts, bulk import scripts) | Leave out of release |

Do not commit secrets (`.env`, `keystore.properties`, keystores).

---

## 3. Bugs found

| ID | Bug | Severity |
|---|---|---|
| 1 | Legacy `pointsService.earn()` could still credit the retired PointBalance path | Critical (wallet integrity) |
| 2 | Hidden Gem could submit with unconfirmed GPS / 0,0 | Critical (data integrity) |
| 3 | Admin approved gems had View-only; no safe unpublish | High |
| 4 | PalPoints showed Invite/Refer with no referral backend | High (fake earn) |
| 5 | PalPoints “Submit Review” could be read as tourist Place review | High (product rule) |
| 6 | Client wallet/`totalPoints` could increment locally on gem/check-in | High (spoofed UX) |
| 7 | Creator “Failed to post reel” hid the real error; draft did not persist | High |
| 8 | Android `content://` URIs could produce invalid FormData filenames/MIME | High |
| 9 | Become Creator still said desktop “drag & drop” | Medium |
| 10 | Trip planner still had a second Haversine wrapper | Medium (map already canonical) |
| 11 | Vitest did not load `.env.test`, so DB tests could hit `localhost:5433` | High (false failures / wrong DB) |
| 12 | Budget slider was visual-only (prior workstream) | High |
| 13 | Itinerary merged cities / stale cache (prior workstream) | High |
| 14 | Reel like was optimistic and ignored `isLiked` (prior workstream) | High |

---

## 4. Root causes

1. **M-10 incomplete:** Wallet was intended as SoT, but the points façade still wrote the legacy ledger.
2. **Hidden Gem location:** GPS was treated as the place coordinate without an explicit “I am at this place” confirmation.
3. **Admin gems:** Approve published a Place; there was no archive path that preserved audit/media/Place history.
4. **PalPoints UI:** Cards were marketing rows, not wired flows; referral was displayed without a backend.
5. **Creator uploads:** Desktop copy + filesystem-path assumptions on Android content URIs; errors swallowed.
6. **Test env:** dotenv for `.env.test` was missing from `vitest.shared.js`, so integration could miss `TEST_DATABASE_URL`.

---

## 5. Fixes (this hardening pass)

- `server/src/modules/points/points.service.ts` — reads **Wallet.palPoints + WalletTransaction**; `earn()` throws **410**.
- `wallet.service.ts` — no `pointBalance` alias on profile.
- Hidden Gem mobile: no auto-GPS; **Use My Location** requires confirm; submit blocked unless `locationConfirmed`; 0,0 rejected.
- Admin: `PATCH /api/v1/admin/hidden-gems/:id/unpublish` → `PlaceStatus.REJECTED` (no hard-delete); Archive + confirmation UI.
- PalPoints/Wallet: review → Map **vendors** tab; Invite/Refer cards removed; ways-to-earn pressable; display `Number(data.palPoints ?? 0)`; no client `totalPoints +=`.
- Creator: `caughtErrorMessage`; Save as Draft → `creatorApi.saveDraft` / `publishDraft`; “Tap to upload images/videos”; `toFormFile` for `content://`.
- Distance: `src/utils/tripPlanner.ts` uses `haversineDistanceKm`.
- Vendor review: `ratingInput` starts `null`; requires 1–5.
- `server/vitest.shared.js` loads `.env.test`.

Prior workstreams (map 30 km, mic removal, reels like/share/close, itinerary, budget, admin Places) were left in place and not regressively rewritten.

---

## 6. Security verification

| Control | Status | Evidence |
|---|---|---|
| Client cannot claim rewarded ads | PASS | `claimRewardedAd` throws 503; AdMob test TEST 11 |
| SSV signature / amount / ad-unit / user binding / idempotency | PASS | `admob-ssv.test.ts` on TEST DB |
| Reset OTP one-time session | PASS WITH LIMITATIONS | `auth-reset-otp-replay.unit.test.ts` (unit, not device) |
| Refresh token hashing | PASS WITH LIMITATIONS | `security-refresh-token.unit.test.ts` |
| Creator self-approval removed | PASS WITH LIMITATIONS | `creator-privilege-escalation.unit.test.ts` |
| GPS itinerary rewards gated | PASS WITH LIMITATIONS | itinerary-checkpoint GPS tests |
| Release cleartext HTTP disabled | PASS | `android/app/src/main/res/xml/network_security_config.xml` `cleartextTrafficPermitted="false"` |
| SSRF / IPv4-mapped IPv6 / no redirect follow | PASS WITH LIMITATIONS | `safe-fetch-url.unit.test.ts` |
| Admin / vendor / creator authz | PASS WITH LIMITATIONS | admin-rbac + related unit/integration; not device |
| Client wallet increment | PASS (source) | no `totalPoints +=` / `palPoints +=` in `src/` |
| Production AdMob | NOT ENABLED | test/debug IDs unless env override |

No security control was intentionally weakened.

---

## 7. Wallet / M-10 verification

**Authoritative store:** `Wallet.palPoints` + `WalletTransaction`.

Runtime `prisma.pointBalance` / `pointTransaction` usage in `server/src` is limited to schema explorer **name mapping** (`database-explorer.service.ts`). Archive/seed scripts still mention legacy tables; they are not app runtime.

`POST /api/v1/points/earn` remains routed and returns **410** (cannot credit PointBalance).

Frontend profile uses `data.palPoints`, not a legacy balance field.

| Check | Status |
|---|---|
| No runtime legacy reads/writes in app services | PASS (source + grep) |
| Legitimate earn via Wallet (not points.earn) | PASS WITH LIMITATIONS (wallet tests; not all earn paths on device) |
| Redemption / insufficient balance | PASS WITH LIMITATIONS (existing wallet/points tests) |
| Amount tampering / client claim | PASS (claim 503; SSV amount checks) |
| Concurrent earn/redeem | NOT VERIFIED (no dedicated concurrency soak) |
| Atomicity | PASS WITH LIMITATIONS (service transactions in Wallet; not load-tested) |

---

## 8. AdMob SSV verification

Flow required: PalPoints → Watch Ads → AdMob → server `ssvCustomData` → Google SSV → verify → Wallet.

- Client does **not** call a working claim-reward credit path.
- `GET /api/v1/monetization/ads/config` supplies server-generated `ssvCustomData`.
- Client `adsService` attaches it as `serverSideVerificationOptions.customData`.
- `POST /monetization/ads/claim-reward` stays **503**.

**Production rewards remain off** unless production AdMob IDs are injected at build time (not done here).

Device watch-ad → Google callback → wallet increment: **NOT VERIFIED**.

---

## 9. Map / location verification

Canonical mobile distance: `src/services/location/distance.ts` (`haversineDistanceKm`). Rejects null/empty/`0,0`/invalid/swapped India axes.

Canonical nearby radius: `NEARBY_SEARCH_RADIUS_M = 30_000` in `src/services/location/categoryNearbyFilter.ts`. Home, Search, and category chips import that constant.

GPS denial: explicit Location required (tested in `category-nearby`).

City card / stale-request: `mapSelectionLifecycle` + `map-city-card` tests.

**Limitations (not claimed as device PASS):**

- Server still has local Haversine copies (`geo.ts`, `itineraryEngine.ts`, `itineraryCluster.ts`, `vendors.service.ts`, `rewards.service.ts`). Mobile nearby does not use those.
- `leafletMapHtml.ts` embeds a JS Haversine for the WebView map.
- Physical GPS, city search, markers: **NOT VERIFIED**.

---

## 10. Hidden Gem verification

| Rule | Status |
|---|---|
| No silent current-GPS as place coords | PASS (source) — confirm required |
| Reject 0,0 | PASS — integration + submit guard |
| Approve copies Place coords; does not overwrite with admin GPS | PASS (source / existing service) |
| Unpublished = REJECTED, not hard-delete | PASS — `unpublish` + admin Archive UI |
| Non-admin unpublish 403 | PASS — integration |
| Appear in Home/Map/Search only after approval | PASS WITH LIMITATIONS (status model; not device) |
| Duplicate approve | PASS WITH LIMITATIONS (existing merge/idempotent approve logic; not re-soaked this pass) |
| Device submit + admin approve + search/map | NOT VERIFIED |

---

## 11. Search verification

- Mic/voice-search removed from Home search UI; iOS mic permission kept for Reels.
- Nearby search uses `NEARBY_SEARCH_RADIUS_M` + GPS.
- Exact/partial/city/state/category/pagination: **PASS WITH LIMITATIONS** (admin Places search tested on TEST DB; mobile search unit coverage is not a full live-index QA).
- Device search: **NOT VERIFIED**.

---

## 12. Reels verification

| Item | Status |
|---|---|
| Like uses server response; no fake success | PASS (source + frontend tests + reel-like integration) |
| Share `https://palsafar.com/reel/<reelId>` | PASS (source + share-links tests) |
| Trip share `https://palsafar.com/trip/<tripId>` | PASS (source) |
| No tokens in share URLs | PASS (source tests) |
| Android back / X / deep-link close | PASS WITH LIMITATIONS (unit/source; not device) |
| Upload / post on device | NOT VERIFIED |

---

## 13. Creator verification

| Item | Status |
|---|---|
| Tap-to-upload copy | PASS (source) |
| `toFormFile` for `content://` | PASS (source) |
| Draft save/publish API wired | PASS (source + `creator-upload-copy` test) |
| Real error surface | PASS (source) |
| Image/video picker → storage → DB on Android | NOT VERIFIED |
| Draft resume on device | NOT VERIFIED |
| Publish after upload on device | NOT VERIFIED |

This workstream is a **release blocker** until a physical device proves the upload path.

---

## 14. Itinerary verification

Prior hardening stands. `trips.test.ts` **38/38 PASS** on `TEST_DATABASE_URL` (one run hit a remote timeout; retry passed).

Device: Build Manually, two cities, Continue vs Itinerary, Regenerate vs Refine: **NOT VERIFIED**.

---

## 15. Budget verification

Interactive `BudgetRangeSlider`; snap to existing tiers; Luxury amount from catalog `luxuryAmount` (85000 is the catalog value, not an inline generate hardcoded). LOW still drops adult ticket > ₹200.

Frontend budget tests + server `budget-filter.unit` + LOW generate on TEST DB: PASS.

Device drag/tap/generate: **NOT VERIFIED**.

---

## 16. Review verification

- Tourist Place: no write-review UI path (existing frontend test).
- Backend place-review creation remains blocked (`place-review` integration).
- Vendor: `ratingInput` starts `null`; submit requires integer 1–5.

Device vendor review + reward: **NOT VERIFIED**.

---

## 17. PalPoints verification

| Card | Implementation | Status |
|---|---|---|
| Submit Hidden Gem | Navigates to real Add Hidden Gem | PASS WITH LIMITATIONS (nav); device NOT VERIFIED |
| Submit Review | Map vendors tab, not Place review | PASS WITH LIMITATIONS (source + palpoints-actions test) |
| Watch Ads | AdMob SSV only; claim 503 | PASS WITH LIMITATIONS; device NOT VERIFIED |
| Upload Place Photo | UploadPlacePhoto route | PASS WITH LIMITATIONS; device NOT VERIFIED |
| Complete Itinerary | MyTrips | PASS WITH LIMITATIONS; GPS completion NOT VERIFIED |
| Invite Friends / Refer | **Removed** (no referral backend) | PASS |
| Earn More | HowItWorks / pressable ways-to-earn | PASS WITH LIMITATIONS |

No client-side fake point increment on gem approve / check-in.

---

## 18. Admin verification

- Places: Rating/Reviews columns removed; **Priority Order** = `editorialPriority`; server-side sort; name/city/state search (not description/tag catch-all). Admin Vitest 21/21; server query unit 8/8; TEST DB list search 4/4 (prior workstream).
- Hidden Gems: Archive/unpublish with confirmation.
- Admin ads page exists for monetization config — **not** a production AdMob enablement.

Admin UI in a browser against production: **NOT VERIFIED** (and must not be pointed at production for destructive tests).

---

## 19. Dependency audit

**Did not run** `npm audit fix --force`.

| Tree | Count | Notes |
|---|---|---|
| App (`D:/PalSafar`) | 13 (6 moderate, 7 high) | Transitive via React Native CLI / Metro (`fast-xml-parser`, `image-size`). Force-upgrade would break RN toolchain. **Accepted risk** for this release candidate; not exploitable as an app-network UUID parser. |
| Server | 8 moderate | `uuid` via `firebase-admin` → googleapis / GCS. Same previously documented UUID advisory. No safe non-breaking direct patch without upstream. Server does not parse untrusted client UUIDs through that firebase-admin path. **Accepted risk.** |

Do not claim zero vulnerabilities.

---

## 20. Test results

**Frontend**

- `npx tsc --noEmit` — PASS  
- `npm run lint` — 0 errors (~382 warnings)  
- `npm test` — 14 suites / 63 tests PASS  

**Backend**

- `npx tsc --noEmit` — PASS  
- `npm run lint` — 0 errors, 3 warnings  
- Unit — 25 files / 188 tests PASS  

**Database tests (TEST_DATABASE_URL only)**

- Hidden gems, points-wallet, admob-ssv, place-review, reel-like — PASS  
- `trips.test.ts` — 38/38 PASS (retry after one Render timeout)  
- places, auth, social, vendors, challenges, wallet-extension — 6 files / 52 tests PASS  

**Not completed**

- Full `test:integration` as one job  
- Full e2e (`vitest.e2e`) as one job  

**Test isolation**

- Broad `prisma.user.deleteMany()` without an id/scope is **not** present in AdMob tests (cleanup is per `testUser` / `previousUser`).
- Remaining `user.deleteMany` in tests is scoped to created ids (`auth-account`, `multi-role-accounts`, `vendor-customers`).
- `trips.test.ts` deletes places by `testCity` / created ids — scoped to the suite’s fixtures, not global seed wipe.
- Seed helper `db-seed.ts` still has a `user.deleteMany` for **seed reset** — not invoked against production in this pass.

**Env note:** First integration attempt failed with `localhost:5433` because `.env.test` was not loaded. Fixed in `vitest.shared.js`. Subsequent runs used TEST_DATABASE_URL. Production `DATABASE_URL` was not used.

---

## 21. Android build

| Item | Value |
|---|---|
| Command | `cd android; .\gradlew.bat assembleRelease --console=plain` (after prior `clean assembleRelease`) |
| Exit code | 0 |
| Artifact | `android/app/build/outputs/apk/release/app-release.apk` |
| Size | 78,866,062 bytes (~75.2 MiB) |
| applicationId | `com.palsasafar` |
| versionName / versionCode | `1.0` / `1` |
| Signing | Release keystore present locally (credentials not recorded here) |
| minify / shrink | enabled (`enableProguardInReleaseBuilds = true`) |
| Cleartext (release) | disabled |

Gradle stdout on the incremental run was truncated in the tool log (Problems report + deprecation footer); the APK and `output-metadata.json` confirm the artifact.

AAB was not built (`bundleRelease` not run).

---

## 22. Physical device verification

```
adb devices
List of devices attached
(empty)
```

**PHYSICAL DEVICE VERIFICATION: NOT VERIFIED**

None of the section 28 smoke list (auth, home, map, hidden gem, reels, creator, PalPoints, itinerary, budget, reviews) was executed on hardware.

Do **not** interpret `assembleRelease` as Android functional PASS.

---

## 23. Production safety

| Item | Status |
|---|---|
| PRODUCTION DATABASE | UNTOUCHED |
| PRODUCTION API | UNTOUCHED |
| PRODUCTION ADMOB | NOT ENABLED |
| Prisma migrate / db push on production | NOT RUN |
| Production seed / data deletion | NOT RUN |
| Secrets in this report | NONE |

---

## 24. Remaining blockers

1. **No physical Android device** — install `app-release.apk` and run the full smoke list before any store upload.  
2. **Creator media pipeline unproven on device** — portfolio image/video, draft, reel upload/publish.  
3. **PalPoints earn paths unproven on device** — ads SSV credit, photo, itinerary GPS completion, vendor review reward.  
4. **Full server integration + e2e not completed** as a single green matrix (Render test DB can time out; must be sequential, not skipped).  
5. **Working tree is not one shippable change** — split PRs by A–M; exclude N/O and secrets.  
6. **npm audit remaining** — RN toolchain + firebase-admin uuid; accepted, not zero.  
7. **Server Haversine still duplicated** — consolidate later; not a mobile nearby regression.  
8. **versionCode 1** — confirm Play Console versioning before first upload.  
9. **Concurrency of wallet earn/redeem** — not soak-tested.  
10. **Live Hidden Gem → canonical Place appearance** on Home/Map/Search — not device-verified.

---

## 25. Exact release verdict (gates)

| Critical gate | Result |
|---|---|
| Wallet/M-10 verified | PASS WITH LIMITATIONS |
| AdMob SSV secure | PASS (tests); production ads NOT ENABLED |
| No client reward spoofing | PASS (source + claim 503) |
| Map/location correct | PASS WITH LIMITATIONS (automated); device NOT VERIFIED |
| Hidden Gems use correct coordinates | PASS WITH LIMITATIONS; device NOT VERIFIED |
| Approved Hidden Gems become canonical Places | PASS WITH LIMITATIONS (service); device NOT VERIFIED |
| Search works | PASS WITH LIMITATIONS; device NOT VERIFIED |
| Nearby categories work | PASS WITH LIMITATIONS; device NOT VERIFIED |
| Reels work | PASS WITH LIMITATIONS; upload NOT VERIFIED |
| Reel sharing works | PASS (source/tests) |
| Creator portfolio upload works | NOT VERIFIED |
| Creator draft works | NOT VERIFIED (device) |
| Creator reel upload works | NOT VERIFIED |
| Creator reel posting works | NOT VERIFIED |
| Itinerary works | PASS WITH LIMITATIONS (TEST DB); device NOT VERIFIED |
| Budget works | PASS WITH LIMITATIONS; device NOT VERIFIED |
| Vendor reviews work | PASS WITH LIMITATIONS; device NOT VERIFIED |
| Place reviews remain removed | PASS |
| PalPoints actions work | PASS WITH LIMITATIONS; device NOT VERIFIED |
| No dead earning buttons | PASS (referral removed; others wired) |
| Admin Places works | PASS WITH LIMITATIONS (TEST DB / Vitest) |
| No known critical security blocker in code | PASS WITH LIMITATIONS |
| TypeScript PASS | PASS |
| Lint PASS | PASS (0 errors) |
| Targeted tests PASS | PASS |
| Full regression suite PASS | NOT VERIFIED |
| Android release build PASS | PASS (APK exists) |
| Physical Android testing PASS | **NOT VERIFIED** |

---

## Workstream status table

| WORKSTREAM | STATUS | EVIDENCE | REMAINING ISSUE |
|---|---|---|---|
| A Security | PASS WITH LIMITATIONS | unit tests; release cleartext off; SSRF unit | Not device/pen-tested; audit vulns remain |
| B AdMob SSV | PASS WITH LIMITATIONS | admob-ssv + claim 503 | Production ads off; no device SSV credit |
| C Wallet/M-10 | PASS WITH LIMITATIONS | points 410; Wallet SoT; wallet tests | Concurrency soak missing |
| D Map/location | PASS WITH LIMITATIONS | distance + category-nearby + city-card tests | Device GPS NOT VERIFIED |
| E Search | PASS WITH LIMITATIONS | mic gone; 30 km constant | Device search NOT VERIFIED |
| F Hidden Gems | PASS WITH LIMITATIONS | confirm + unpublish tests | Device submit/approve/discovery NOT VERIFIED |
| G Reels/sharing | PASS WITH LIMITATIONS | like/share/close tests | Upload/post on device NOT VERIFIED |
| H Itinerary | PASS WITH LIMITATIONS | trips 38/38 TEST DB | Device flows NOT VERIFIED |
| I Budget | PASS WITH LIMITATIONS | slider tests + LOW generate | Device drag/generate NOT VERIFIED |
| J Reviews | PASS WITH LIMITATIONS | place blocked; vendor 1–5 | Device vendor review NOT VERIFIED |
| K Creator | NOT VERIFIED | source + formFile + draft wiring | **Blocker:** no device upload proof |
| L PalPoints | PASS WITH LIMITATIONS | nav tests; referral removed | **Blocker:** earn paths not on device |
| M Admin | PASS WITH LIMITATIONS | Places/gems tests | No production admin QA |
| N Reports | N/A | this file is the single final report | Older SUCCESS reports may conflict; ignore them |
| O Unrelated | N/A | crash/audit dumps | Keep out of release commit |
| Android APK | PASS | `app-release.apk` ~75.2 MiB | Not installed |
| Physical device | NOT VERIFIED | `adb devices` empty | **Release blocker** |
| Full regression | NOT VERIFIED | targeted only | **Release blocker** |

---

## What to do next (in order)

1. Attach a physical Android device (`adb devices` must show it).  
2. Install `android/app/build/outputs/apk/release/app-release.apk`.  
3. Run the section-28 smoke list; fail the release on any dead button, fake reward, or wrong location.  
4. Finish full server integration + e2e on `TEST_DATABASE_URL` only, sequential workers.  
5. Split the working tree into reviewable PRs. Do not merge everything.  
6. Do not deploy production, migrate production, or enable production AdMob until those gates are actually green.

**Verdict: RELEASE BLOCKED.**
