# PalSafar Riddle / Treasure Hunt — Release Gate Report

- **Feature:** Riddle/Treasure Hunt (creator Excel import → gated discovery → GPS check-in → photo submit → admin approve → wallet reward)
- **Gate run:** HTTP-level E2E against dedicated TEST DB (`palsafar_test_40zf`), live Render API
- **Evidence source:** this gate run only (2026-09-09)
- **Harness:** `server/scripts/release-gate-treasure-hunt.ts` (28 scenarios + bonus, 35 executed) via `server/scripts/_releasegate-boot.cjs`
- **Result:** **35 executed — 32 PASS, 3 FAIL, 0 SKIP**

---

## Gate results

| # | Check | Level | Test | Result | Evidence |
|---|-------|-------|------|--------|----------|
| G1 | Excel import: VALID / NEEDS_ATTENTION / INVALID classification | P1 | S1–S2 | PASS | total=6, valid=4, attention=1, invalid=1; breakdown Kolkata:2, Delhi:1, Mumbai:1, Pune:1 |
| G2 | Duplicate import blocked (same XLSX twice → 0 reruns) | P1 | S3–S4 | PASS | first=4, second=0; dup-blocked; trimmed city stored |
| G3 | GPS→city gating on discovery (Kolkata / New Delhi / Bhopal) | P1 | S5–S7 | PASS | correct city chosen; only that city's marker riddles returned; no cross-city leak |
| G4 | Hidden data: coordinates, answer, hintImage withheld from gameplay | P1 | S8–S9, S29–S30 | PASS | list/detail keys audited — forbidden fields absent; source-of-truth DB retains secrets (hiding proven) |
| G5 | Hint endpoint: gated, wrong-city 403, no-hint → null | P1 | S10 | PASS | hintImage locked behind hint endpoint; wrong-city 403 |
| G6 | Cross-city riddle access → 403 TREASURE_HUNT_CITY_MISMATCH | P1 | S11 | PASS | 403 + mismatch code |
| G7 | Check-in: outside 500m rejected; cross-city 403; inside 500m allowed | P1 | S12–S14 | PASS | outside 799.1m rejected (allowed=false); inside 49.9m allowed; cross-city 403 |
| G8 | Valid photo submission (201) | P0 | S15 | **FAIL** | 400 `Invalid GPS coordinates` — see Finding F1 |
| G9 | Cross-city submission → 403 | P0 | S16 | **FAIL** | 400 `Invalid GPS coordinates` (wrong status + wrong outcome) — see F1 |
| G10 | Client-side attack surface (spoofed distance / allowed / stale check-in) | P1 | S17–S19 | PASS | server recomputes GPS; spoofed fields ignored; stale check-in re-validated → rejected |
| G11 | Duplicate submission blocked (unique constraint) | P1 | S17 | PASS | DB P2002 rejected duplicate insert; submit HTTP route itself blocked (see F1) |
| G12 | Admin approval flow (PENDING → APPROVED); concurrent double-approve → single APPROVED + 409 | P0 | S18+bonus | PASS | single APPROVED, other 409; bonus: exactly 1 EARN(+120) WalletTransaction |
| G13 | Reward atomicity: approval ⇒ exactly one wallet credit | P0 | S20 | **FAIL** | wallet txs=0 — see Finding F2 |
| G14 | Reject flow (no reward) + admin comment persistence | P1 | S21–S22 | PASS | REJECTED with 0 txs; comment persisted and returned |
| G15 | City normalization (case/punctuation) + client `?city=` override ignored | P1 | S23–S24 | PASS | riddle stored lowercase still gated accessible; override ignored (GPS city) |
| G16 | Cross-city GET detail / POST hint / POST check-in / POST submit all denied | P1 | S25–S28 | PASS | 403/400 denials; no leakage |

---

## Findings

### F1 — P0 (BLOCKER): Submit endpoint broken — zod strips GPS fields
`POST /api/v1/riddles/:id/submit` returns `400 {"message":"Invalid GPS coordinates"}` for every request.
- Root cause: `submitRiddleSchema` only declares `photoUrl`; `validate.ts` replaces `req.body` with zod output, wiping `userLat`/`userLng`/`allowed`/`distanceMeters` → `Number(undefined)=NaN` in `validateCheckIn()`.
- Impact: S15 (valid submission), S16 (cross-city 403), and S26–S28 all masked; the whole user-facing submit → approve → reward loop is unreachable in production. Android client already sends `{photoUrl, userLat, userLng}` (`src/services/api/riddles.ts`), so fix is server-side only.
- Fix direction: add `userLat`, `userLng` to the schema (reject when absent); keep server recompute of `allowed`/distance.

### F2 — P1 (BLOCKER for reward integrity): Wallet credit fails silently on slow links
S20: approval returned 200 and status became APPROVED, but `wallet_transactions` = 0.
- Root cause: `earn()` uses an interactive `prisma.$transaction`; it exceeded Prisma's 5s default timeout over the transcontinental link, and the error is caught + logged (`Failed to award riddle points`, `riddles.service.ts` ~140) — the approval succeeds while points are silently skipped.
- Observed in S20 AND S18's own credit; the race handling itself is correct (bonus scenario: 2 concurrent approvals → exactly 1 EARN +120). Risk is latency/timeout, not concurrency.
- Fix direction: raise the interactive-transaction timeout (or use non-interactive txn), and do not swallow wallet-credit errors inside the approve path — surface for retry/alerts.

### F3 — P1 (deployment/config): `sslmode` required on this Prisma engine build
On a fresh clone (no sslmode in `DATABASE_URL`), every boot fails with Raw Prisma error **P1001** (Plaintext connection reset by the Render proxy). Empirical matrix on this build:
`require`/`no-verify`/`prefer` → P1001; **`sslmode=verify-ca` → connects**. Plaintext and `pg` also confirmed.
- Fix: add `sslmode=verify-ca` (not `require`) to `DATABASE_URL`/`DIRECT_URL` in env files.

---

## Security / behavior posture (passed)

All client weaken/attack scenarios were properly rejected: spoofed `distanceMeters`, spoofed `allowed=true`, stale prior check-in, `?city=` override, wrong-city access/hint/check-in/submit. Secret coordinates/answer/hint exist in DB but are withheld from list/detail/hint gameplay responses (audit scan source-of-truth check passed).

## Not executable in this environment

- **Android runtime gate:** no device/emulator attached (`adb devices` empty). Not faked.
- **Admin UI runtime gate:** no browser automation available; **`npm run build` passed** (Next.js production build, 58/58 routes incl. `/dashboard/riddle-hunt`; TS + preprocess clean) as static evidence only.

---

## Verdict: **NOT READY**

Blocking issues:
1. **F1 (P0)** — submit endpoint unusable (400 on all submissions) → release-critical functional break.
2. **F2 (P1)** — reward credit can vanish silently under timeout → wallet data-integrity risk.
3. **F3 (P1)** — DB connectivity requires `sslmode=verify-ca` env fix (P1001 on fresh deploys).

Non-blocking gate notes: Android + Admin runtime gates not executable here (build evidence only); all other scenarios in the 14-section checklist passed with evidence.