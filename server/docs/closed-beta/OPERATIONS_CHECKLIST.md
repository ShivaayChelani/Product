# Operations Checklist — Closed Beta

## Pre-launch (one-time)

### Infrastructure

- [ ] Render PostgreSQL (Singapore) created; PostGIS available
- [ ] Render API service configured per [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)
- [ ] `prisma migrate deploy` succeeds on staging
- [ ] Vercel admin deployed; CORS origin whitelisted
- [ ] `npm run validate:env` — zero blockers on production env
- [ ] `npm run smoke:health` — database up

### Credentials

- [ ] JWT_SECRET rotated (not dev default)
- [ ] Sentry DSN set (API + mobile)
- [ ] Cloudinary configured
- [ ] Firebase Admin (API) + mobile config files
- [ ] Razorpay keys + webhook URL registered
- [ ] SMTP configured OR forgot-password disabled in comms to testers

### Security

- [ ] `SYNC_CANONICAL_CREDENTIALS` unset/false
- [ ] `PRUNE_EXTRA_USERS` unset/false
- [ ] Admin uses HttpOnly cookie auth (no JWT in localStorage)
- [ ] Razorpay webhook secret verified in staging

### Mobile

- [ ] Release signing configured
- [ ] Firebase `google-services.json` / `GoogleService-Info.plist` added
- [ ] iOS push: `aps-environment=production` for TestFlight build
- [ ] Deep link files hosted on palsafar.com (if using HTTPS links)
- [ ] AdMob production IDs (if ads enabled)

### QA

- [ ] `npm run beta:gate` green
- [ ] CI green on `main`
- [ ] Manual smoke: login, search, map, reels, trip, wallet
- [ ] Manual smoke: vendor subscription + offer (if in scope)
- [ ] Beta tester guide shared

---

## Launch day

- [ ] Deploy API + admin via CI
- [ ] Smoke health check
- [ ] Send beta invites (TestFlight / Play Internal)
- [ ] Monitor Sentry for 2 hours post-launch
- [ ] Confirm first successful registrations in admin dashboard

---

## Weekly (during beta)

- [ ] Review Sentry top issues
- [ ] Check Render uptime / restarts
- [ ] Review feedback submissions (`/user-app/feedback`)
- [ ] Enrichment checkpoint progress (if running)
- [ ] DLQ size for failed enrichments
- [ ] Render Postgres storage / connection usage

---

## Launch checklist (GO/NO-GO)

| Gate | Owner | Pass |
|------|-------|:----:|
| Engineering gate (`beta:gate`) | Eng | ☐ |
| Env validation | DevOps | ☐ |
| Health smoke test | DevOps | ☐ |
| Payment E2E (staging/live test) | Product | ☐ |
| Push on physical device | Mobile | ☐ |
| Admin dashboard login | Ops | ☐ |
| Beta tester comms sent | PM | ☐ |
| Rollback procedure reviewed | Eng | ☐ |

**GO when all checked.** NO-GO if any P0 blocker remains.
