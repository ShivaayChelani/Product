# Reels & Sharing Hardening Report

Production database was not used. Server integration tests ran against `TEST_DATABASE_URL` only.

## 1. Reel like button

### Root cause

The like API (`POST/DELETE /social/reels/:id/like` with `authenticate`) already worked.

The broken layer was the client:

1. Like state was taken from `user.likedReels`, which is never hydrated from the feed’s `isLiked` flag. A reel that was already liked on the server was treated as unliked, so the next tap sent **like** instead of **unlike**.
2. The UI updated **before** the API returned (optimistic). `ReelDetailScreen` also updated local count immediately, then called a parent handler that could like again.
3. Failed requests could still look successful on the detail screen because local state was not tied to the server result.
4. `item.isLiked` was not updated after a toggle, so FlashList could keep showing the old heart.

### Fix

- `commitReelLikeToggle` waits for the server, then callers apply `isLiked` + count.
- Failed requests leave the last confirmed state (no fake success).
- Duplicate in-flight taps are ignored.
- Backend like/unlike now 404s for non-`APPROVED` reels unless the caller is the creator owner or collab vendor (same rule as `getReelById`). Duplicate likes still return the existing row without incrementing.

### Regression tests

- Frontend: `src/__tests__/reel-like.test.ts` (like, unlike, count floor, duplicate id merge, feed `isLiked` seed)
- Backend: `server/src/__tests__/reel-like.test.ts` (401 unauthenticated like/unlike, 404 missing reel, like/unlike/duplicate/count when a public reel exists)

## 2. Reel share link

### Root cause

`ReelsFeedScreen.handleShare` (and the detail viewer `onShare={() => {}}`) shared caption text only. No URL was built. The app already had a canonical host in `src/navigation/linking.ts` (`https://palsafar.com`, `palsafar://`) but **no** `reel/:reelId` path.

### Existing deep-link architecture

| Prefix | Source |
| --- | --- |
| `palsafar://` | `linking.ts`, Android `intent-filter` scheme `palsafar` |
| `https://palsafar.com` / `https://www.palsafar.com` | `linking.ts`, Android App Links `autoVerify` |

Existing paths included `place/:spotId`, `vendor/:vendorId`, `trip/:tripId`, `reels` (Explore tab). No competing reel URL existed.

### Fix

- Canonical reel URL: `https://palsafar.com/reel/<reelId>`
- Registered `ReelDetail: 'reel/:reelId'` on the existing prefixes
- Share text: `Check out this reel on PalSafar! 🎬\n<caption>\nhttps://palsafar.com/reel/<id>`
- Draft/hidden/pending reels are not given a public share URL
- No JWT/token in the URL
- `GET /social/reels/:id` remains `optionalAuth` and already 404s non-approved reels for non-owners

### Host configuration still required (unchanged, already declared)

- `https://palsafar.com/.well-known/assetlinks.json` for Android App Links
- iOS associated domain `applinks:palsafar.com`
- Opening the HTTPS URL in a browser without the app installed depends on the public website; the **app** resolves it via React Navigation

## 3. Reel back / close

### Root cause

Full-screen `ReelDetail` is a stack screen (`headerShown: false`), not a tab. It had a close icon, but:

1. Android hardware back was not handled.
2. `navigation.goBack()` failed when the reel was the only stack entry (deep link / cold open).
3. “Reel not found” had no close control.
4. Native video could sit above overlays; action rail / close lacked Android `elevation`.

The Explore **tab** feed correctly has no X (it is a tab, not a modal).

### Fix

- `closeReelScreen`: `goBack()` when possible, otherwise `navigate('MainTabs')` (does not reset unrelated tab state)
- `BackHandler` on `ReelDetailScreen`
- Explicit close button with `accessibilityLabel="Close reel"` and elevation
- Close control on the not-found state
- Video wrapped `pointerEvents="none"` so overlays receive taps; action rail `elevation: 24`

## 4. Trip share link

### Root cause

`MyTripsScreen.handleShareTrip` shared title/destination text with **no URL**. A canonical trip path already existed: `TripDetail: 'trip/:tripId'` → `https://palsafar.com/trip/<tripId>`.

Trips are **private** (`getById` requires owner or collaborator). No public itinerary API was added.

### Fix

- Share text: `Check out my PalSafar trip: <title> — <destination>\nhttps://palsafar.com/trip/<tripId>`
- Trip detail export/share appends the same URL
- Invalid ids produce no URL
- Recipients who are not owner/collaborator still cannot load itinerary data from the API

## Files changed

### Added

- `src/services/sharing/shareLinks.ts`
- `src/services/reels/reelLike.ts`
- `src/services/reels/reelLikeState.ts`
- `src/features/travelSocial/utils/closeReelScreen.ts`
- `src/__tests__/reel-like.test.ts`
- `src/__tests__/share-links.test.ts`
- `src/__tests__/reel-navigation.test.ts`
- `server/src/__tests__/reel-like.test.ts`
- `REELS_SHARING_HARDENING_REPORT.md`

### Modified

- `src/screens/ReelsFeedScreen.tsx`
- `src/screens/ReelDetailScreen.tsx`
- `src/screens/MyTripsScreen.tsx`
- `src/screens/TripDetailScreen.tsx`
- `src/navigation/linking.ts`
- `src/navigation/RootNavigator.tsx`
- `src/context/DataContext.tsx`
- `src/components/reels/ReelActions.tsx`
- `src/components/reels/ReelPlayer.tsx`
- `src/components/reels/ReelFeed.tsx`
- `server/src/modules/social/social.service.ts`

## APIs changed

- `likeReel` / `unlikeReel`: unchanged routes and auth. Extra visibility check so non-approved reels are not likeable by strangers. Duplicate like still idempotent.

No new backend share endpoints. No itinerary planner changes.

## Security checks

| Check | Result |
| --- | --- |
| Like requires authentication | PASS (`authenticate` middleware; 401 in tests) |
| Users cannot like missing/private/unapproved reels | PASS (404) |
| Share URLs contain no JWT/access token | PASS |
| Private trips remain private | PASS (existing trip access; URL is not a public itinerary dump) |
| Draft/unapproved reels not publicly shareable | PASS (`isPublicShareableReel`) |
| Creator/vendor ownership for unapproved get/like | PASS (same owner/collab-vendor rule) |

## Tests executed

| Suite | Result |
| --- | --- |
| `npx jest src/__tests__/reel-like.test.ts src/__tests__/share-links.test.ts src/__tests__/reel-navigation.test.ts` | **14/14 PASS** |
| `npx tsc --noEmit` (app) | **PASS** |
| ESLint on changed frontend files | **0 errors** (pre-existing warnings only) |
| `cd server && npx tsc --noEmit` | **PASS** |
| ESLint `social.service.ts` + `reel-like.test.ts` | **0 errors** |
| `vitest` `server/src/__tests__/reel-like.test.ts` on **TEST_DATABASE_URL** | **4/4 PASS** |

### Tests not run / partial

- Full `npm run lint` (app): **0 errors**, 383 pre-existing warnings.
- `assembleRelease` **not run** — Android native config was not changed (intent filters already included `palsafar` + `palsafar.com`).
- Backend like/unlike/duplicate/count against a **live feed reel** did not execute the inner assertions: TEST DB feed returned no public reels. Unauthorized (401) and missing-id (404) **did** run. Count/duplicate behavior is covered in frontend unit tests and existing backend idempotent `likeReel`.

## Production untouched

Confirmed: Prisma tests used `TEST_DATABASE_URL` (guard refuses production `DATABASE_URL`). No production writes.

## Acceptance

- [x] Like uses the real reel id and authenticated user; UI updates only after server success
- [x] Unlike and duplicate-like handled
- [x] Reel share includes `https://palsafar.com/reel/<id>`
- [x] Trip share includes `https://palsafar.com/trip/<id>`
- [x] Hardware back + close return to previous screen or MainTabs
- [x] One canonical URL scheme (`palsafar.com` / `palsafar://`)
- [x] Production not touched
