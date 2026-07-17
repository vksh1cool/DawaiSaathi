# DawaiSaathi Android release

The Android app is a Trusted Web Activity (TWA), not a WebView wrapper. It opens the production PWA at `https://dawaisaathi.pages.dev` and relies on Android Digital Asset Links to remove browser chrome after the app and site verify each other.

## Local source generation

```bash
npm run android:check
npm run android:sync
```

`android:sync` regenerates the Android project from `twa-manifest.json`. It intentionally refuses to make a release APK unless all signing variables are present:

```text
ANDROID_KEYSTORE_PATH
ANDROID_KEYSTORE_PASSWORD
ANDROID_KEY_ALIAS
ANDROID_KEY_PASSWORD
```

Never commit a keystore. The signed release workflow takes its encrypted keystore from GitHub Actions secrets instead.

## Required deployment order

1. Generate a long-lived upload/release keystore and record its SHA-256 certificate fingerprint.
2. Put that exact fingerprint in the Worker as `ANDROID_APP_CERT_SHA256` and deploy it.
3. Confirm `https://dawaisaathi.pages.dev/.well-known/assetlinks.json` returns the matching package and fingerprint.
4. Add the GitHub release secrets and variable described in the root README.
5. Push a `vX.Y.Z` tag. The workflow creates a signed APK/AAB and a GitHub Release only after Asset Links verification succeeds.

Use the same signing key for every update. Changing it breaks Android update continuity and the TWA trust relationship.
