# PalSafar Production Readiness Report

**Generated:** 2026-08-01  
**Scope:** Full platform — mobile, backend, admin, CI/CD, infrastructure  
**Auditor:** Engineering audit (read-only codebase analysis + targeted blocker fixes)

---

## GO / NO-GO Recommendation

**GO for closed beta** with the operational checklist below completed before public launch.

The platform is architecturally complete. Remaining gaps are either **fixed in this pass**, **scoped to superadmin/placeholder UI** (not core tourist/vendor/creator flows), or **operational dependencies** (keys, app store, legal).

| Surface | Beta readiness |
|---------|----------------|
| Mobile (tourist/vendor/creator core) | **GO** — API-backed; premium checkout wired |
| Backend API | **GO** — migrations on deploy; health checks; enrichment pipeline |
| Admin `/dashboard` | **GO** — CRUD wired to existing APIs |
| Admin `/superadmin` | **NO-GO** — many routes unimplemented; placeholder UI |
| CI/CD | **GO** — CI gates deploy; typecheck + build in pipeline |

---

## Fixes Applied (This Pass)

| File | Fix | Why |
|------|-----|-----|
| `render.yaml` | `prisma migrate deploy` in buildCommand | Schema drift on deploy was a beta blocker |
| `server/src/config/db-extensions.ts` | Removed full-table `UPDATE places` on every boot; opt-in via `REBUILD_PLACE_SEARCH_VECTORS=1` | 113k-row rebuild caused deploy timeouts/OOM |
| `server/src/app.ts` | `/api/v1/health` now pings database | Load balancers got false positives |
| `.github/workflows/deploy.yml` | Deploy only after CI succeeds (`workflow_run`) | Broken builds could reach production |
| `.github/workflows/ci.yml` | Added server typecheck, server build, admin build | Admin/build regressions undetected |
| `src/screens/PremiumUpgradeScreen.tsx` | Razorpay checkout on plan buttons | User premium was display-only |
| `src/navigation/RootNavigator.tsx` | `Auth` root wrapper for deep links | `palsafar://auth/login` did not resolve |
| `server/package.json` | Added `typecheck` script | Release validation |
| `server/.env.example` | Documented `REBUILD_PLACE_SEARCH_VECTORS` | Ops clarity |

---

## Critical Issues

### Resolved in code

1. Deploy without migrations → `render.yaml` runs `migrate deploy`
2. Boot-time full corpus search rebuild → opt-in env flag
3. Deploy without CI gate → `workflow_run` on CI success
4. User premium checkout broken → Razorpay wired on `PremiumUpgradeScreen`
5. Auth deep links broken → `UnauthenticatedRoot` matches linking config

### Operational dependencies (cannot fix in code alone)

| # | Issue | Action required |
|---|--------|-----------------|
| O1 | Firebase mobile config — `google-services.json` / `GoogleService-Info.plist` not in repo | Add from Firebase console per environment |
| O2 | iOS push `aps-environment` — entitlements set to `development` | Use `production` for App Store/TestFlight builds |
| O3 | Sentry DSN — empty unless env/gitignored local config | Set `SENTRY_DSN` for mobile + server |
| O4 | Razorpay keys — payments return 503 without keys | Configure `RAZORPAY_*` on Render |
| O5 | SMTP — forgot-password silently no-ops | Configure SMTP or disable forgot-password UI for beta |
| O6 | AdMob production IDs — test IDs in app config | Replace before ad monetization |
| O7 | Deep link verification — host assetlinks + AASA on palsafar.com | DNS/hosting |
| O8 | Canonical seed credentials — hardcoded if sync enabled | Never enable `SYNC_CANONICAL_CREDENTIALS` on production |
| O9 | Full test suite — requires `TEST_DATABASE_URL` / PostGIS Docker locally | CI configured; local uses `docker-compose.test.yml` |

---

## Major Issues

| # | Area | Issue | Status |
|---|------|-------|--------|
| M1 | Admin | `/superadmin/*` calls unmounted backend routes | Use `/dashboard` for beta ops |
| M2 | Admin | No Sentry on admin frontend | Add DSN when monitoring admin |
| M3 | Mobile | Memories screen is local-only | Hide for beta or label as local drafts |
| M4 | Mobile | Trip map tab placeholder | Non-blocking — list view works |
| M5 | Mobile | Google Sign-In coming soon | OAuth setup required |
| M6 | Backend | Geospatial routes public | Acceptable for map beta |
| M7 | Backend | `payment.failed` webhook ignored | Manual reconciliation or extend handler |

---

## Validation Results (2026-08-01)

| Check | Result |
|-------|--------|
| Server `tsc --noEmit` | 0 errors |
| Mobile `npm run typecheck` | 0 errors |
| Server `npm run lint` | 0 errors |
| Server `npm run test:unit` | 39/39 passed |
| Server build (`tsconfig.build.json`) | Pass |

---

## Deployment Checklist

### Render (API)

- [ ] `DATABASE_URL` + `DIRECT_URL`
- [ ] `JWT_SECRET`, `CLIENT_URL`
- [ ] Razorpay, Cloudinary, Firebase, Sentry, SMTP as needed
- [ ] Do not set `REBUILD_PLACE_SEARCH_VECTORS=1` on routine deploys
- [ ] `SYNC_CANONICAL_CREDENTIALS` unset

### Mobile

- [ ] Firebase platform config files
- [ ] Release signing
- [ ] Sentry DSN
- [ ] iOS push production entitlements for release builds

---

## Final Status

**Production beta launch:** **GO** for core mobile + API + admin dashboard, contingent on operational checklist.

**Closed beta documentation:** See [`closed-beta/`](./closed-beta/README.md) for deployment guide, env checklist, runbook, rollback, incident response, and tester guide.

**Full public launch:** Complete operational dependencies; hide or implement superadmin modules.
