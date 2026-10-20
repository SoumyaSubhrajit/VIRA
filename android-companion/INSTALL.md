# Install the background capture app

1. Generate a token with `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`, put it in `operator/.env.local` as `VIRA_DEVICE_TOKEN=...`, and restart the VIRA server.
2. Put the computer's LAN address in the app as the server URL, for example `http://192.168.1.20:3100` (the phone must be on the same network). Do not use `localhost` on a physical phone. Use HTTPS before connecting outside your private network.
3. Install `app/build/outputs/apk/debug/app-debug.apk` on the Android phone. The debug APK is unsigned for Play Store distribution but is installable for personal testing.
4. Open **VIRA Capture**, enter the same device token and save settings.
5. Leave the default package allowlist initially. Add your bank app package IDs only if its payment notifications contain amount and direction; keep messaging and OTP apps out of the list.
6. Tap **Enable notification access**, select VIRA Capture in Android Settings and enable it. Return once to confirm settings, then close the app. The notification listener runs in the background.
7. Send a small test payment only if you are comfortable doing so. Check `/finance`; a captured event appears under the `device` source and may be `Unclassified` until reviewed.

Android may delay delivery while the device is offline or under aggressive battery restrictions. The companion queues network failures (up to 100 events) and retries when another payment notification arrives. It does not reconstruct missing notifications, cash, cards or the reason for a purchase.

## Current debug APK

The locally built APK is `app/build/outputs/apk/debug/app-debug.apk`. Rebuild with Android Studio or `gradlew.bat assembleDebug` after generating the standard Gradle wrapper.
