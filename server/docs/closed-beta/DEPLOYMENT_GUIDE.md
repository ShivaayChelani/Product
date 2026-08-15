# Closed Beta Deployment Guide

## Prerequisites

- Render account with API service
- Vercel account with admin project
- Render PostgreSQL (DATABASE_URL + DIRECT_URL)
- Cloudinary, Firebase, Razorpay, Sentry accounts
- Android release keystore / iOS signing certificates

---

## 1. Database (Render PostgreSQL)

1. Create production project + optional staging branch.
2. Enable PostGIS and pg_trgm (applied automatically on first API boot via `ensureDbExtensions`).
3. Copy **pooled** URL → `DATABASE_URL`.
4. Copy **direct** URL → `DIRECT_URL` (required for migrations).

---

## 2. API (Render)

Config: `render.yaml` at repo root.

| Setting | Value |
|---------|-------|
| Root directory | `server` |
| Build | `npm ci && npx prisma migrate deploy && npm run build` |
| Start | `npm start` |
| Health check | `/health` |

### Required env vars

See [ENV_CHECKLIST.md](./ENV_CHECKLIST.md). Minimum:

- `NODE_ENV=production`
- `DATABASE_URL`, `DIRECT_URL`
- `JWT_SECRET` (≥32 chars)
- `CLIENT_URL` (mobile origin, e.g. `https://palsafar.com`)
- `SENTRY_DSN`
- `CLOUDINARY_*` (all three)
- `SYNC_CANONICAL_CREDENTIALS=false`
- `PRUNE_EXTRA_USERS=false`

### Validate before deploy

```bash
cd server
# Export Render env to .env or set inline
npm run validate:env
```

### Post-deploy smoke test

```bash
cd server
npm run smoke:health -- https://YOUR-SERVICE.onrender.com
```

Expected: `database: up` on both `/health` and `/api/v1/health`.

---

## 3. Admin (Vercel)

1. Project root: `admin/`
2. Set `NEXT_PUBLIC_API_URL=https://YOUR-API.onrender.com/api/v1`
3. Ensure admin origin is in `server/src/app.ts` `adminOrigins` CORS list.
4. Deploy via CI (after green build) or `cd admin && vercel --prod`.

**Beta scope:** Use `/dashboard` routes only. Do not rely on `/superadmin` for operations.

---

## 4. Mobile (React Native)

### Android

1. Set release keystore env vars or `keystore.properties`.
2. Add `android/app/google-services.json` from Firebase (not in repo).
3. Set production `ADMOB_APP_ID` in `android/app/build.gradle` if ads enabled.
4. Build: `npm run build:android`

### iOS

1. Add `ios/PalSafar/GoogleService-Info.plist` from Firebase.
2. Set `aps-environment` to `production` in Release entitlements for TestFlight.
3. Configure associated domains (already in entitlements).
4. Build via Xcode or `npm run build:ios`.

### Deep links

Host on `palsafar.com`:

- `/.well-known/assetlinks.json` (see `public/.well-known/assetlinks.json.example`)
- Apple App Site Association for `applinks:palsafar.com`

### Monitoring

Set `SENTRY_DSN` via env or `src/config/monitoring.local.ts` (gitignored).

---

## 5. CI/CD

- Push to `main` → GitHub Actions `CI` runs lint, typecheck, build, tests.
- On CI success → `Deploy` workflow triggers Render + Vercel.
- Do not deploy manually if CI is red.

---

## 6. Background jobs (optional for beta)

Enrichment supervisor (run on ops machine or Render cron):

```bash
cd server
npm run job:factual-enrichment:supervisor -- --source=wikidata --nominatim --link-nearby --batch-size=3 --max-places-per-worker=25
```

---

## 7. Sign-off

- [ ] `npm run validate:env` — no blockers
- [ ] `npm run smoke:health` — database up
- [ ] Manual login on staging/production
- [ ] Razorpay test payment (vendor or user premium)
- [ ] Push notification on physical device (if Firebase configured)
