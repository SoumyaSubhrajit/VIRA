# VIRA Capture (Android companion)

This is the background Android companion for the local VIRA finance ledger. It is an APK project, not a Windows `.exe`. The one-time setup screen stores the VIRA URL, a device token and an allowlist of payment-app package IDs. After the user grants Android Notification Access, `PaymentNotificationListener` runs without a foreground screen, parses supported amount/direction/merchant patterns, and sends only the minimal normalized event to `/api/finance/device`.

## Server setup

In `operator/.env.local`, create a random device token of at least 24 characters:

```text
VIRA_DEVICE_TOKEN=generate-a-long-random-value
```

Restart Next.js. Keep the URL reachable from the phone. `localhost` on a physical phone means the phone itself; use the computer's LAN address and keep the server bound to a reachable interface. Use HTTPS outside your private LAN. The current development manifest allows cleartext HTTP for local testing and must be removed before public distribution.

## Build

Open this directory in Android Studio and run `assembleDebug`, or use `gradlew.bat assembleDebug` after Android Studio creates/downloads the Gradle wrapper. Android Gradle Plugin 8.9 uses Gradle 8.11.1, SDK Build Tools 35 and JDK 17; install those through Android Studio. The current workstation does not have an Android SDK/Gradle wrapper, so this repository contains the complete source and manifest but no built APK yet.

## Limitations and privacy

Notification access is a powerful, user-granted Android permission. Keep the allowlist narrow; do not enable messaging, banking-login or OTP apps. Google Pay itself does not expose a general third-party live transaction API, so notification capture is best-effort and some notifications may be redacted or missing. The companion does not infer cash, card, or the user’s reason for spending. Check the VIRA review queue. Device capture is single-user local mode and needs authentication and HTTPS before internet hosting.
