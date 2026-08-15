# PalSafar — Microphone / Voice-Search Removal Report

**Date:** 2026-08-14  
**Scope:** Remove microphone / voice-search UI and dead code only.  
**Production:** Not touched.

---

## 1. Microphone-related files found

### Voice-search / microphone UI (removed)

| File | What was found |
| --- | --- |
| `src/screens/HomeScreen.tsx` | Decorative `mic-outline` icon on the home search bar. Unused `HomeSearchBar` import (the live home search bar is inline). No speech-recognition handler — tap opened text search. |
| `src/components/home/HomeSearchBar.tsx` | `onVoicePress` prop, “Voice search” accessibility label, and `mic-outline` button. Handler fell back to `onPress` (open search). Component is exported but was not rendered on Home. |

### Related but **not** voice-search (preserved)

| File | Why kept |
| --- | --- |
| `ios/PalSafar/Info.plist` | `NSMicrophoneUsageDescription` — “PalSafar needs microphone access when recording video for reels.” Required for Reels camera video. |
| `ios/README.md` | Documents the Reels microphone usage string. |
| `src/screens/CreateVendorReelScreen.tsx` | `launchCamera` with `mediaType: 'video'` — legitimate Reels recording. |
| `src/services/api/trips.ts` | `voiceNotes` field on trip payloads — itinerary voice-note URLs, not search. |
| `server/src/modules/trips/trips.validation.ts` | `voiceNotes` Zod field for trip APIs. |

### Searched, no voice-search implementation

- `src/screens/SearchScreen.tsx` — text search only (`searchUniversal`, `setQuery`).
- `src/features/mapExplore/components/MapExploreSearchBar.tsx` — text + filter only.
- `src/features/notifications/components/NotificationSearchBar.tsx` — text only.
- `src/features/creator/components/CollaborationSearch.tsx` — text only.
- `admin/src/components/GlobalSearch.tsx` — admin text search only.
- `server/src/modules/search/*` — generic search APIs; no voice/speech endpoints.
- Android `AndroidManifest.xml` — no `RECORD_AUDIO`.
- Root / admin / server `package.json` — no `react-native-voice`, `@react-native-voice/*`, or speech-to-text libraries.

False-positive matches (invoice, “dynamic”, accessibility “voice”, trip `voiceNotes`) were inspected and left unchanged.

---

## 2. Files changed

| File | Change |
| --- | --- |
| `src/screens/HomeScreen.tsx` | Removed `mic-outline` icon from the home search bar. Removed unused `HomeSearchBar` import. Text-search `onNavigateToSearch` handler unchanged. |
| `src/components/home/HomeSearchBar.tsx` | Removed `onVoicePress`, mic button, and “Voice search” label. Filter button and text-search press remain. |
| `MICROPHONE_REMOVAL_REPORT.md` | This report. |

No other screens, search bars, Map, Reels, Itinerary, Reviews, AdMob, Wallet, Vendor, Creator, nearby-radius, or backend files were modified.

---

## 3. Dependencies removed

**None.**

No voice-search-only package existed in `package.json` or lockfiles. `react-native-video`, `react-native-image-picker`, and `react-native-permissions` remain (Reels / media / location).

---

## 4. Android permission status

| Permission | Status |
| --- | --- |
| `RECORD_AUDIO` | **Not present** in `android/app/src/main/AndroidManifest.xml` before or after this change. Nothing to remove. |
| Camera / media | Unchanged (`CAMERA`, `READ_MEDIA_VIDEO`, etc.) for Reels and uploads. |

Android native config was **not** changed. `assembleRelease` was **not** run (per task: only if Android config changed).

---

## 5. iOS permission status

| Key | Status |
| --- | --- |
| `NSMicrophoneUsageDescription` | **Kept.** Used for Reels video recording (`CreateVendorReelScreen` camera capture). Removing it would break legitimate microphone use. |

No iOS native config was changed.

---

## 6. Backend changes

**None.**

Server search module has no dedicated voice-search endpoint. Generic search APIs (`/search`, hybrid/places search) were left intact. Trip `voiceNotes` validation was left intact.

---

## 7. Tests executed

From `D:/PalSafar`:

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | **Pass** (exit 0) |
| `npm run lint` | **Pass** — 0 errors, 387 warnings (pre-existing unused-var / hook warnings; none introduced as errors) |
| `npm test` | **Pass** — 4 suites, 19 tests (`place-review-ui`, `map-city-card`, `distance`, `category-nearby`) |

No search-specific or microphone-specific tests existed. No tests were modified.

---

## 8. Build result

- Android config unchanged → `assembleRelease` **not run**.
- iOS config unchanged → no iOS archive.

---

## 9. Regression confirmation (code inspection)

| Area | Status |
| --- | --- |
| Home text search | Home search bar still calls `onNavigateToSearch?.()`. Mic icon gone; no replacement control. |
| Global / Search screen | `SearchScreen` `TextInput` + `searchUniversal` / nearby / city category search unchanged. |
| Map search | `MapExploreSearchBar` text input, submit, clear, filters unchanged. |
| City / vendor / place search | Search screen filters and result sections unchanged. Nearby-radius constants not touched. |
| Reels audio/video | Camera video pick, `react-native-video`, iOS mic usage string preserved. |
| Replacement voice feature | None added. No disabled mic icon left. |

---

## 10. Production

Production was **not** deployed, migrated, or otherwise touched. This is a local source cleanup only.

---

## 11. Acceptance criteria

- [x] Full-repo search for microphone / voice-search / speech-to-text / `RECORD_AUDIO` / `NSMicrophoneUsageDescription`
- [x] No microphone button or icon remains in UI
- [x] No disabled microphone icon left behind
- [x] No replacement voice-search control added
- [x] Voice-search handlers / state / hooks removed (there were no real STT handlers; only UI + unused prop)
- [x] No dead `onVoicePress` / “Voice search” strings in `src/`
- [x] Android `RECORD_AUDIO` audited — was never present; not added or removed
- [x] iOS `NSMicrophoneUsageDescription` kept for Reels video recording
- [x] No voice-search-only npm package to uninstall
- [x] No backend voice-search endpoint to remove
- [x] Nearby-radius / Map / Reels / Itinerary / Reviews / AdMob / Wallet / Vendor / Creator / backend search left alone
- [x] `tsc --noEmit` pass
- [x] `npm run lint` — 0 errors
- [x] Jest suites pass
- [x] Text search handlers remain
- [x] Legitimate audio/video not removed
- [x] Production not touched
