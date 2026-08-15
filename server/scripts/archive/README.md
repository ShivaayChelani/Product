# Archived Scripts — Disabled for Production Safety

These scripts were moved here during the **2026-08-01 release-freeze cleanup**.
They inject demo/test data or mutate production data in unsafe ways.

**Do not run without explicit engineering approval.**

| Script | Reason archived |
|--------|-------------------|
| `fill-empty-images-with-hd.cjs` | Bulk-assigns generic Unsplash stock photos to places |
| `fill-empty-images-bulk.cjs` | Same — SQL bulk Unsplash injection |
| `recategorize-and-expand-places.cjs` | Expands curated JSON with Unsplash URLs and synthetic ratings |
| `generate-bulk-data.ts` | Generates 100k synthetic places/vendors |
| `remove-fake-data.ts` | Destructive — deletes all OSM places |
| `normalize-place-categories.cjs` | Uppercases categories and deletes commercial rows |
| `advanced-seeding.js` | Creates 25 `vendor_user_*@palsafar.com` demo vendors + Unsplash reels |
| `import-reels.cjs` | Seeds 10 demo creator accounts + demo reels from status videos |
| `qa-validation.js` | Creates ephemeral `qa_user_*@palsafar.com` against live API |
| `bootstrap-remote-credentials.cjs` | Bootstraps demo vendor credentials on remote production |
| `create-vendor.cjs` | Creates `vendor_user_1@palsafar.com` demo vendor |
| `seed-more-vendors.js` | Additional demo vendor seeding |
| `seed-reward-campaigns.cjs` | Demo reward campaigns with Unsplash images |
| `seed-tiered-campaigns.cjs` | Demo tiered campaigns referencing legacy test emails |
| `seed-competitive-campaigns.cjs` | Demo competitive campaigns |

Active remediation tooling: `../places-data-remediation.ts`, `../production-dev-data-cleanup.ts`
