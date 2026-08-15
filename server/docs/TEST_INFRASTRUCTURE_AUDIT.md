> **Historical note:** This audit documents flakiness observed when PalSafar previously used Neon. Production now uses **Render PostgreSQL (Singapore)**. Use local PostGIS / dedicated test DBs for automated tests — never production.

# Production Test Infrastructure Audit

**Date:** 2026-08-01  
**Context:** Full vitest suite flaky against PostgreSQL; `multi-role-accounts.test.ts` passes 6/6 in isolation (~2.4 min).  
**Scope:** `server/` test stack only — no application logic changes.

---

## Executive Summary

The test **architecture is mostly correct** (serial execution, single Prisma singleton, retry helper, CI local Postgres). Full-suite instability is **not caused by application logic bugs**. It is caused by running **287 integration tests over ~11 minutes against a remote remote PostgreSQL database** that holds the **113k-place production corpus**, combined with **one test file disconnecting the shared Prisma client** and **incomplete retry coverage for Postgres drop codes**.

| Finding | Severity |
|---------|----------|
| Local suite used remote Postgres via `.env` `DATABASE_URL` | **Critical** |
| Cumulative runtime exceeds remote Postgres idle / compute limits | **High** |
| `monetization.integration.test.ts` calls `prisma.$disconnect()` mid-suite | **High** |
| `P1017` not in `withRetry` retryable errors | **Medium** |
| `ensureSeedData()` runs against full corpus on global setup | **Medium** |
| CI uses local Postgres (stable) — dev/CI divergence | **Medium** |
| 102 tests skipped when suite hooks fail | **Symptom** |

---

## 1. Root Cause Analysis

### Why full suite fails but individual files pass

```
┌─────────────────────────────────────────────────────────────┐
│  vitest.config.js loads dotenv → DATABASE_URL from .env     │
│  (typically Render PostgreSQL URL, 113k-place production DB)      │
└──────────────────────────┬──────────────────────────────────┘
                           │
         ┌─────────────────┴─────────────────┐
         │  Single file (~2–4 min)           │  Full suite (~11 min)
         │  • Few reconnect cycles           │  • 35 files serial
         │  • DB stays warm                │  • 1000s+ queries
         │  • Pool recovers                  │  • Idle timeout / P1017
         └─────────────────┬─────────────────┘  • socket hang up
                           │
                    Individual PASS          Full suite FAIL (500, hang up)
```

**Primary cause:** **Postgres connectivity under sustained load**, not auth/multi-role logic. Evidence:

- Same tests pass 6/6 when run alone (task 810327).
- Failures are **500** and **socket hang up**, not assertion mismatches.
- Duplicate scan ops hit identical **`P1017: Server has closed the connection`** on long remote Postgres jobs.
- Full suite: **641–795 s** duration; individual file: **143 s**.

**Secondary cause:** **`monetization.integration.test.ts` line 192–194** calls `await prisma.$disconnect()` in `afterAll`. All files share one Prisma singleton (`database.ts` globalThis). Vitest runs files **serially** (`fileParallelism: false`), so every file **after** monetization must reconnect via `setup.ts` `beforeAll`. Reconnect to cold remote Postgres is flaky and adds latency.

**Tertiary causes:**

| Issue | Location | Effect |
|-------|----------|--------|
| Global seed on suite start | `global-setup.ts` → `ensureSeedData()` | Credential sync + `deleteMany` on places (0,0 coords) against 113k rows |
| Per-file `$connect()` | `helpers/setup.ts` | 35 connect attempts per suite |
| Hardcoded 30s monetization `beforeAll` | `monetization.integration.test.ts:177` | 4× remote login + plan setup; hook timeout under load |
| `withRetry` misses P1017 | `utils/retry.ts` | Transient Postgres drops not retried |
| No transaction rollback | All integration tests | Committed state accumulates; cross-file pollution possible |
| Shared seed users | `helpers/auth.ts` | Tests depend on canonical emails existing on target DB |

---

## 2. Prisma Connection Lifecycle

### Current behavior

```typescript
// database.ts — single singleton (GOOD)
globalForPrisma.prisma ?? new PrismaClient(...)

// global-setup.ts — once per suite
setup()  → ensureSeedData() with withRetry
teardown() → prisma.$disconnect()

// setup.ts — every test file
beforeAll → withRetry(() => prisma.$connect(), 5 attempts)

// monetization.integration.test.ts — PROBLEMATIC
afterAll → prisma.$disconnect()  // only file that disconnects mid-suite
```

### Assessment

| Question | Answer |
|----------|--------|
| Are Prisma clients created excessively? | **No** — one singleton per vitest worker. |
| Is lifecycle correct? | **Mostly** — mid-suite `$disconnect()` is an anti-pattern. |
| Open handles after tests? | Global teardown disconnects; monetization early disconnect may leave engine in bad state until next `$connect`. |

---

## 3. Postgres Connection Pooling

### Current config

- `vitest.config.js` passes `process.env.DATABASE_URL` (from `.env` when present).
- Prisma schema uses `url` + `directUrl` with **no** explicit `connection_limit` in code.
- Serverless/pooled Postgres often recommends **pooled URL** with low `connection_limit` (often 1–5 for serverless).

### Failure modes observed

| Code | Meaning | Seen in |
|------|---------|---------|
| `P1017` | Server closed connection | Duplicate scan, full test suite |
| `10054` / ConnectionReset | Remote host forcibly closed | `phase3-scan-resume3.log` |
| socket hang up | TCP dropped mid-request | `reports.test.ts` |

### Pool exhaustion hypothesis

Default Prisma pool ≈ `num_cpus + 1` connections. Serial tests still hold connections across long `beforeAll` hooks and supertest requests. On constrained managed Postgres tiers, **max connections** and **idle suspend** are lower than local Postgres — cumulative suite exhausts or drops connections.

---

## 4. Parallel vs Serial Execution

### Current settings (`vitest.config.js`)

```javascript
pool: 'forks',
fileParallelism: false,
maxWorkers: 1,
testTimeout: 90_000,
hookTimeout: 90_000,
```

### Recommendation: **Keep serial**

Integration tests share one database and seeded users. Parallel file execution without **per-worker isolated databases** would cause slug collisions and race conditions despite `testRunId` (seed users are global).

| Mode | Verdict |
|------|---------|
| File parallel | ❌ Do not enable with shared DB |
| Test parallel within file | ❌ Not configured; keep off |
| Serial (current) | ✅ Correct for integration |

Optional future: split **unit tests** (mocked, no DB) into a separate vitest project with `fileParallelism: true`.

---

## 5. Database-Heavy Test Classification

### Tier 1 — Heavy integration (full HTTP + DB, long hooks)

| File | Lines | Notes |
|------|------:|-------|
| `monetization.integration.test.ts` | 1,044 | 31 tests; `$disconnect` in afterAll; Razorpay mocks |
| `trips.test.ts` | 516 | Creates places; AI tests **180s** timeout |
| `multi-role-accounts.test.ts` | 300 | Multiple register/login/vendor flows |
| `ai.test.ts` | 262 | Recommendations against real places table |
| `places.test.ts` | 162 | CRUD + search on full corpus |
| `wallet-extension.test.ts` | 113 | Monetization-adjacent |
| `challenges.test.ts` | 158 | Gamification + DB |
| `vendors.test.ts` | 118 | Vendor lifecycle |

### Tier 2 — Medium integration (HTTP + DB)

`analytics`, `hidden-gems`, `settings`, `sync`, `reports`, `geospatial`, `notifications`, `users`, `points-wallet`, `redemptions`, `auth`, `auth-account`, `upload`, `audit`, `rewards`, `social`, `gamification`, `point-rules`, `rides.integration`

### Tier 3 — Light / unit (minimal or no live DB)

| File | Notes |
|------|-------|
| `canonical.test.ts` | Pure functions |
| `geohash-duplicate-scan.test.ts` | Mocked prisma |
| `boundary-dataset.test.ts` | Provider logic |
| `canonical-pick.test.ts` | Scoring |
| `destination.test.ts` | Text utils |
| `places-public-visibility.test.ts` | Mocked env |
| `plan-catalog.test.ts` | Catalog logic |
| `rides.providers.test.ts` | Provider URLs |

**~8/35 files** can run without live Postgres; **~27/35** require DB.

---

## 6. Test Isolation & Cleanup

| Mechanism | Status |
|-----------|--------|
| Transaction rollback per test | ❌ Not used |
| Per-test cleanup | Partial — monetization `cleanupTestData`, trips `deleteMany`, multi-role deletes created users |
| Unique slugs | ✅ `testRunId` helper |
| Shared seed accounts | ⚠️ All tests login as same 4 emails |
| Global data mutation | ⚠️ `ensureSeedData` upserts credentials every suite |

**Risk:** Tests against PostgreSQL production data can interact with **113k real places** (search/list endpoints slow; counts non-deterministic).

---

## 7. CI/CD vs Local Divergence

| Aspect | CI (`ci.yml`) | Local (typical) |
|--------|---------------|-----------------|
| Database | PostGIS 15 Docker, empty `test_db` | remote Postgres (historical), 113k places |
| Schema | `prisma db push` | Same schema, production data |
| Duration | ~600s possible but stable | Flaky at 640s+ |
| JWT_SECRET | `test-jwt-secret-for-ci` (short — **may fail** new ≥32 char gate unless updated) | vitest default 32+ chars |
| Second workflow | `server-ci.yml` — Postgres 16, subset tests only | Partial overlap |

**CI is authoritative for merge** but local remote-DB runs give **false negatives**.

---

## 8. Recommended Fixes

### P0 — Must do (stability)

| # | Fix | Effort | Impact |
|---|-----|--------|--------|
| 1 | **Never run full suite against production Render PostgreSQL.** Use `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/test_db` or a **dedicated test database**. Add `.env.test` or document in README. | 1 h | **Eliminates ~90% of local flakes** |
| 2 | **Remove `prisma.$disconnect()` from `monetization.integration.test.ts` afterAll.** Only global teardown should disconnect. | 5 min | Prevents mid-suite client death |
| 3 | **Add `P1017`, `ECONNRESET`, `socket hang up` to `withRetry` retryable patterns** in `utils/retry.ts`. | 30 min | Recovers transient Postgres drops in setup/auth |

### P1 — Should do (CI & ergonomics)

| # | Fix | Effort | Impact |
|---|-----|--------|--------|
| 4 | **Split test scripts:** `test:unit` (8 files, no DB, parallel OK) and `test:integration` (DB required, serial). | 2 h | Faster feedback; clearer failures |
| 5 | **CI: enforce `JWT_SECRET` ≥32 chars** in `ci.yml` (align with `env.ts` gate). | 5 min | Prevents CI boot failure |
| 6 | **Unify CI workflows** — one Postgres version (16 + PostGIS), one `prisma migrate deploy` path. | 2 h | Consistent CI behavior |
| 7 | **Vitest `env` block: ignore `.env` DATABASE_URL** unless `TEST_DATABASE_URL` set — explicit opt-in to remote DB. | 1 h | Prevents accidental production-DB runs |

### P2 — Nice to have (quality)

| # | Fix | Effort | Impact |
|---|-----|--------|--------|
| 8 | **dedicated test database** per PR (ephemeral) or shared `palsafar_test` branch reset nightly. | 4 h | Remote CI parity without prod data |
| 9 | **`ensureSeedData` test mode** — skip `deleteMany` on full places table; only sync 4 users + settings if empty. | 2 h | Faster global setup on large DB |
| 10 | **Prisma `connection_limit=3` in test DATABASE_URL** query param. | 15 min | Reduces PostgreSQL connection pressure |
| 11 | **Raise monetization `beforeAll` timeout** to 90s or match vitest `hookTimeout`. | 5 min | Fewer skipped tests in that file |
| 12 | **Docker Compose `docker-compose.test.yml`** — PostGIS one command for dev. | 3 h | Onboarding + parity with CI |

---

## 9. Dedicated Test Database — Recommendation

| Option | Use when | Verdict |
|--------|----------|---------|
| **Local Docker PostGIS** | Daily dev, full suite | ✅ **Recommended default** |
| **Dedicated remote test DB** | CI or shared remote | ✅ Good for team without Docker |
| **Production Render PostgreSQL** | Never for full suite | ❌ **Current failure mode** |
| **In-memory / mocked DB** | Unit tests only | ✅ Already partial |

**Minimum bar for RC-1:** Full suite must pass against **empty or fixture-only** Postgres, not a production-scale corpus DB.

---

## 10. Connection Pooling Adjustments

For dedicated test database:

```
DATABASE_URL=postgresql://...-pooler.../palsafar_test?sslmode=require&connection_limit=3&pool_timeout=30
DIRECT_URL=postgresql://...direct.../palsafar_test?sslmode=require
```

For local Docker:

```
DATABASE_URL=postgresql://postgres:password@localhost:5432/test_db
DIRECT_URL=postgresql://postgres:password@localhost:5432/test_db
```

Prisma singleton + serial tests → **connection_limit=1–3** is sufficient.

---

## 11. Long-Running Bottlenecks

| Bottleneck | Duration | Mitigation |
|------------|----------|------------|
| Full suite against 113k places | 600–800 s | Use empty test DB |
| `ai.test.ts` recommendations | up to 180 s/test | Mock AI or mark `@slow` |
| `trips.test.ts` AI generate | high | Same |
| `getAuthToken` × 4 in monetization beforeAll | 5–15 s | Cache tokens in file scope |
| Global `ensureSeedData` | 2–10 s on large DB | Test-mode slim seed |
| Remote Postgres cold start after idle | 1–5 s per reconnect | Keep local DB warm |

---

## 12. Open Handles & Resource Leaks

| Resource | Leak risk | Notes |
|----------|-----------|-------|
| Prisma engine | Low | Global teardown disconnects |
| HTTP server | None | Tests import `app` without `listen()` |
| Sentry | Low | Initialized on app import; acceptable in tests |
| Firebase init | Low | May init on import paths |
| Razorpay mock | Cleaned | `_setRazorpayMock` in monetization |

No evidence of systematic handle leaks; failures are **connection drops**, not Jest/Vitest open-handle warnings.

---

## 13. Action Plan (RC-1)

### Immediate (no test rewrites)

1. Create local test DB: `docker run postgis/postgis:16-3.4 -e POSTGRES_PASSWORD=password -p 5432:5432`
2. Run: `DATABASE_URL=postgresql://postgres:password@localhost:5432/test_db npx prisma db push && npm test`
3. Remove monetization mid-suite `$disconnect` (single line — **test infrastructure fix**)
4. Extend `withRetry` for P1017

### CI/CD

1. Fix CI `JWT_SECRET` length for new env gate
2. Add `test:unit` job (fast, no Postgres) + keep full integration job
3. Document that **deploy.yml runs no tests** — consider gating deploy on CI test job

### Verification

After P0 fixes, expect:

- Full suite on local Postgres: **pass stable** in ~8–12 min
- Full suite on Render PostgreSQL branch (empty): **pass** with occasional retry
- Full suite on production Render PostgreSQL: **still discouraged** even if passes intermittently

---

## 14. Files Referenced

| File | Role |
|------|------|
| `server/vitest.config.js` | Serial execution, env injection |
| `server/src/config/database.ts` | Prisma singleton |
| `server/src/__tests__/helpers/setup.ts` | Per-file `$connect` |
| `server/src/__tests__/helpers/global-setup.ts` | Suite seed + teardown |
| `server/src/__tests__/helpers/auth.ts` | Shared login helper |
| `server/src/utils/retry.ts` | Retry policy (incomplete for remote Postgres drops) |
| `server/src/__tests__/monetization.integration.test.ts` | Mid-suite `$disconnect` |
| `.github/workflows/ci.yml` | Local Postgres CI |
| `.github/workflows/server-ci.yml` | Partial canonical CI |

---

*Accuracy over convenience: tests should prove application correctness against an isolated database, not stress-test Postgres connectivity against production-scale data.*
