# PalSafar — Adversarial Security Assessment

**Date:** 2026-08-12  
**Scope:** PalSafar mobile (`src/`), API (`server/`), admin (`admin/`), Android/iOS config  
**Method:** Independent read-only code audit + static analysis + `npm audit` (no live exploitation, no code changes)  
**Assumption:** Prior integration/hardening work is **not** treated as proof of security.

> **This report does not certify the application as secure.** Findings are based on source review and dependency scans. Runtime penetration testing against staging/production was **not** fully executed in this pass.

---

## Executive summary

PalSafar has meaningful security controls in many areas (JWT algorithm pinning, refresh-token reuse detection, bcrypt cost 12, OTP hashing, offer-redemption row locking, vendor ownership via `getMyVendor(req.user.id)`, reel owner checks on mutate, collaboration party checks). However, several **critical authorization and fraud paths** were identified that would allow:

1. **Traveler → Creator privilege bypass** without admin approval  
2. **Unlimited PalPoints farming** via client-claimed rewarded ads (no ad-network verification)  
3. **Remote partner redemptions** without vendor presence  
4. **Account/admin enumeration** via auth response differences  
5. **Transport and credential hygiene issues** in mobile/scripts (cleartext HTTP, hardcoded QA passwords)

**Overall posture:** Not production-secure without remediating CRITICAL and HIGH items below.

---

## CRITICAL

### C-01 — Traveler can self-grant Creator role (authorization bypass)

| Field | Detail |
|-------|--------|
| **Vulnerability** | Unauthenticated admin review bypass; effective **role escalation** |
| **Affected file** | `server/src/modules/social/social.service.ts` (`updateProfile` ~319–348, `getApprovedCreatorProfile` ~579–598) |
| **Endpoint** | `PATCH /api/v1/social/creators/profile` |
| **Route wiring** | `server/src/modules/social/social.routes.ts:22` — **`authenticate` only**, no `requireCreatorRole` |
| **Attack scenario** | User A (tourist) calls `PATCH /social/creators/profile` with `{ username, bio }`. Server creates `CreatorProfile` with `status: 'APPROVED'`. On next token refresh / `GET /auth/me`, `healSpecialtyRolesFromDomain` grants `CONTENT_CREATOR`. User A accesses creator dashboard, reels, collaborations, analytics. |
| **Why protection fails** | Approval workflow (`applyCreator` + admin verify) is bypassed. `getApprovedCreatorProfile` also force-upgrades PENDING/REJECTED profiles to APPROVED on creator mutations. |
| **Impact** | Full creator capability without vetting; undermines closed beta / trust & safety |
| **Recommended fix** | Remove auto-APPROVED creation; require `requireCreatorRole` or pending-only profile updates; never mutate status to APPROVED except via admin `verifyCreator` / `roleTransitionService` |
| **Test used** | Static trace: route → `updateProfile` → `status: 'APPROVED'` create path |

---

### C-02 — Rewarded-ad PalPoints farming (no server-side ad verification)

| Field | Detail |
|-------|--------|
| **Vulnerability** | Client-trusted reward claim |
| **Affected file** | `server/src/modules/monetization/ads.service.ts` (`claimRewardedAd`) |
| **Endpoint** | `POST /api/v1/monetization/ads/claim-reward` |
| **Attack scenario** | Authenticated attacker POSTs `{ "eventId": "ad_event_00000001", "platform": "android" }` with unique IDs. Server credits configured points per claim. Parallel requests can race daily-limit checks (cooldown/limit checked **outside** DB transaction). |
| **Why protection fails** | No AdMob/ironSource SSV callback; `eventId` is client-supplied and only format-validated |
| **Impact** | Economic fraud; wallet inflation; partner/vendor liability |
| **Recommended fix** | Verify ad completion server-side (SSV); enforce cooldown + daily cap inside same `$transaction` as `walletService.earn` |
| **Test used** | Static review of `claimRewardedAd` — no external ad API call |

---

### C-03 — Android release allows cleartext HTTP globally

| Field | Detail |
|-------|--------|
| **Vulnerability** | Transport security misconfiguration |
| **Affected files** | `android/app/src/main/AndroidManifest.xml` (`usesCleartextTraffic="true"`), `android/app/src/main/res/xml/network_security_config.xml` (`cleartextTrafficPermitted="true"`) |
| **Attack scenario** | On same Wi‑Fi / compromised network, MITM reads or modifies HTTP API traffic (tokens, OTP, PII) if any HTTP endpoint is used |
| **Why protection fails** | Cleartext not restricted to debug builds |
| **Impact** | Credential/session interception on untrusted networks |
| **Recommended fix** | Debug-only cleartext; release builds HTTPS-only with network security config scoped to dev |
| **Test used** | Manifest / NS config review |

---

### C-04 — Hardcoded QA credentials in repository scripts

| Field | Detail |
|-------|--------|
| **Vulnerability** | Committed operational passwords |
| **Affected files** | `server/scripts/verify-credentials.cjs`, `server/scripts/qa-critical-workflows.cjs`, `server/scripts/archive/bootstrap-remote-credentials.cjs` (and related archive scripts) |
| **Attack scenario** | Attacker runs scripts against production API URL or guesses canonical account emails with known passwords from repo history |
| **Why protection fails** | Passwords embedded in version control |
| **Impact** | Account takeover for seeded/canonical users if same passwords exist in production |
| **Recommended fix** | Remove scripts from repo or load creds from CI secrets; rotate all affected accounts |
| **Test used** | Repository secret scan (values redacted) |

---

## HIGH

### H-01 — JWT roles/permissions trusted without DB revalidation

| Field | Detail |
|-------|--------|
| **Vulnerability** | Stale privilege + forged claims if `JWT_SECRET` compromised |
| **Affected file** | `server/src/middleware/auth.ts` (`toRequestUser`, `requireAdmin`, `requireRoles`) |
| **Endpoints** | All authenticated/admin routes |
| **Attack scenario** | (a) Admin demoted in DB retains JWT admin for up to `JWT_EXPIRES_IN` (~1h). (b) With leaked secret, attacker signs `{ roles: ['SUPER_ADMIN'] }`. |
| **Why protection fails** | `req.user.roles` derived from JWT only; access tokens not revocable via `jti` |
| **Impact** | Unauthorized admin/specialty access |
| **Recommended fix** | DB role version on user; revalidate on sensitive routes; shorten access TTL; token denylist |
| **Test used** | Middleware static analysis |

---

### H-02 — Admin account enumeration via OTP verify responses

| Field | Detail |
|-------|--------|
| **Vulnerability** | Account enumeration |
| **Affected file** | `server/src/modules/auth/auth.service.ts` (`loginWithOtp`) |
| **Endpoint** | `POST /api/v1/auth/login-otp/verify` |
| **Attack scenario** | Attacker tries wrong OTP: **401** = no user; **403** `"not an admin"` = user exists but non-admin; distinguishes admin targets |
| **Impact** | Targeted phishing / OTP brute force against admins |
| **Recommended fix** | Uniform **401** with generic message for all failure modes |
| **Test used** | Response branch review |

---

### H-03 — Registration & unverified-login enumeration

| Field | Detail |
|-------|--------|
| **Vulnerability** | Account enumeration |
| **Affected file** | `server/src/modules/auth/auth.service.ts` (`register`, `login`) |
| **Endpoints** | `POST /auth/register`, `POST /auth/login` |
| **Attack scenario** | Register returns **409** for verified email vs **201** for new/unverified. Login returns **403 EMAIL_NOT_VERIFIED** with email in body vs **401** for wrong password. |
| **Impact** | Email existence oracle for marketing/abuse |
| **Recommended fix** | Generic responses; no email in unverified-login body |
| **Test used** | Static branch analysis |

---

### H-04 — AI recommendations IDOR (cross-user preference leak)

| Field | Detail |
|-------|--------|
| **Vulnerability** | IDOR / privacy leak |
| **Affected files** | `server/src/modules/ai/ai.routes.ts`, `ai.controller.ts`, `ai.service.ts` |
| **Endpoint** | `GET /api/v1/ai/recommendations?userId=<victim>` (`optionalAuth`) |
| **Attack scenario** | User A passes User B's UUID; server builds recommendations from B's behavior vector |
| **Why protection fails** | Query `userId` not bound to authenticated caller (unlike `GET /ai/user-vector/:userId`) |
| **Impact** | Inference of victim travel preferences |
| **Recommended fix** | Ignore query `userId` unless admin; default to `req.user.id` |
| **Test used** | Controller param vs `getUserVector` comparison |

---

### H-05 — Partner PalPoints redemption without vendor code

| Field | Detail |
|-------|--------|
| **Vulnerability** | Unauthorized / remote redemption |
| **Affected file** | `server/src/modules/monetization/pal-points-partner.service.ts` |
| **Endpoint** | `POST /api/v1/monetization/pal-points-partner/redeem` |
| **Attack scenario** | User redeems partner offer from anywhere; points debited without vendor presence proof |
| **Why protection fails** | Standard `redeemOffer` requires `vendorCode`; partner path does not |
| **Impact** | Fraudulent discounts; partner disputes |
| **Recommended fix** | Require vendor code / QR / staff confirmation like core redemption |
| **Test used** | Service comparison |

---

### H-06 — Challenge completion awards points without proof enforcement

| Field | Detail |
|-------|--------|
| **Vulnerability** | Reward fraud |
| **Affected file** | `server/src/modules/challenges/challenges.service.ts` |
| **Endpoint** | `POST /api/v1/challenges/:id/complete` |
| **Attack scenario** | Complete challenge with empty body despite `proofRequired: PHOTO|VIDEO|QR|GPS` |
| **Impact** | PalPoints inflation |
| **Recommended fix** | Enforce proof type before `walletService.earn` |
| **Test used** | Schema vs service logic gap |

---

### H-07 — Refresh tokens stored in plaintext

| Field | Detail |
|-------|--------|
| **Vulnerability** | Session compromise on DB breach |
| **Affected file** | `server/prisma/schema.prisma` (`RefreshToken`), `auth.service.ts` |
| **Impact** | Mass session hijack if database exfiltrated |
| **Recommended fix** | Store SHA-256 hash of refresh token; compare on lookup |
| **Test used** | Schema + createLoginSession review |

---

### H-08 — Default / seed passwords in codebase

| Field | Detail |
|-------|--------|
| **Vulnerability** | Weak known credentials |
| **Affected files** | `server/src/config/db-seed.ts`, `server/prisma/seeds/02_users.ts`, `server/src/config/seed-data.ts` |
| **Pattern** | Fallbacks such as `Admin@123`, `User@123`, `Vendor@123`, `Creator@123` |
| **Impact** | Trivial login if `SYNC_CANONICAL_CREDENTIALS=true` in production or seeds applied |
| **Recommended fix** | Random one-time passwords; never sync known passwords in prod |
| **Test used** | Seed config review |

---

### H-09 — Dependency vulnerabilities (HIGH severity)

| Field | Detail |
|-------|--------|
| **Vulnerability** | Known CVEs in dependencies |
| **Scan command** | `npm audit --audit-level=high` (2026-08-12) |
| **Results** | **Mobile root:** 16 vulns (10 high, 6 moderate). **Admin:** 9 high (notably **axios** prototype pollution / DoS advisories). **Server:** 9 vulns (1 high — **sharp/libvips** chain, 8 moderate). |
| **Impact** | DoS, request smuggling edge cases (axios), image processing CVEs |
| **Recommended fix** | Triage per workspace; patch axios in admin; evaluate sharp upgrade path; add CI `npm audit` |
| **Test used** | `npm audit` (no blind upgrades performed) |

---

## MEDIUM

### M-01 — Password-reset OTP replay (two-step flow)

| **File** | `server/src/modules/auth/auth.service.ts` |
| **Endpoints** | `POST /auth/verify-reset-otp`, `POST /auth/reset-password` |
| **Issue** | OTP verified but not consumed until reset; replay within 15 min |
| **Fix** | Delete OTP on verify or single-step reset |

### M-02 — OTP brute force keyed by IP only

| **File** | `server/src/config/rateLimit.ts` |
| **Endpoints** | Register verify, reset verify |
| **Issue** | Distributed IPs can parallel-guess one victim email |
| **Fix** | Per-email rate limits on all OTP verify endpoints |

### M-03 — Rewarded-ad / check-in daily limit TOCTOU

| **Files** | `ads.service.ts`, `places.crud.service.ts`, `pointRules.service.ts` |
| **Issue** | Cooldown/daily cap checked outside `$transaction` |
| **Fix** | Mirror `earnGameComplete()` pattern |

### M-04 — Client-chosen pay amount on vendor pay

| **Endpoint** | `POST /api/v1/redemptions/pay` |
| **Issue** | Body `{ vendorCode, points }` — user selects amount; no dedicated rate limit |
| **Fix** | Caps + rate limit + fraud block (not just flag) |

### M-05 — GPS-spoofable itinerary checkpoint rewards

| **File** | `server/src/modules/trips/trips.service.ts` |
| **Issue** | Client lat/lng trusted for checkpoint verification |
| **Fix** | Velocity checks, attestation, or manual review for high-value rewards |

### M-06 — Admin-triggered SSRF in image pipeline

| **File** | `server/src/modules/canonical/services/image-pipeline.service.ts` |
| **Endpoint** | `POST /api/v1/canonical/images/:id/pipeline` |
| **Issue** | Fetches user-supplied image URLs without RFC1918/metadata IP block |
| **Fix** | URL allowlist + block private/link-local ranges |

### M-07 — JWT specialty admin demotion lag

| **Impact** | Same as H-01 but operational severity |
| **Fix** | Token version / forced re-auth on role change |

### M-08 — Broad admin read roles see cross-tenant data

| **File** | `collaborations.service.ts`, admin routers |
| **Issue** | `SUPPORT_AGENT`, `ANALYTICS_VIEWER` can read any collaboration/user per design |
| **Fix** | Document as accepted risk or narrow RBAC |

### M-09 — Username availability oracle (authenticated)

| **Endpoint** | `GET /api/v1/social/creators/check-username?username=` |
| **Issue** | Returns `{ available: false, message: 'Username already used' }` — reveals taken usernames to any logged-in user |
| **Mitigation present** | Requires auth; case-insensitive check; `@` stripped; DB `@unique` on username |
| **Fix** | Generic message; optional rate limit (none dedicated today) |

### M-10 — Dual points ledgers (wallet vs pointBalance)

| **Files** | `wallet.service.ts`, `points.service.ts` |
| **Issue** | User-facing balance paths may diverge; admin ops confusion |
| **Fix** | Single ledger source of truth |

### M-11 — Mobile token storage fallback

| **File** | `src/services/api/client.ts` |
| **Issue** | JWT falls back to AsyncStorage if encrypted storage fails |
| **Fix** | Fail closed or force re-auth |

### M-12 — Legacy vendor password in local storage

| **Files** | `src/types/index.ts`, `src/services/localStorageService.ts`, `src/context/DataContext.tsx` |
| **Issue** | Offline vendor login path stores/compares plaintext password when `USE_SERVER_API` false |
| **Fix** | Remove legacy path |

### M-13 — Unauthenticated reel view inflation

| **Endpoint** | `PATCH /api/v1/social/reels/:id/views` |
| **Issue** | No auth; analytics manipulation |
| **Fix** | Auth optional + rate limit + anomaly detection |

### M-14 — No rate limit on redemption endpoints

| **File** | `server/src/modules/redemptions/redemptions.routes.ts` |
| **Issue** | `/redeem`, `/pay` rely on global 8000/15min only |
| **Fix** | Per-user redemption limiter |

---

## LOW

| ID | Finding | Location |
|----|---------|----------|
| L-01 | Logout endpoint no auth-specific rate limit | `auth.routes.ts` |
| L-02 | Helpful votes on reviews without per-user dedup | places/vendors review routes |
| L-03 | Admin JWT bypasses global rate limit | `rateLimit.ts:80-95` |
| L-04 | 40-bit OTP entropy (8 Crockford chars) | `auth.service.ts` |
| L-05 | FCM token logged in iOS DEBUG | `ios/PalSafar/AppDelegate.swift` |
| L-06 | Hardcoded LAN IP in dev bundle | `src/config/devFlags.ts` |
| L-07 | AdMob test app IDs in release defaults | `app.json`, `Info.plist`, `build.gradle` |
| L-08 | CORS allows missing Origin in production | `server/src/app.ts` |
| L-09 | Gemini API key in query string (server logs risk) | `ai.service.ts` |

---

## INFO — Controls observed (not vulnerabilities)

| Area | Observation |
|------|-------------|
| **Reel IDOR (mutate)** | `updateOwnReel` / `deleteOwnReel` check `reel.creatorId === profile.id` |
| **Reel visibility** | Public `listReels` filters `status: APPROVED`; `getReelById` hides drafts/archived unless owner/collab vendor |
| **Draft publish** | `publishDraft` verifies `reel.creatorId === profile.id` |
| **Vendor isolation** | Vendor controllers resolve vendor via `getMyVendor(req.user.id)` — client `vendorId` not trusted for ownership |
| **Collaboration mutations** | `accept` checks `creatorUserId`; `cancel` party-scoped; `assertPartyAccess` on detail |
| **Offer redemption core** | Row lock + atomic debit + vendor code validation |
| **Uploads (multipart)** | Auth + magic bytes + size limits + Cloudinary |
| **Raw SQL (runtime API)** | Parameterized `$queryRaw` / bind params in search/geo; table whitelist in database-explorer |
| **JWT crypto** | HS256 pinned; secret min length |
| **Refresh reuse** | Family revocation on reuse detected |
| **Log redaction** | Pino redact paths for passwords/tokens; mobile Sentry scrubber |
| **Swagger** | Disabled in production |
| **Username DB** | `@unique` on `CreatorProfile.username`; case-insensitive app checks |
| **SSRF surface** | No general user URL fetch in hot paths except admin image pipeline (M-06) |

---

## Section notes (audit checklist)

### 1. Authentication — **FAIL** (code review)

Missing/expired/malformed tokens → 401 (good). Refresh reuse detection present. Failures: enumeration (H-02, H-03), OTP replay (M-01), JWT stale roles (H-01), plaintext refresh tokens (H-07). Live token forgery **NOT VERIFIED** against running API.

### 2. Authorization / IDOR — **FAIL**

Creator bypass (C-01) is authorization failure, not classic IDOR. AI recommendations IDOR (H-04). Many modules correctly scope by owner (trips, reels mutate, vendors, redemptions user path).

### 3. Role escalation — **FAIL**

C-01 enables traveler→creator. Body manipulation of `userId` on user wallet paths uses `req.user.id` (good). Admin `POST /wallet/earn` accepts body `userId` but requires `requireFinanceOps` (privileged).

### 4. PalPoints / reward fraud — **FAIL**

C-02, H-05, H-06, M-03, M-04, M-05. Core offer redemption path is stronger (transactions + locks).

### 5. Collaboration security — **PASS** (mutations) / **NOT VERIFIED** (full state machine)

Accept/cancel/reel upload checks party IDs. Admin read of any collaboration by ID is broad (M-08). Invalid transitions partially guarded by status checks in service.

### 6. Reel security — **PASS** (owner mutate) / **FAIL** (integrity)

Owner edit/delete enforced. View inflation (M-13). Draft/archived not leaked in public list (verified statically).

### 7. Vendor security — **PASS** (ownership model)

Business derived from authenticated user in controller layer. IDOR by vendorId in URL not observed in `/vendors/me/*` pattern.

### 8. Creator username — **PASS** (with caveats)

Frontend + backend validation + DB unique. Authenticated availability endpoint leaks taken names (M-09). No dedicated rate limit on username checks.

### 9. Input validation — **NOT VERIFIED** (exhaustive)

Zod schemas on many auth/social routes. Not every endpoint audited for oversized payloads / unexpected properties. Raw SQL runtime paths appear parameterized.

### 10. File upload security — **PASS** (multipart) / **MEDIUM** (URL-only fields)

Multipart uploads validated. URL-only document/image fields accept arbitrary external URLs (storage/abuse, not RCE on server).

### 11. SSRF — **NOT APPLICABLE** (general) / **MEDIUM** (admin pipeline)

No broad user URL fetch; canonical image pipeline is the exception.

### 12. XSS / WebView — **NOT VERIFIED** (runtime)

User content (bio, captions, comments) stored and rendered in RN — no systematic HTML sanitization audit. `SafeWebView` is thin wrapper; Razorpay WebView loads payment HTML. Map WebView uses controlled leaflet template. Stored XSS risk depends on rendering paths (likely Text components — lower than web).

### 13. Rate limiting — **FAIL**

Auth endpoints mostly limited. Gaps: redemptions (M-14), reel views (M-13), username check, admin global bypass (L-03).

### 14. Secrets — **FAIL**

Hardcoded script passwords (C-04), seed defaults (H-08). No server secrets in mobile bundle (good). `.env` gitignored.

### 15. Dependencies — **FAIL**

HIGH/CRITICAL-class advisories present in all three workspaces (H-09).

### 16. Production configuration — **FAIL**

Cleartext Android (C-03), seed password sync flag risk (H-08), hardcoded production API URL in mobile (acceptable but inflexible).

### 17. Log security — **PASS** (with LOW exceptions)

Structured redaction on server; mobile scrubber present. DEBUG FCM print (L-05).

---

## SECURITY GATE

| Gate | Result |
|------|--------|
| **Authentication** | **FAIL** |
| **Authorization** | **FAIL** |
| **IDOR/BOLA** | **FAIL** |
| **RBAC** | **FAIL** |
| **PalPoints** | **FAIL** |
| **Collaboration** | **NOT VERIFIED** (mutations appear sound; admin read scope broad) |
| **Reels** | **FAIL** (integrity/view abuse; owner ACLs OK) |
| **Vendor isolation** | **PASS** |
| **Creator isolation** | **PASS** (mutate paths; bypass is role acquisition not cross-creator IDOR) |
| **Input validation** | **NOT VERIFIED** |
| **Uploads** | **PASS** (multipart); URL fields **MEDIUM** |
| **XSS** | **NOT VERIFIED** |
| **SSRF** | **NOT APPLICABLE** (limited admin pipeline risk) |
| **Rate limiting** | **FAIL** |
| **Secrets** | **FAIL** |
| **Dependencies** | **FAIL** |
| **Production configuration** | **FAIL** |

---

## Recommended remediation order

1. **C-01** — Close creator self-approval bypass (immediate)  
2. **C-02** — Ad SSV + transactional reward limits  
3. **C-03** — Android cleartext restriction  
4. **C-04 / H-08** — Rotate credentials; remove hardcoded passwords  
5. **H-04, H-05, H-06** — IDOR + fraud paths  
6. **H-01, H-02, H-03** — Auth hardening & enumeration  
7. **H-09** — Dependency triage  
8. Rate limits on redemption, views, username check  

---

## Limitations of this assessment

- No dynamic testing against deployed Render/Neon instances  
- No concurrent race exploitation executed  
- No mobile binary reverse-engineering  
- XSS/UI rendering not fuzzed  
- Admin panel not browser-tested for CSRF/session fixation  

**Conclusion:** PalSafar must **not** be treated as secure for production until CRITICAL and HIGH findings are remediated and re-tested.
