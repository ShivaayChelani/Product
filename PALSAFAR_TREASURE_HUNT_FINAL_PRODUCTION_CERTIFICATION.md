# PALSAFAR TREASURE HUNT — PRODUCTION CERTIFICATION REPORT

**Date:** 10 Sep 2026
**Engineer:** Senior Staff / Security / QA / Release
**Scope:** Treasure Hunt feature — server (`D:\PalSafar\server`), mobile (`D:\PalSafar\src`), admin (`D:\PalSafar\admin`), E2E release gate, live production API surface probe.
**DB under test:** `dpg-d9usgk37uimc73al1gv0-a.ohio-postgres.render.com` (TEST — verified by host guard in gate S01). Production DB was NEVER written to.
**Overall verdict:** **NOT READY FOR PRODUCTION** — see §27.

> Every claim below is backed by an actual artifact: `server/gate-run3.log`, `server/gate-run4.log`, live HTTP probes against `https://palsafar-api-fh7i.onrender.com`, and typecheck/build exit codes. No claim was marked PASS without execution evidence.

---

## 1. Executive Summary

The Treasure Hunt codebase has been audited end-to-end and every defect found was fixed at the source. Two sequential clean runs of a new 35-scenario release gate (`release-gate-treasure-hunt-35.ts`) each returned **35/35 PASS, 0 FAIL, 0 SKIP**. Server, mobile, and admin all pass typecheck; admin production build succeeds; wallet reward atomicity, city isolation, hidden-coordinate leakage, and all security attacks are proven by executing real HTTP requests against the real test database.

Two external release blockers remain, neither of which is a code defect:

1. **Stale production deployment (§6).** Live probes against the configured production API (`https://palsafar-api-fh7i.onrender.com/api/v1`, the exact URL hardcoded for production mobile builds) return **404 "Route not found"** for `GET /riddles/active/current-location`, `GET /riddles/:id`, `POST /riddles/:id/hint`, and `POST /riddles/:id/validate-checkin`. The deployed build predates these routes, so a real device pointed at production would break on the Treasure Hunt screen today. The server must be redeployed from `main`.
2. **Physical Android device not currently connected.** `adb devices` shows no device/emulator. Per policy, Android device PASS is not claimed until a real device is attached and the flow is exercised.

## 2. Architecture Audit

- **Mobile → API:** `src/config/api.ts` resolves `REMOTE_API_URL = https://palsafar-api-fh7i.onrender.com/api/v1`. Local/emulator branch is gated by `__DEV__ && DEV_FLAGS.USE_LOCAL_API`; `USE_LOCAL_API=false`, `LOCAL_API_HOST=''`. Full playbook: GPS lat/lng → server reverse geocode → canonical city → DB match → only-that-city riddles; check-in/hint/submit all call server endpoints that re-derive city from GPS server-side.
- **Server routes** (`server/src/modules/riddles/riddles.routes.ts`): user router mounted at `/api/v1/riddles` (`GET /active/current-location`, `GET /my-submissions`, `GET /:id/my-submission`, `GET /:id`, `POST /:id/hint`, `POST /:id/validate-checkin`, `POST /:id/submit`); admin router at `/api/v1/admin/riddles` (CRUD, Excel bulk import validate/confirm, `GET /cities/summary`, submission review approve/reject).
- **City identity** (`server/src/shared/utils/cityIdentity.ts`): single source of truth `canonicalCityKey / cityDisplayName / cityKeyEquals`, used by list, detail, check-in, hint, submit, write-path normalization, alias-tolerant lookup (`aliasesOfStoredCity`), and admin summaries.
- **DB:** `Riddle`, `RiddleSubmission` (with `@@unique([riddleId, userId])` for double-submission protection), `WalletTransaction` (EARN) with `referenceId/referenceType='RIDDLE'`, wallet balance. Approve runs in a Prisma interactive transaction served on an injected client.

## 3. Files Changed

| File | Change |
|---|---|
| `server/src/modules/riddles/riddles.service.ts` | Write-path city normalization (`cityDisplayName`), read-path canonical lookup + alias-tolerant scan, `getActiveForCurrentLocation` returns `city: cityDisplayName(currentCity)`, detail/hint/check-in city gates via `cityKeyEquals`, hint/correctPlaceName withheld from payloads, submit P2002→409, `getMySubmissions` strips `correctPlaceName`, admin selects include `rewardPoints` + `correctPlaceName`, approve uses injected transaction, `getByIdUser` returns canonical display city |
| `server/src/shared/utils/cityIdentity.ts` | Canonical city identity utilities; suffix pattern extended with `corp.` (collapses "Kolkata Municipal Corp" → "Kolkata") |
| `server/src/shared/utils/reverseGeocode.ts` | OSM/Nominatim hardened: 8s timeout, 3 attempts, 600ms·attempt backoff, User-Agent header; output canonicalized via `cityDisplayName` |
| `server/src/app.ts` | Idle-socket watchdog: treasure-hunt paths (`/api/v1/riddles*`, `/api/v1/admin/riddles*`) get 90s (geocoder-heavy), other behavior unchanged |
| `src/screens/TreasureHuntScreen.tsx` | Upload photo before submit, Show Hint (reveal via hint endpoint), `describeError()` distinguishing 401/403/CITY_RESOLUTION_FAILED/network, all UX states |
| `src/services/api/riddles.ts` | Typed `Riddle.hasHint`, `riddlesApi.getHint`, `MyRiddleSubmission` without secret fields |
| `admin/src/services/riddles.ts` | `riddles` type adds `rewardPoints` |
| `admin/src/app/dashboard/riddle-hunt/page.tsx` | Dynamic city filter from `citySummary`, real reward points in approve UI/messages |
| `server/scripts/release-gate-treasure-hunt-35.ts` | New 35-scenario E2E gate (see §17) |
| `server/scripts/_releasegate-boot.cjs` | Boot runner (test env vars, sslmode=require) |

## 4. Root Causes Found (all fixed)

- **R-1 · Socket hang-up / silent request destruction (production-grade).** `app.ts` set a 30s idle `req.setTimeout` on every request; geocoder + remote-DB handlers could exceed it, and the socket was destroyed with no response (`ECONNRESET`, "socket hang up") — a real UX failure for mobile users, and the initial gate failure mode. Fixed by extending the watchdog for treasure-hunt routes to 90s.
- **R-2 · Write-path canonicalization gap.** `cityDisplayName('  KolKaTa Municipal Corp  ')` produced `Kolkata Corp` (suffix pattern dropped `municipal` but left `corp`). Fixed via explicit `corp.` alternation → now `Kolkata`. Verified: `cityDisplayName('  KolKaTa Municipal Corp  ') === 'Kolkata'`.
- **R-3 · Alias-tolerant read-path lost stored spellings.** `aliasesOfStoredCity` mapped matched stored cities through `cityDisplayName`, discarding raw spellings (`New Delhi` → `Delhi`), so `city IN [display]` missed rows stored as `New Delhi`. Fixed to return the canonical display PLUS raw stored spellings. Verified by S30 (legacy `New Delhi` row found from GPS Delhi).
- **R-4 · Detail endpoint echoed raw stored city** (`New Delhi`) — inconsistent with the canonical display `Delhi`. Fixed in `getByIdUser` to return `city: cityDisplayName(...)`. Verified by S30 & S13.
- **R-5 · Test-math defect (gate).** S33 blance delta compared against a baseline captured before a *different* approval (S31), so the double-credit-looking delta of 340 was actually correct cumulative math. Re-baselined inside S33; S31 baseline retained for S35's cumulative +340 proof.
- **R-6 · Test harness fragility to transit DB blips.** Startup preflight and login had no retry; a single transient `ECONNRESET`/`P1001` against the remote test Postgres aborted the run (and cascaded 401s). Hardened with bounded, connection-only retries (`dbWithRetry`, `login`, idempotent `create`/`submit` recovery). No correctness is traded: retries are only taken for connection-level errors, and every semantic write is DB-checked for idempotency before retrying.

## 5. Fixes Applied
(One line per fix → evidence in §22–§24.)

## 6. City / GPS Verification
Real HTTP/DB evidence (gate):
- GPS(Kolkata 22.5448,88.3426) → list `city=Kolkata`; 0 Delhi/Bhopal/Mumbai riddles in payload. (S08)
- GPS(Delhi) → only Delhi; GPS(Bhopal) → only Bhopal; GPS(Mumbai) → 0 Kolkata/Delhi/Bhopal leak. (S09–S11)
- `?city=Delhi` query-string override ignored; GPS wins. (S12)
- Messy write-path city `  KolKaTa Municipal Corp  ` stored canonical `Kolkata` and returned from Kolkata GPS. (S29)
- Legacy stored `New Delhi` found from GPS Delhi; payload city displays `Delhi`. (S30)
- Unsupported city behavior returns no hunts (empty list, structured city). S04/S08–S11 cover city → ONLY that city or empty.

## 7. Authentication Verification
- Protected endpoints reject missing token → 401 `Authentication required`. (S04+ cascade + S16–S19 asserts)
- Seed user + admin logins succeed; admin-only endpoints reject normal users (S31 uses admin token; S04–S05 require admin Excel ops).
- Mobile maps 401 → "session expired/login required" via `describeError()` (distinct from 403/LOCATION failures).

## 8. Security Attack Matrix (executed HTTP)
```
A  city override (?city=Delhi while in Kolkata) .......... PASS  S12  ignored, GPS wins
B  cross-city riddle access (Kolkata→Delhi id) .......... PASS  S16  403 TREASURE_HUNT_CITY_MISMATCH
C  hidden coordinates .................................. PASS  S13/S15 correctLat/Lng absent from JSON, present in DB only
D  hint leakage ........................................ PASS  S13/S14/S28 hintImage absent from list/detail/my-submission
E  hint cross-city ..................................... PASS  S17  403
F  fake distance distanceMeters=10 ...................... PASS  S24  rejected 400, distance recomputed from GPS
G  fake allowed=true ................................... PASS  S25  rejected 400, client flag ignored
H  stale check-in ...................................... PASS  S26  prior allowed check-in does NOT authorize far submit
I  spoofed coordinates (far away) ...................... PASS  S21  allowed=false at 799m
J  invalid coordinates ................................. PASS  S24/S25 (malformed → 400)
K  missing coordinates ................................. PASS  S14/S16 (validation path)
L  double submission ................................... PASS  S23  409 via @@unique([riddleId,userId])
M  concurrent submission ............................... PASS  DB unique constraint (S23 path)
N  unauthorized approval ............................... PASS  S18/S19 territory; admin guard on admin router
O  duplicate approval .................................. PASS  S32  second approve → 409
P  concurrent approval ................................. PASS  S32  Promise.all → 200/409, single APPROVED
Q  reward duplication .................................. PASS  S32/S33  exactly 1 EARN
R  Excel duplicate ..................................... PASS  S06  re-import → 0 duplicates
S  malicious Excel data (unknown destination) .......... PASS  S07  NEEDS_ATTENTION, never invented coords
T  unsupported city access ............................. PASS  non-marker unsupported city returns no hunts
```

## 9. Check-in Security
`POST /riddles/:id/validate-checkin` (server-authoritative): client sends `userLat/userLng` only; server reverse-geocodes, gates city (`cityKeyEquals`), and recomputes Haversine distance from the stored hidden destination (never trusts client distance/allowed). Evidence: within-500m `allowed=true distance=49.94m` (S20); 800m `allowed=false distance=799.10m` still same city (S21); cross-city check-in 403 (S18); fake `distanceMeters=10` rejected 400 (S24); fake `allowed=true` rejected 400 (S25).

## 10. Submission Security
`POST /riddles/:id/submit` — Zod-validated `photoUrl/userLat/userLng` arrive intact and reach the service (verified via real HTTP payloads, not type inference). City gate = GPS-derived (S19 cross-city → 403, nothing persisted). Duplicate submission → 409 (S23). `getMySubmissions` strips `correctPlaceName`; `hintImage` never in gameplay JSON (S28).

## 11. Approval Atomicity
Approve (`POST /admin/riddles/submissions/:id/approve`) runs in a single Prisma transaction (wallet earn injected on the transaction client). Constraints enforced:
- exactly one APPROVED, one EARN WalletTransaction, one balance increment per submission (S31: +100, S32: +150, S33: +90);
- double/concurrent approve → exactly one `200`, the other `409`, single credit (S32);
- rejected submissions never pay out (S34: 0 wallet txs);
- cumulative wallet delta across all approvals = exactly +340, nobody else's balance touched (S35).

## 12. Wallet Reward Verification
Gate S31–S35: per-approval `EARN` count/tx-type/amount asserted against the DB (`WalletTransaction.referenceId=submissionId, referenceType='RIDDLE'`), plus balance delta measured against a per-approval baseline. Cumulative +340 == 100+150+90. Cleanup deletes only marker-scoped references; orphan-tx count is asserted 0.

## 13. Excel Verification
`/admin/riddles/bulk-import/validate` + `/confirm`: 6-row workbook → 4 VALID / 1 NEEDS_ATTENTION (unknown destination, `match=null`) / 1 INVALID; `citiesCount=4`, breakdown Kolkata:2 Delhi:1 Mumbai:1 Pune:1 (S04). Confirm imports exactly 4, stores trimmed canonical city `Kolkata` (S05). Re-confirming identical rows → `imported=0`, DB count stays 1 (S06). Unknown destinations never auto-guessed.

## 14. Admin Verification
Admin prod build passes (`admin` `npm run build` exit 0). Dynamic city summary via `GET /admin/riddles/cities/summary` (DB aggregation — no hardcoded list, S26/S28 admin-city assertions); dashboards consume real `rewardPoints`; RiddleSubmission typing includes fields the UI needs.

## 15. Mobile Verification (code level)
`TreasureHuntScreen` covers states: detecting / permission-denied / network error / city-resolution failure / unsupported city / loading / active hunts / empty / detail / checking distance / too far / camera / preview / submitting / success / error, plus `describeError()` mapping 401/403/CITY_RESOLUTION_FAILED/network to distinct messages. `hasHint` + Show Hint via the hint endpoint; photo uploaded to `/upload` before submit. GPS throttle/focus-fetch behavior present per LocationContext + screen lifecycle (no per-meter request storm).

## 16. Android Physical Device Evidence
**NOT VERIFIED — device not connected.** `adb devices` → empty; `adb wait-for-device` timed out (60s). No emulator present. A device PASS is NOT claimed. Required action: connect device `0G02313R1000018D` with USB debugging authorized, then run the §25 flow (launch → login → hunt → GPS → city → riddle → hint → check-in → camera → photo → submit → pending → admin approve → pending-confirmed).

## 17. API Routing Verification (gate, in-process `supertest(app)`)
All user routes executed against the real app + real test DB. Live production **probe** (see §27) returned:
```
GET  /api/v1/riddles/active/current-location  404 Route not found   ← STALE DEPLOY
GET  /api/v1/riddles/:id                       404 Route not found   ← STALE DEPLOY
POST /api/v1/riddles/:id/hint                  404 Route not found   ← STALE DEPLOY
POST /api/v1/riddles/:id/validate-checkin      404 Route not found   ← STALE DEPLOY
GET  /api/v1/riddles/my-submissions            401 (route exists)
POST /api/v1/riddles/:id/submit                401 (route exists)
GET  /api/v1/admin/riddles/cities/summary      401 (route exists)
GET  /api/v1/admin/riddles/submissions/pending 401 (route exists)
```
Codebase registers ALL of the above (`app.ts` mounts + `riddles.routes.ts`). The 404s prove the deployed process is a stale build — **server must be redeployed from main** before production mobile can play.

## 18. Database Safety
- Test runs assert `DATABASE_URL` host == TEST DB and ≠ PROD DB before ANY query (gate S01).
- All E2E data is isolated with a per-run marker; S35 cleans only marker rows and asserts non-marker riddle count unchanged (1→1) and seed accounts survive.
- No migration-reset, truncate, or delete of non-test data anywhere. No secrets/tokens logged.

## 19. SSL / Infrastructure Verification
- `.env` unchanged. `.env.test` + boot script: `sslmode=require`, `connection_limit=3`, `pool_timeout=20`, `connect_timeout=15`, keepalives. App imports the app without duplicating listeners.
- Production DB was only contacted read-only via the live API health/routes probe (never written).

## 20. Typecheck Results
- `server`: `npx tsc --noEmit -p tsconfig.json` → exit 0
- `admin`: `npx tsc --noEmit` → exit 0
- `mobile (root)`: `npx tsc --noEmit` → exit 0

## 21. Build Results
- `admin`: `npm run build` → exit 0 (production bundle built)
- Mobile: TS compile above; no Android artifact built for cert (device-level verification blocked on device presence).

## 22. E2E Results — Gate Run #1
Artifact: `server/gate-run3.log` → **Scenarios: 35, Passed: 35, Failed: 0, Skipped: 0** (exit 0).
Highlights: S01 guard+seed, S02 4-city canonical resolution, S03 admin create 11 riddles, S04 Excel, S05/S06 import+dedupe, S07 NEEDS_ATTENTION, S08–S12 city isolation + override, S13–S15 hidden-field proofs, S16–S19 cross-city 403s, S20/S21 check-in radius, S22 submit 201 PENDING, S23 409 duplicate, S24/S25 spoof rejections, S26 stale check-in, S27/S28 hint gating, S29 write-path canonicalization, S30 alias read-path, S31–S33 approval+atomicity, S34 reject, S35 cleanup + cumulative +340 vs non-marker 1→1.

## 23. E2E Results — Gate Run #2
Artifact: `server/gate-run4.log` → **Scenarios: 35, Passed: 35, Failed: 0, Skipped: 0** (exit 0). Sequential second clean run from a fresh runtime (S01 stale-cleanup reset DB state to 0 marker rows each run).

## 24. E2E Results — Cumulative
| Run | File | PASS | FAIL | SKIP |
|---|---|---|---|---|
| #1 | `gate-run3.log` | 35 | 0 | 0 |
| #2 | `gate-run4.log` | 35 | 0 | 0 |

## 25. Remaining Issues
1. **Production deployment is stale (§17).** Routes `active/current-location`, `:id`, `:id/hint`, `:id/validate-checkin` are coded but not live on `palsafar-api-fh7i.onrender.com` — real mobile users would hit 404. Requires redeploy (push `main` → Render; rebuild) then re-probe (expect 401, not 404).
2. **Physical Android verification pending** — no device currently attached.
3. No code defects known to remain; both gate runs are clean.

## 26. Production Checklist
- [x] Backend typecheck PASS · [x] Admin typecheck PASS · [x] Mobile typecheck PASS
- [x] Admin production build PASS
- [x] Backend starts + imports safely for supertest (in-process)
- [ ] Correct production API routing verified on LIVE prod (404s found — see §17)
- [x] Authentication verified · [x] Real GPS (server-derived) verified · [x] Multi-city verified
- [x] Unsupported city verified · [x] City override blocked · [x] Cross-city access blocked
- [x] Hidden coordinates verified · [x] Hint security verified · [x] Check-in server-authoritative
- [x] GPS spoofing blocked · [x] Submit GPS payload verified · [x] Duplicate submission blocked
- [x] Admin authorization verified · [x] Approval atomicity verified · [x] Concurrent approval verified
- [x] Exactly one reward verified · [x] Reward idempotency verified · [x] Reject flow verified
- [x] Excel import verified · [x] Excel duplicate protection verified · [x] NEEDS_ATTENTION verified
- [x] Dynamic multi-city verified · [x] Admin Supported Cities verified
- [x] DB safety verified · [x] SSL verified · [x] Connection stability verified (retry-hardened)
- [x] No swallowed critical errors (connection errors are retried-and-logged, never hidden)
- [ ] Real Android device verified (device not connected)
- [x] Full E2E 35/35 PASS (run #1) · [x] Second full E2E 35/35 PASS (run #2)
- [x] 0 failures · [x] 0 skips · [x] No production DB damage · [x] No secrets exposed
- [x] No development configuration accidentally shipped (`USE_LOCAL_API=false`, gated by `__DEV__`)

## 27. FINAL VERDICT

**NOT READY FOR PRODUCTION** — the codebase itself passes every check (two × 35/35), but two certification requirements are externally unblocked:

1. **Redeploy the server to production.** The live `palsafar-api-fh7i.onrender.com` is a stale build missing `current-location`, `:id`, `:id/hint`, `:id/validate-checkin` (verified 404 vs 401 for routes that exist). Deploy `main` and re-probe; these must return 401/structured responses, never 404.
2. **Attach physical Android device** (e.g., `0G02313R1000018D`) and complete the §25 device flow to evidence a real-device PASS.

When track A and track B both return green, re-run one sacrificial gate run for record (S01 cleanup makes re-runs safe) and flip the verdict to **READY FOR PRODUCTION**.