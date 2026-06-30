# On-Reader POS (Stripe S710 "Apps on Devices") — Plan

Goal: run the whole POS **on the Stripe Reader S710 itself** — staff picks a
booking, adjusts price/customer if needed, starts the charge, and hands the
reader to the customer to tap + tip. **One device, no second screen.**

This is a separate **native Android app**, gated on Stripe approval. This doc is
the build plan so it's turnkey once the prerequisites land. Everything in the web
app (booking selector, POS charge flow, accounting webhook) is the shared
backend this app calls — none of it is throwaway.

---

## Why native (not our website)

The S700/S710 runs a hardened Android (no Google Play, no kiosk browser you can
point at a URL). Stripe only deploys a **native APK** via its "Apps on Devices"
program. Our Next.js POS **cannot** run in a browser on the reader. So the
on-reader app is a thin native client that talks to our existing backend.

## Architecture — thin client over the existing backend

```
┌─────────────── Stripe Reader S710 ───────────────┐
│  Native Android app (Kotlin)                      │
│   • Lists bookings      → GET /api/admin/bookings/search
│   • Searches customers  → GET /api/admin/customers/search
│   • Starts a charge     → POST /api/admin/pos/intent   (NEW, see below)
│   • Collects payment ON-DEVICE via the Stripe        │
│     Terminal "Apps on Devices" SDK (handoff mode)    │
└───────────────────────────────────────────────────┘
                     │ same webhook as today
                     ▼
        /api/stripe/webhook → records the transaction
        (customers, bookings, accounting stay connected)
```

Key point: **payment collection differs from the web POS.** The web POS is
*server-driven* (`processOnReader` pushes the PaymentIntent to the reader). The
on-reader app uses the **on-device SDK in handoff mode**: the app creates a
PaymentIntent on our backend, then calls the local SDK to collect on the same
device (the Stripe Reader app comes to the foreground, takes the tap + tip, then
hands control back). Our `charge.succeeded`/`payment_intent.succeeded` webhook is
unchanged, so accounting is identical.

### One backend addition needed
`POST /api/admin/pos/intent` — create a `card_present` PaymentIntent with the
same metadata the web POS uses (`source:'pos'`, `sale_type`, `booking_id`,
`supabase_customer_id`, `admin_user_id`) and return its `client_secret`, but do
**not** call `processOnReader` (the device collects locally). The existing
`/api/admin/pos/charge` stays as-is for the web/tablet flow. The webhook already
handles the resulting transaction — no accounting changes.

### Device auth
The reader app needs to authenticate to our backend. Options, simplest first:
1. A long-lived **device API key** (env-stored, checked in a small middleware on
   the `/api/admin/pos/*` + search routes) — pragmatic for one reader.
2. A device login (admin credentials stored in the Stripe SDK's secure storage).
Recommendation: device API key header for v1.

## Stripe SDK
- Artifact: `com.stripe:stripeterminal-appsondevices:5.x`
- Discovery: `discoverReaders` with `AppsOnDevicesDiscoveryConfiguration`, then
  `connectReader` in handoff mode.
- The app is set as the device's `default_kiosk_application` (launches on boot
  and after each payment).

## Prerequisites (the long poles — start now)

1. **Stripe approval for "Apps on Devices."** It is NOT self-serve. Email Stripe
   (sales rep, or support if none) to request access + eligibility. Suggested ask:

   > "We run MC Racing Sim Fort Wayne on Stripe Terminal with a Reader S710
   > (account: <ACCOUNT_ID>). We want to deploy our own POS app directly on the
   > reader via Apps on Devices so staff can take the whole transaction on one
   > device. Please enable Apps on Devices for our account and point us at the
   > onboarding + dev kit. We have the engineering resources to build the Android
   > app."

2. **A Stripe DevKit reader.** Production readers have USB/adb disabled — you
   build/test on a DevKit (request it with approval).

3. **No Google Play submission.** The APK is uploaded directly to Stripe and
   deployed over-the-air to the reader (deploy groups). App review for S700/S710
   without P2PE is automatic/instant.

## Build steps (once approved + dev kit in hand)
1. Add `POST /api/admin/pos/intent` to this repo + device-auth middleware.
2. New Android (Kotlin) project; integrate `stripeterminal-appsondevices`.
3. Screens: booking list (from `/bookings/search`), sale form (prefill +
   price/customer override, mirroring `PosClient.tsx`), charge → on-device
   collect → success.
4. Test on DevKit in **sandbox** with physical test cards.
5. Upload APK → Stripe → deploy to the reader's deploy group → set as
   `default_kiosk_application`.
6. Resubmit the same APK for **live** (sandbox approval doesn't carry over).

## Effort / risk
- Separate native codebase + maintenance (no Google Play Services on the device).
- Approval timeline is outside our control — **start step 1 immediately.**
- Backend work is small (one endpoint + device auth) and reuses everything else.

## Status
- [x] Shared backend ready: `/api/admin/bookings/search`, `/api/admin/customers/search`, POS charge + webhook accounting.
- [ ] Stripe "Apps on Devices" approval (owner/dev action — email Stripe).
- [ ] DevKit reader acquired.
- [ ] `POST /api/admin/pos/intent` + device auth.
- [ ] Native Android app built + deployed.

Reference docs:
- Overview: https://docs.stripe.com/terminal/features/apps-on-devices/overview
- Build/test: https://docs.stripe.com/terminal/features/apps-on-devices/build
- Deploy: https://docs.stripe.com/terminal/features/apps-on-devices/deploy-in-dashboard
- Sample app: https://github.com/stripe-samples/terminal-apps-on-devices
