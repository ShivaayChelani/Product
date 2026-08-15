# Admin production scope notes

## Categories & tags (intentional architecture)

Categories and tags in the admin dashboard are **derived from live `Place` data**, not independent CMS entities.

- Rename updates all places that use that category/tag string
- Delete reassigns category to `"Other"` or removes the tag from place arrays
- New values appear when places are created/imported with them

No separate `Category` / `Tag` tables are required for the current product. Introduce dedicated taxonomy tables only if controlled vocabulary, hierarchy, icons, or create-before-use becomes a product requirement.

## Complaints / reports (future scope)

A standalone Complaints product is **not required** for current PalSafar coverage:

| Need | Existing coverage |
|------|-------------------|
| Place / vendor / creator / image approvals | Unified Moderation queue |
| User-reported reels | `ReelReport` + moderation |
| Analytics exports | `/dashboard/reports` |

Add a dedicated Complaints model + intake APIs later only if users need to file place/review/user support tickets outside reel reports.

## Backend RBAC

Admin **reads** use `authenticate` + `requireAdmin`.

Admin **mutations** use centralized capability middleware from `server/src/middleware/adminCapabilities.ts`:

- `requirePlatformOps` — settings, user role/delete, place wipe/import, canonical merge, legal CMS, trip delete
- `requireContentOps` — reviews, places approve/update, creators/reels, riddles, taxonomy, moderation
- `requireVendorOps` — vendor verify/delete/location/offers
- `requireFinanceOps` — wallet/points/refunds/rewards/monetization plans & grants
- `requireMarketingOps` — campaigns, announcements, notification broadcasts

`ANALYTICS_VIEWER` / `SUPPORT_AGENT` remain admin-readable but are excluded from mutators unless explicitly included.
