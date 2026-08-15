# PalSafar Closed Beta — Operations Pack

**Last updated:** 2026-08-01  
**Scope:** Controlled closed beta with real users (mobile + API + admin dashboard)

## Documents

| Document | Purpose |
|----------|---------|
| [BETA_READINESS_REPORT.md](./BETA_READINESS_REPORT.md) | GO/NO-GO, score, blockers, validation results |
| [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) | Step-by-step deploy Render + Vercel + mobile |
| [ENV_CHECKLIST.md](./ENV_CHECKLIST.md) | Every production environment variable |
| [PRODUCTION_RUNBOOK.md](./PRODUCTION_RUNBOOK.md) | Day-2 operations, monitoring, cron jobs |
| [ROLLBACK.md](./ROLLBACK.md) | Roll back API, admin, and database |
| [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md) | Severity levels, escalation, communication |
| [BETA_TESTER_GUIDE.md](./BETA_TESTER_GUIDE.md) | Share with beta testers |
| [OPERATIONS_CHECKLIST.md](./OPERATIONS_CHECKLIST.md) | Pre-launch and weekly ops checklist |

## Quick commands

```bash
# Engineering gate (local)
cd server && npm run beta:gate

# Environment validation (against .env or Render env export)
cd server && npm run validate:env

# API health smoke test
cd server && npm run smoke:health
cd server && npm run smoke:health -- https://your-staging.onrender.com

# Full test suite (requires TEST_DATABASE_URL + PostGIS)
cd server && docker compose -f docker-compose.test.yml up -d
npm run test:all
```

## Beta scope

**In scope:** Tourist, vendor, creator mobile flows; `/dashboard` admin; canonical API; enrichment pipeline (background).

**Out of scope:** `/superadmin` placeholder modules; Google Sign-In; native IAP; Memories cloud sync.
