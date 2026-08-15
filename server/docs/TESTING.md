# PalSafar Testing Guide

**Release infrastructure:** automated tests must never target the production database.

---

## Database tiers

| Tier | Purpose | Connection |
|------|---------|------------|
| **Production** | Live API (`npm start`) | `DATABASE_URL` / `DIRECT_URL` in `.env` |
| **Test (local)** | Vitest integration/e2e | `TEST_DATABASE_URL` or Docker default |
| **Test (remote dedicated DB)** | Shared remote test DB | `TEST_DATABASE_URL` → branch URL only |
| **CI** | GitHub Actions | Local PostGIS service (see `ci.yml`) |

Vitest **ignores** `.env` `DATABASE_URL`. It uses:

1. `TEST_DATABASE_URL` if set  
2. Else `postgresql://postgres:postgres@localhost:5433/palsafar_test?connection_limit=3`

If `TEST_DATABASE_URL` equals `PRODUCTION_DATABASE_URL` or `.env` `DATABASE_URL`, tests **abort** unless `ALLOW_PRODUCTION_DATABASE_FOR_TESTS=true` (emergency only).

---

## Local test database setup

### Option A — Docker PostGIS (recommended)

```powershell
cd server
docker compose -f docker-compose.test.yml up -d

$env:TEST_DATABASE_URL = "postgresql://postgres:postgres@localhost:5433/palsafar_test?connection_limit=3"
$env:TEST_DIRECT_URL = "postgresql://postgres:postgres@localhost:5433/palsafar_test"

npx prisma db push
npm run test:all
```

### Option B — Remote dedicated test database (optional)

1. Provision a separate non-production Postgres database (empty or fixture data only).  
2. Copy that database URL into `TEST_DATABASE_URL`.  
3. Copy direct URL into `TEST_DIRECT_URL`.  
4. **Never** paste the production branch URL.

```powershell
$env:TEST_DATABASE_URL = "postgresql://user:password@test-host:5432/palsafar_test?sslmode=require&connection_limit=3"
$env:TEST_DIRECT_URL = "postgresql://user:password@test-host:5432/palsafar_test?sslmode=require"
npx prisma migrate deploy
npm run test:integration
```

See `.env.test.example` for a template.

---

## Test suites

| Script | Config | DB required | Parallel |
|--------|--------|:-----------:|:--------:|
| `npm run test:unit` | `vitest.unit.config.js` | No | Yes |
| `npm run test:integration` | `vitest.integration.config.js` | Yes | No (serial) |
| `npm run test:e2e` | `vitest.e2e.config.js` | Yes | No (serial) |
| `npm run test:all` | `vitest.config.js` | Yes | No (serial) |
| `npm test` | alias for `test:all` | Yes | No |

### Unit tests (8 files)

No Prisma connect, no global seed — pure logic / mocked DB:

- `canonical.test.ts`, `geohash-duplicate-scan.test.ts`, `boundary-dataset.test.ts`
- `canonical-pick.test.ts`, `destination.test.ts`, `places-public-visibility.test.ts`
- `plan-catalog.test.ts`, `rides.providers.test.ts`

### Integration tests

All other `*.test.ts` except `*.integration.test.ts` — HTTP + DB via supertest.

### E2E tests

- `monetization.integration.test.ts`
- `rides.integration.test.ts`

---

## Required environment variables

### Production (`.env`)

| Variable | Required |
|----------|:--------:|
| `DATABASE_URL` | Yes |
| `DIRECT_URL` | Yes |
| `JWT_SECRET` (≥32 chars) | Yes |

### Tests (`.env.test` or shell export)

| Variable | Required | Notes |
|----------|:--------:|-------|
| `TEST_DATABASE_URL` | Recommended | Defaults to local Docker URL |
| `TEST_DIRECT_URL` | Optional | Defaults to `TEST_DATABASE_URL` |
| `JWT_SECRET` | Optional | Vitest provides 32+ char default |
| `PRODUCTION_DATABASE_URL` | Optional | Guard: refuse if test URL matches |
| `SYNC_CANONICAL_CREDENTIALS` | Optional | `true` for test login accounts |

**Do not set `DATABASE_URL` to production when running tests** — use `TEST_DATABASE_URL` instead.

---

## CI test database

GitHub Actions (`.github/workflows/ci.yml`):

- PostGIS 15 service on `localhost:5432/test_db`
- Sets `TEST_DATABASE_URL` explicitly (not production Render PostgreSQL)
- Runs `test:unit` → `test:integration` → `test:e2e`

---

## Prisma lifecycle in tests

- **One** shared `PrismaClient` singleton per worker  
- **Connect:** per-file `setup.ts` + global seed once  
- **Disconnect:** global teardown only — no mid-suite `$disconnect()`  
- **Retries:** `withRetry()` handles P1017, ECONNRESET, socket hang up

---

## Preventing remote-DB flakiness

1. **Never** point vitest at production Render PostgreSQL (113k-place corpus + idle timeouts).  
2. Use **local PostGIS** or a **dedicated dedicated test database** with `connection_limit=3`.  
3. Run integration/e2e **serially** (`fileParallelism: false`).  
4. Keep a **warm local DB** — no cold serverless suspend between files.  
5. Transient drops are **retried** in setup/auth helpers.

---

## Quick commands

```powershell
cd server
npm run test:unit          # fast, no DB
npm run test:integration   # API + DB
npm run test:e2e           # payment / ride flows
npm run test:all           # full suite
npm run test:watch         # watch mode (full config)
```

See also: [RELEASE_GATE.md](./RELEASE_GATE.md), [TEST_INFRASTRUCTURE_AUDIT.md](./TEST_INFRASTRUCTURE_AUDIT.md)
