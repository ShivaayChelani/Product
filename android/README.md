# PalSafar Android Build Notes

## Firebase provisioning (FCM)

`android/app/google-services.json` contains Firebase credentials and is **intentionally not committed**
(see the root `.gitignore`). The build fails fast with a clear message when it is missing.

Secure local setup:

1. Open the [Firebase console](https://console.firebase.google.com/) for project `palsafar-2d37b`.
2. Project settings → Your apps → Android app (package `com.palsafar` or the release package) →
   download `google-services.json`.
3. Place it at `android/app/google-services.json` (do NOT commit it, do NOT share it).
4. Build as usual — the Gradle check in `android/app/build.gradle` validates presence.

CI / other machines: provision the file from a secret (e.g. GitHub Actions secret → step writing it to
`android/app/google-services.json`) before `assembleRelease`. Never store it in source control.

## AdMob App ID

The AdMob app ID is resolved in `android/app/build.gradle` in this order:

1. `ADMOB_APP_ID` environment variable
2. `ADMOB_APP_ID` in `android/gradle.properties`
3. Default: the PalSafar production app ID (`ca-app-pub-8325735283795010~7841348028`)

Override only when building against a different AdMob account/application (e.g. a secondary test
project). Ad unit IDs and rewarded-ad behavior remain **server-controlled** via the API's
`adConfiguration`.

## Release signing

`keystore.properties` and the release keystore are local-only and not committed. Set
`PALSAFAR_KEY_PASSWORD` (env) or `keyPassword` in `keystore.properties` to sign release builds.
