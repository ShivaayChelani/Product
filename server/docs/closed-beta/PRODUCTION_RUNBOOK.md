# Production Runbook — Closed Beta

## Daily checks

1. **API health:** `GET /health` → `database: up`, Cloudinary/Firebase status acceptable.
2. **Sentry:** Review new issues; triage P0/P1 within 24h.
3. **Render logs:** Check for OOM, migration failures, rate-limit spikes.
4. **DLQ (enrichment):** `server/reports/ops/enrichment/failed-enrichment-queue.jsonl` — retry or skip stuck places.

---

## Key endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Render health check; DB + dependency status |
| `GET /api/v1/health` | Versioned health; DB ping |
| `POST /api/v1/monetization/razorpay/webhook` | Payment webhooks (requires raw body) |

---

## Background jobs

| Job | Command |
|-----|---------|
| Wikidata enrichment (supervised) | `npm run job:factual-enrichment:supervisor -- --source=wikidata --nominatim --link-nearby --batch-size=3 --max-places-per-worker=25` |
| External ID resolution | `npm run job:resolve-external-ids -- --batch-size=20` |
| Duplicate scan | `npm run job:duplicate-scan` |
| Enterprise report | `npm run job:final-enterprise-report` |

Checkpoints: `server/reports/ops/enrichment/checkpoint-*.json`

---

## Database operations

```bash
cd server
npx prisma migrate deploy    # Apply pending migrations
npx prisma studio            # Read-only inspection (avoid prod writes)
```

**Render:** Take a backup/snapshot before bulk merge/dedupe operations.

**Never on production:**

- `SYNC_CANONICAL_CREDENTIALS=true`
- `PRUNE_EXTRA_USERS=true`
- `REBUILD_PLACE_SEARCH_VECTORS=1` (except one-off maintenance window)

---

## Scaling / performance

- Render starter plan: expect cold starts (~30–60s). Mobile client warms API on launch.
- Geospatial endpoints are public — monitor abuse; rate limit is 8000/15min global.
- Enrichment: use supervisor + `max-places-per-worker=25` to isolate OOM.

---

## Support channels

- In-app: Settings → Contact Support (`support@palsafar.com` or `mobileConfig.supportEmail`)
- In-app: Settings → Send Feedback (`POST /user-app/feedback`)

---

## Admin operations (beta scope)

Use **https://admin.palsafar.com/dashboard** (or Vercel URL):

- Places verification / canonical hub
- Users, vendors, subscriptions
- Announcements, riddles, hidden gems
- Monetization coupons / plans

Avoid `/superadmin` — many routes are not implemented on the API.

---

## Monitoring dashboard (manual)

| Source | What to watch |
|--------|---------------|
| Sentry | Crash rate, new regressions |
| Render metrics | CPU, memory, restarts |
| `pipeline-run.log` | Enrichment worker crashes |
| `progress-wikidata.json` | Enrichment throughput |

---

## Release process

1. Merge to `main` after PR + green CI.
2. CI deploys automatically on success.
3. Run `npm run smoke:health` post-deploy.
4. Spot-check mobile against production API.
5. Post release notes to beta channel (see BETA_TESTER_GUIDE.md).
