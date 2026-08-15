# Rollback Procedure

## When to roll back

- API returns 503 on `/health` after deploy
- Migration failure mid-deploy
- Payment webhook regression
- Critical auth or data corruption bug

---

## 1. API (Render)

### Option A — Redeploy previous commit (preferred)

1. Render Dashboard → Service → **Deploys**
2. Select last known-good deploy → **Rollback to this deploy**
3. Verify: `npm run smoke:health -- https://YOUR-SERVICE.onrender.com`

### Option B — Git revert

```bash
git revert HEAD
git push origin main
# CI runs, then auto-deploys
```

---

## 2. Admin (Vercel)

1. Vercel Dashboard → Deployments
2. Promote previous production deployment
3. Verify login + places list load

---

## 3. Database migrations

**If migration applied but code rolled back:**

1. Do **not** run `migrate reset` on production.
2. Assess whether down migration exists in `prisma/migrations/`.
3. If no safe down migration: forward-fix with a new migration rather than reverting schema.
4. Render: restore from PostgreSQL backup / PITR if available if corruption occurred.

**Prevention:** Always test `prisma migrate deploy` on staging branch first.

---

## 4. Mobile

Mobile clients cannot be rolled back instantly after store release.

- **Internal beta (TestFlight / Play Internal Testing):** Stop promoting bad build; promote previous build.
- **Production users:** Ship hotfix release; use Sentry to confirm fix.

---

## 5. Enrichment pipeline

1. Stop supervisor process (Ctrl+C or kill worker).
2. Checkpoint is preserved in `reports/ops/enrichment/checkpoint-*.json`.
3. Resume from checkpoint after fix — no data loss for processed places.

---

## 6. Post-rollback verification

- [ ] `/health` → `database: up`
- [ ] Login / register works
- [ ] Place search returns results
- [ ] Razorpay webhook test event (staging keys)
- [ ] Sentry error rate declining

---

## 7. Communication

Notify beta testers if outage > 15 minutes. Template:

> PalSafar beta: We rolled back a deployment due to [brief reason]. Service should be restored. Please force-close and reopen the app if issues persist. Report problems via Settings → Feedback.
