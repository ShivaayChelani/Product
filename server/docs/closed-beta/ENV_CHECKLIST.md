# Environment Variable Checklist — Closed Beta

Run automated validation:

```bash
cd server && npm run validate:env
```

Legend: **B** = blocker for closed beta | **W** = warning (feature degraded) | **O** = optional

---

## Boot-required (API will not start without these)

| Variable | | Notes |
|----------|:--:|-------|
| `DATABASE_URL` | **B** | Render PostgreSQL connection |
| `DIRECT_URL` | **B** | Direct PostgreSQL URL — migrations |
| `JWT_SECRET` | **B** | ≥ 32 characters |
| `CLIENT_URL` | **B** | Required when `NODE_ENV=production` |

---

## Closed beta blockers (validate script)

| Variable | | Notes |
|----------|:--:|-------|
| `SENTRY_DSN` | **B** | Crash/error reporting |
| `CLOUDINARY_CLOUD_NAME` | **B** | Image uploads |
| `CLOUDINARY_API_KEY` | **B** | |
| `CLOUDINARY_API_SECRET` | **B** | |

---

## Must be false on production

| Variable | | Notes |
|----------|:--:|-------|
| `SYNC_CANONICAL_CREDENTIALS` | **B** | Overwrites seed passwords |
| `PRUNE_EXTRA_USERS` | **B** | Deletes all but seed users |

---

## Strongly recommended (warnings if missing)

| Variable | | Notes |
|----------|:--:|-------|
| `SMTP_HOST` | **W** | Forgot-password emails |
| `SMTP_USER` | **W** | |
| `SMTP_PASS` | **W** | |
| `FIREBASE_PROJECT_ID` | **W** | Push notifications |
| `FIREBASE_CLIENT_EMAIL` | **W** | |
| `FIREBASE_PRIVATE_KEY` | **W** | Escape newlines as `\n` |
| `RAZORPAY_KEY_ID` | **W** | Subscriptions / premium |
| `RAZORPAY_KEY_SECRET` | **W** | |
| `RAZORPAY_WEBHOOK_SECRET` | **W** | Webhook signature verify |

---

## Mobile / IAP alignment

| Variable | | Notes |
|----------|:--:|-------|
| `GOOGLE_PLAY_PACKAGE_NAME` | **W** | Must be `com.palsasafar` (mobile bundle) |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | O | Only if Play IAP verify used |
| `APPLE_IAP_*` | O | Only if Apple IAP verify used |

---

## Optional / feature flags

| Variable | | Notes |
|----------|:--:|-------|
| `GEMINI_API_KEY` | O | AI itinerary polish |
| `OPENAI_API_KEY` | O | Required if `HYBRID_SEARCH_ENABLED=true` |
| `HYBRID_SEARCH_ENABLED` | O | Default `false` |
| `PLACES_PUBLIC_VERIFIED_ONLY` | O | Default `false` for beta |
| `REBUILD_PLACE_SEARCH_VECTORS` | O | **Never** on routine deploys; one-off only |
| `REDIS_URL` | O | Not used — in-memory cache |

---

## Render (reference)

See `render.yaml` for declared vars. Add all blockers/warnings above in Render dashboard.

---

## Vercel Admin

| Variable | | Notes |
|----------|:--:|-------|
| `NEXT_PUBLIC_API_URL` | **B** | e.g. `https://palsafar-production.onrender.com/api/v1` |

---

## Mobile (build-time / local)

| Variable | | Notes |
|----------|:--:|-------|
| `SENTRY_DSN` | **B** | Release crash reporting |
| `ADMOB_APP_ID` | **W** | Replace test IDs before ad monetization |

Firebase config files (not env vars):

- `android/app/google-services.json`
- `ios/PalSafar/GoogleService-Info.plist`

---

## Test / CI only (never production)

| Variable | | Notes |
|----------|:--:|-------|
| `TEST_DATABASE_URL` | — | PostGIS test DB; must ≠ `DATABASE_URL` |
