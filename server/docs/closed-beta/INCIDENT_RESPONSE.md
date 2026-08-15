# Incident Response Guide

## Severity levels

| Level | Definition | Response time | Example |
|-------|------------|---------------|---------|
| **P0** | Full outage or data loss risk | ≤ 15 min | API down, DB unreachable, payment double-charge |
| **P1** | Major feature broken for all users | ≤ 2 hours | Auth broken, search down, map empty globally |
| **P2** | Partial degradation | ≤ 24 hours | Reels empty intermittently, slow map |
| **P3** | Minor / cosmetic | Next sprint | UI glitch, typo |

---

## First 15 minutes (P0/P1)

1. **Confirm impact:** `npm run smoke:health`, Sentry issue count, Render status.
2. **Assign roles:** Incident lead, comms, fix owner.
3. **Mitigate:** Roll back deploy ([ROLLBACK.md](./ROLLBACK.md)) or scale/restart Render service.
4. **Preserve evidence:** Sentry event IDs, Render log timestamps, request correlation IDs.

---

## Investigation checklist

- [ ] Recent deploy? (GitHub Actions → Deploy workflow)
- [ ] Migration applied? (`prisma migrate deploy` in build log)
- [ ] Env var change on Render/Vercel?
- [ ] Render Postgres status / connection limits?
- [ ] Third-party: Cloudinary, Razorpay, Firebase outage?

---

## Security incidents

| Type | Immediate action |
|------|------------------|
| JWT secret leak | Rotate `JWT_SECRET`, force re-login (invalidate sessions) |
| Razorpay webhook secret leak | Rotate webhook secret in Razorpay dashboard + Render |
| Suspicious admin access | Disable account in DB, review audit logs |
| Upload abuse | Check Cloudinary usage; tighten upload rate limits |

Audit logs: `GET /api/v1/audit-logs` (admin).

---

## Communication

**Internal:** Post in ops channel with severity, impact, ETA, owner.

**Beta testers (P0/P1):** Short status update; link to feedback channel.

**Post-incident:** Blameless review within 48h — root cause, fix, prevention.

---

## Escalation

1. On-call engineer
2. Backend lead
3. Product / beta launch manager

---

## Useful commands

```bash
# Health
cd server && npm run smoke:health

# Env validation
cd server && npm run validate:env

# Local reproduction
cd server && npm run test:integration
```
