# Admin Places Search + Priority Report

**Scope:** Admin Places management page only.  
**Date:** 2026-08-14  
**Production database:** untouched. No Prisma migration / `db push`. Server tests used `TEST_DATABASE_URL` from `server/.env.test` only. Mobile app, Map, Reels, Itinerary, Wallet, AdMob, and vendor review architecture were not modified.

---

## 1. Root cause of the search issue

`GET /admin/places` already accepted `search` and matched `name` / `city` / `state` (plus description and tags). The Places UI still felt broken because:

1. **Client-side sort of the current page.** After a server page of 25 rows arrived, the table re-sorted only those rows. Sort indicators did not match the full result set.
2. **`getPlaces` dropped every `sort` except `city`.** Priority/name sorts never reached the API.
3. **Search also scanned `description` and `tags`.** Queries like a city name could return unrelated places whose description mentioned that city.
4. **Category filter used `.toUpperCase()`.** UI categories are lowercase (`waterfall`); the API compared `WATERFALL`, so Search + Category often returned nothing.
5. **No request sequencing.** An older search response could overwrite a newer one.
6. **Search UX.** Placeholder was “Search places…”, no clear (X), no dedicated no-match empty state, and debounce always reset page even when the committed query had not changed.

---

## 2. Root cause of Rating / Reviews columns

Those columns were defined only in the Admin Places `DataTable` (`key: "rating"`, `key: "reviewCount"`). They were display/sort keys on tourist Places, not vendor review moderation. They were removed from this table only.

---

## 3. Exact files changed

| File | Change |
|---|---|
| `admin/src/app/dashboard/places/page.tsx` | Remove Rating/Reviews; add Priority Order; search UX; server sort; stale-request guard |
| `admin/src/app/dashboard/places/utils.tsx` | `effectivePlaceSearch`, `pageAfterSearchChange`, numeric `editorialPriority` sort |
| `admin/src/services/places.ts` | Pass through `sort` and `sortDir` (no longer strip sort) |
| `admin/src/app/dashboard/places/utils.test.ts` | **New** |
| `admin/src/app/dashboard/places/places-table.test.ts` | **New** |
| `server/src/modules/places/services/places.adminQuery.ts` | **New** search where + orderBy helpers |
| `server/src/modules/places/services/places.crud.service.ts` | Use helpers; category case-insensitive equals |
| `server/src/__tests__/admin-places-query.unit.test.ts` | **New** |
| `server/src/__tests__/places.test.ts` | Admin list search/sort integration |
| `server/vitest.shared.js` | Register unit test file |

**Not changed:** `admin/src/app/dashboard/reviews/page.tsx`, vendor review pages, PlaceForm (still edits `editorialPriority`), PlaceDetailDrawer, mobile app, schema.

---

## 4. Search data flow

Places page search input (trimmed, 300ms debounce, min 2 characters)  
→ `filters.search` (other filters preserved)  
→ `GET /admin/places?search=&state=&city=&category=&status=&verified=&featured=&touristOnly=&sort=&sortDir=`  
→ `placesController.adminList` (`authenticate` + `requireAdmin`)  
→ `placesCrudService.buildAdminWhere` + `buildAdminPlaceSearchWhere`  
→ Prisma `contains` **insensitive** on **name, city, state only** (word-AND)  
→ paginated rows  

Clear (X): clears search only, reloads list, keeps State/City/Category/Verified/Featured/Status/Tourist-only.  
Filter change: `syncUrl` keeps search, resets to page 1.  
Newer fetches ignore older responses via `fetchSeq`.

---

## 5. Priority data flow

Canonical field: **`Place.editorialPriority`** (`editorial_priority`, integer 1–5, default 3). Same field as Place Form “Priority (itinerary)”. Not derived from rating/reviews. Not random.

Table column **Priority Order** renders `place.editorialPriority` (or "—" if missing).

---

## 6. Sorting behavior

Pagination is server-side (`PAGE_SIZE` 25). Header clicks send `sort` + `sortDir` to the API.

| UI column | API `sort` | Field |
|---|---|---|
| Priority Order | `priority` / `editorialPriority` | `editorialPriority` |
| Name, Category, City, State, Status | same key | same column |

`asc` / `desc` are honored. DataTable arrow matches `sortDir`. Client-side `sortPlaces` is used only when the rare local full-fetch path runs (source/missing-image filters), on the **full** filtered set, not one page.

---

## 7. Filters + search behavior

Search is AND-combined with State, City, Category, Verified, Featured, Status, and Tourist destinations only. Example: search city + `category=waterfall` returns only matching waterfall rows. Clearing search does not clear those filters.

---

## 8. Tests added

Search: exact/partial name, city, state, case-insensitive, search+category, clear/URL preserve filters, no-result copy, pagination reset helper.  
Priority: display `editorialPriority`, asc/desc, real field.  
Regression: no Rating/Reviews columns; vendor reviews page and vendor profile reviews unchanged.

---

## 9. Tests passed

| Suite | Result |
|---|---|
| Admin `npx tsc --noEmit` | PASS |
| Admin `npm run lint` (`--max-warnings 0`) | PASS |
| Admin `npx vitest run` (4 files / 21 tests) | PASS |
| Server `npx tsc --noEmit` | PASS |
| Server `npm run lint` | PASS (0 errors; 3 pre-existing warnings) |
| Server `admin-places-query.unit.test.ts` | PASS 8/8 |
| Server `places.test.ts` admin search/priority on `TEST_DATABASE_URL` | PASS 4/4 (17 skipped in that run) |

---

## 10. Tests not run

| Suite | Reason |
|---|---|
| Full `places.test.ts` (all 21 cases) | Only the new admin search/priority describe was re-run |
| Full server `test:unit` / `test:integration` / `test:e2e` | Out of this workstream |
| Browser click-through of Admin UI | No admin session automation in this pass |

---

## 11. Production untouched confirmation

- No `prisma migrate` / `db push`.
- No schema edits.
- No production credentials changes.
- Integration tests used `TEST_DATABASE_URL` only.
- Vendor review architecture unchanged.

---

## Final status

| Check | Status |
|---|---|
| SEARCH | **PASS** (unit + TEST_DATABASE list API). Browser UI **not separately verified**. |
| PRIORITY ORDER | **PASS** (field `editorialPriority`; API asc/desc). |
| RATING/REVIEWS REMOVED | **PASS** (Places table source tests). |
| VENDOR REVIEWS | **UNCHANGED** (reviews page Rating column + vendor profile `vendorReviews` still present). |
| TYPESCRIPT | **PASS** (admin + server). |
| LINT | **PASS** (admin 0 warnings; server 0 errors). |
| PRODUCTION | **UNTOUCHED** |
