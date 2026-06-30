# MC Racing POS — On-Reader App (Stripe S710, Apps on Devices)

A native Android app that runs **directly on the Stripe Reader S710**. Staff pick
a booking (or start a walk-in), the price/customer prefill, then the customer taps
+ tips **on the same device**. No second screen.

It's a thin client over the existing Next.js backend, so customers, bookings, and
accounting stay connected: every charge flows through the same Stripe webhook that
records transactions today.

> **Status:** scaffold. It must be **opened + built in Android Studio** to produce
> an APK (a web-dev machine can't emit one), and tested on a **Stripe DevKit
> reader** (or deployed to the real S710 in sandbox). The Stripe Terminal SDK
> calls are written against the verified **Apps on Devices SDK 5.6.0** sample —
> if a method/class name drifted in a newer SDK, Android Studio will flag it.

## Architecture

```
S710 (this app)  ──►  Next.js /api/terminal/*        ──►  Stripe + Supabase
  Bookings list  ──►  GET  /bookings
  Create charge  ──►  POST /create_payment_intent      (card_present, manual capture)
  Collect+tip    ──►  [Stripe Reader app, on-device]   (SDK processPaymentIntent)
  Capture        ──►  POST /capture_payment_intent
                       └► stripe webhook → records the transaction (accounting)
  Token          ──►  POST /connection_token
```

All `/api/terminal/*` routes are protected by a **device key** (`POS_DEVICE_KEY`
on the server === `DEVICE_KEY` in the app).

## One-time setup

1. **Server env (Vercel project `mc-racing-sim-fw-web`):** add
   `POS_DEVICE_KEY` = a long random string (`openssl rand -hex 32`).
2. **App config:** copy `local.properties.example` → `local.properties` and set
   `BACKEND_URL=https://www.mcracingfortwayne.com/api/terminal/` (trailing slash)
   and `DEVICE_KEY=` the same value as `POS_DEVICE_KEY`.
3. Open the `android-pos/` folder in **Android Studio** (Ladybug+). Let it sync;
   it generates the Gradle wrapper + downloads the SDK.

## Build the APK

```bash
./gradlew :app:assembleRelease
# → app/build/outputs/apk/release/app-release.apk  (sign with your own keystore)
```
Use a stable release keystore (same key for every update). R8 is off by default to
protect the Stripe SDK's reflection.

## Upload + deploy (Stripe Dashboard — no Google Play)

1. **Terminal → Software → Create app** → name + package `com.mcracing.pos`.
2. Choose **Stripe Reader S700/S710**, upload `app-release.apk`, add reviewer
   notes + a notification email, **Submit for review** (auto/instant for S710).
3. After approval (email + webhook `terminal.device_asset_version.app_review_approved`):
   **Terminal → Software → Deploy groups** → create a group, attach your reader's
   **Location**, **New deployment** → pick the approved version → set **this app as
   the kiosk app** → Deploy. The reader downloads + reboots into the app.

## Test in sandbox first

Point `POS_DEVICE_KEY` / the backend at **test** Stripe keys, build, deploy to a
**DevKit** (production readers can't be sideloaded), and run physical test cards.
Sandbox approval does **not** carry to live — resubmit the same APK for live.

## Files

- `terminal/TerminalManager.kt` — SDK init, Apps-on-Devices connect, the
  create→collect+tip→capture sale flow.
- `net/Api.kt` — Retrofit client to `/api/terminal/*` (device-key header).
- `ui/` — Compose screens (bookings → sale → result).
- `MainActivity.kt` — location permission → Terminal init/connect → `PosApp()`.

## Gotchas (see also ../docs/on-reader-app-plan.md)

- No Google Play Services on the device — don't add Firebase/Maps/GMS deps.
- Location permission **and** GPS must be on or `Terminal.init` throws.
- Only `stripeterminal-{core,appsondevices,ktx}` — never the top-level
  `com.stripe:stripeterminal`.
- A crash on launch can crash-loop the kiosk — keep init resilient (no `throw` in
  the UI path).
