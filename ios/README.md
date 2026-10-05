# PalSafar iOS Setup

Cross-platform React Native **0.81.5** (Hermes, **Legacy Architecture** to match Android `newArchEnabled=false`). Android remains the primary CI target on Windows; iOS builds require **macOS + Xcode 15+**.

## Bundle identity

| Key | Value |
|-----|-------|
| Display name | PalSafar |
| Bundle ID | `com.palsasafar` |
| Module name | `PalSafar` (must match `app.json`) |
| Min iOS | 15.1 |
| Architecture | Legacy (`ENV['RCT_NEW_ARCH_ENABLED']='0'` in Podfile) |

## One-time Mac setup

```bash
# From repo root
npm install
npm run ios:setup          # bundle install + pod install + font assets
open ios/PalSafar.xcworkspace
```

1. **Signing** — Xcode → Target PalSafar → Signing & Capabilities → select Team (`DEVELOPMENT_TEAM` placeholder is empty).
2. **Firebase** — Download `GoogleService-Info.plist` for iOS app `com.palsasafar` and place at:
   `ios/PalSafar/GoogleService-Info.plist`
   Then add it to the Xcode target **Copy Bundle Resources** (drag into the PalSafar group if not auto-detected).
3. **APNs** — Apple Developer → Keys → APNs `.p8` → upload to Firebase → Project settings → Cloud Messaging.
4. **Push capability** — Entitlements file already enables Push + Associated Domains (`palsafar.in`). Switch `aps-environment` to `production` for App Store / TestFlight archives.
5. **Sentry dSYMs** — see `ios-sentry.setup.txt` and `sentry.properties`.
6. **AdMob** — Info.plist `GADApplicationIdentifier` currently uses Google’s **sample** iOS app id; replace before App Store submission (same as Android).
7. **Universal links** — Host `apple-app-site-association` (see `public/.well-known/apple-app-site-association.example`) at `https://palsafar.in/.well-known/apple-app-site-association` with your Apple Team ID.

## Simulator quick start (no Firebase plist)

The app launches without `GoogleService-Info.plist`. Firebase Auth/Messaging stay inactive until the real plist is bundled. Remote API (`USE_LOCAL_API: false`) works over HTTPS.

```bash
npm start
npx react-native run-ios
# or
npm run ios
```

## Pods of note

Autolinked via CocoaPods after `pod install`:

- `@react-native-firebase/app` + `messaging` (+ unused `auth` pod weight)
- `@sentry/react-native`
- Maps via WebView Leaflet (no `react-native-maps`)
- `react-native-video`, `image-picker`, `geolocation-service`, `permissions`, `google-mobile-ads`, `vector-icons` fonts, etc.

Podfile uses `$RNFirebaseAsStaticFramework = true` and `use_frameworks! :linkage => :static`.

## Permissions (Info.plist)

| Capability | Key |
|------------|-----|
| Camera | `NSCameraUsageDescription` |
| Location (when in use) | `NSLocationWhenInUseUsageDescription` |
| Microphone | `NSMicrophoneUsageDescription` |
| Photo library | `NSPhotoLibraryUsageDescription` |
| Save to library | `NSPhotoLibraryAddUsageDescription` |
| Push | `UIBackgroundModes` → `remote-notification` |

## Notifications parity

| State | Android | iOS |
|-------|---------|-----|
| Permission | POST_NOTIFICATIONS + FCM | UNUserNotification via Firebase `requestPermission` |
| Foreground | `onMessage` → in-app banner | same JS path |
| Background / killed | `setBackgroundMessageHandler` in `index.js` | same + `UIBackgroundModes` remote-notification |
| Tap open | `onNotificationOpenedApp` / `getInitialNotification` | same |
| Token sync | `notificationsApi.registerToken` platform `android`/`ios` | same |

Deep link scheme `palsafar://` is registered in Info.plist.

## Crash reporting

JS `initMonitoring()` in `index.js` wraps both platforms. Native iOS crashes require:

1. Valid `SENTRY_DSN` / `monitoring.local.ts`
2. `pod install` (RNSentry)
3. Archive dSYM upload via sentry-cli (see `ios-sentry.setup.txt`)

## Verify builds

```bash
# Debug device / simulator
npm run ios

# Release compile (no signing export)
npm run build:ios
```

Android must still build:

```bash
npm run android
# or
npm run build:android
```

## Sign in with Apple

The app uses `@invertase/react-native-apple-authentication` and Apple's native
authorization button. The button is available on supported iOS devices only.
Enable Sign in with Apple for the `com.palsasafar` App ID in the Apple Developer
portal and regenerate both development and App Store provisioning profiles.

The backend verifies identity tokens against Apple's JWKS. The native bundle ID
is accepted as the default audience; optional `APPLE_CLIENT_IDS` and
`APPLE_SERVICE_IDS` values allow additional app or Services IDs. Native iOS
authentication does not require an Apple private key or client secret; do not
place either in the app or repository.

The app stores Apple's provider identifier locally for credential-state checks,
clears it on logout, and checks revocation on foreground and Apple's revocation
notification. An inconclusive state check does not end a session.

## App Store blockers (external)

- Real `GoogleService-Info.plist` + APNs key
- Production AdMob app id
- App icon assets in `Images.xcassets/AppIcon.appiconset` (already generated)
- Privacy Nutrition Labels / App Privacy details
- Apple Developer Program membership + provisioning
- Sentry auth token for release symbolication
- Google Sign-In configuration and Apple Developer portal capability/provisioning
