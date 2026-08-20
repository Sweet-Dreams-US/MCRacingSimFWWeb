# Meta Pixel + Conversions API — how tracking works here

**Dataset / Pixel ID:** `936045282838979`

Every conversion-relevant event is fired **twice on purpose** — once from the
browser (Pixel) and once from our server (Conversions API) — carrying the same
`event_id`. Meta deduplicates the pair and counts one conversion. The browser
half is fast but lossy (ad blockers, iOS ITP, people closing the tab); the
server half is authoritative and unblockable. Neither alone is trustworthy.

Nothing here relies on Meta's automatic button/URL event detection. Every event
is fired explicitly from application state.

---

## The gap this replaced

July 2026 reported **8 Schedule conversions in Events Manager against 13 real
bookings**. Three separate causes, all now fixed:

1. **The browser `Schedule` almost never fired.** `/book/confirmation` only
   rendered the Pixel event when `bookings.stripe_payment_method_id` was set —
   but that column is written *only* by the `setup_intent.succeeded` webhook,
   and the customer's browser lands on that page the instant
   `stripe.confirmSetup()` resolves, normally *before* Stripe has dispatched the
   webhook. The page lost the race on most real bookings. It now asks Stripe for
   the SetupIntent status directly, which is true the moment the card is saved.
2. **The server `Schedule` had no click ID.** It fires from the Stripe webhook,
   where there is no customer request — so no `_fbp`, no `_fbc`, no IP, no user
   agent. Meta could match on hashed email/phone but had nothing tying the
   conversion to an ad click, so it was largely unattributed. We now capture the
   click context in the browser at landing, persist it on the booking row, and
   read it back in the webhook.
3. **Nothing surfaced the discrepancy.** Every server `Schedule` now stamps
   `bookings.meta_schedule_sent_at`, and `/admin/ads` shows a weekly
   bookings-vs-events-sent table. A gap is visible the same week.

---

## Event map

| Funnel step | Event | Browser | Server (CAPI) | Shared `event_id` |
|---|---|:--:|:--:|---|
| Any page | `PageView` | ✅ | — | — |
| Booking page viewed | `ViewContent` | ✅ | — | — |
| Time slot picked | `AddToCart` | ✅ | — | — |
| Details submitted, entering card step | `InitiateCheckout` | ✅ | ✅ | `ic_<bookingId>` |
| Card saved | `AddPaymentInfo` | ✅ | ✅ | `api_<bookingId>` |
| **Booking confirmed** | **`Schedule`** | ✅ | ✅ | `sched_<bookingId>` |
| Money captured at the counter | `Purchase` | — | ✅ | `pos_<paymentIntentId>` |
| Contact form submitted | `Lead` | ✅ | ✅ | client-generated UUID |
| Phone/email link clicked | `Contact` | ✅ | — | — |
| Location page viewed | `FindLocation` | ✅ | — | — |

**Optimize campaigns on `Schedule`.** Watch `InitiateCheckout` as the leading
indicator while `Schedule` volume is thin.

### What counts as a conversion

`Schedule` fires **only for `source = 'online'`** bookings. Staff-entered
bookings (phone, walk-in, admin card-hold invites) are excluded on both the
browser and server side — reporting them would poison ad optimization by
teaching Meta that audiences who never saw an ad convert.

The server `Schedule` also fires only for the winner of the pending→confirmed
race, so a redelivered Stripe webhook cannot double-count.

---

## Where each piece lives

| Concern | File |
|---|---|
| Base pixel, `metaTrack()`, `MetaEventOnMount` | `src/components/MetaPixel.tsx` |
| Server event sender + SHA-256 hashing | `src/lib/meta/capi.ts` |
| Click-ID / UTM capture + persistence | `src/lib/meta/attribution.ts` |
| `Schedule` + `AddPaymentInfo` (server) | `src/lib/booking.ts` → `finalizeConfirmedBooking()` |
| `InitiateCheckout` (server) | `src/app/api/booking/create/route.ts` |
| `Purchase` (server) | `src/app/api/stripe/webhook/route.ts` |
| `Lead` (server) | `src/app/api/contact/route.ts` |
| Weekly reconciliation | `src/lib/meta/reconciliation.ts` → `/admin/ads` |
| Attribution columns | `supabase/migrations/016_meta_click_attribution.sql` |

---

## Advanced matching

Meta never receives a raw email, phone number, or name. `src/lib/meta/capi.ts`
SHA-256 hashes every identifier **on the server** before it leaves the building:

- **email** — lowercased, trimmed, then hashed
- **phone** — digits only, E.164 without `+` (a 10-digit US number gets a `1`
  prefix), then hashed
- **first/last name** — lowercased, trimmed, then hashed
- **external_id** — our `customer_id`, hashed

Unhashed by design (Meta requires these raw): `client_ip_address`,
`client_user_agent`, `fbp`, `fbc`.

---

## Click-ID capture (why server events attribute at all)

`src/lib/meta/attribution.ts` runs on **every page load**:

1. Reads `fbclid` and `utm_*` off the URL, and the `_fbp` / `_fbc` cookies.
2. If there's an `fbclid` but no `_fbc` cookie — the Pixel was blocked, or the
   customer left before `fbevents.js` ran — it rebuilds the click ID in Meta's
   documented format (`fb.1.<clickTimeMs>.<fbclid>`) and writes the cookie
   itself. If there's no `_fbp` at all, it mints one in the same format; the
   real Pixel adopts an existing `_fbp` rather than replacing it.
3. Persists everything first-touch in `localStorage` (a **new** `fbclid` always
   wins, so a fresh ad click re-attributes; UTMs are first-touch so internal
   links like `/book?code=FASTESTLAP` can't erase the campaign).
4. `BookingFlow` sends the bundle to `/api/booking/create`, which sanitizes it
   (`sanitizeAttribution` — untrusted client input), prefers the request's real
   cookies where present, and stores it on the booking row.
5. `finalizeConfirmedBooking()` reads it back in the webhook and attaches
   `fbp` / `fbc` / IP / UA to the server `Schedule`.

The IP and user agent forwarded to Meta are `consent_ip` / `consent_user_agent`
— captured in the customer's *own* request at booking time. Sending the Vercel
function's IP instead would be worse than sending nothing.

### First-party attribution

`deriveAttributedSource()` maps the captured signals onto the canonical
`attributed_source` values and writes them to `mc_bookings`. A real `fbclid`
outranks a `utm_source` that disagrees, and both outrank the self-reported "How
did you hear about us?" dropdown. This gives revenue-by-source reporting that
does not depend on Meta agreeing with us.

---

## Environment variables

| Variable | Required | Purpose |
|---|:--:|---|
| `NEXT_PUBLIC_META_PIXEL_ID` | yes | Browser pixel. Public, non-secret. |
| `META_DATASET_ID` | yes | CAPI target. Same value as the pixel ID. |
| `META_CAPI_TOKEN` | **yes** | System-user token for the dataset. **Secret — server only.** Without it, every server event is silently skipped. |
| `META_TEST_EVENT_CODE` | no | **Validation only.** See below. |
| `META_ADS_TOKEN` | no | `ads_read` token for the `/admin/ads` readout. |
| `META_AD_ACCOUNT_ID` | no | Ad account for the same. |
| `META_CAMPAIGN_KEYWORD` | no | Brand filter (the ad account is shared). |

Generate `META_CAPI_TOKEN` in Business Settings → Users → System Users → Generate
New Token, with access to dataset `936045282838979`. Store it as a Vercel
environment variable. Never put it in client code.

---

## Manual steps in Events Manager (cannot be done from code)

These must be changed by hand in the Meta UI, or the deterministic events above
will be polluted by Meta's guesses:

1. **Turn OFF automatic event detection / the Event Setup Tool.**
   Events Manager → Data Sources → the dataset → Settings → *Automatic Advanced
   Matching* and *Event Setup Tool*. Meta's DOM-based button and URL guessing is
   what produced the unreliable July numbers. Every event we care about is now
   fired explicitly.
2. **Turn OFF Automatic Advanced Matching.** We send hashed match keys
   ourselves, server-side, which produces better match quality and avoids
   sending raw PII from the browser.
3. **Confirm domain verification.** Already in place via the
   `facebook-domain-verification` meta tag in `src/app/layout.tsx`.
4. **Set `Schedule` as the campaign's optimization event.**

---

## Validating a change

1. Set `META_TEST_EVENT_CODE` in the Vercel **preview** environment to the code
   from Events Manager → Test Events.
2. Walk the funnel on the preview deploy: load `/book` → pick a slot → submit
   details → save a test card.
3. In Test Events you should see, in order: `PageView`, `ViewContent`,
   `AddToCart`, `InitiateCheckout` (browser **and** server, one row after
   dedupe), `AddPaymentInfo`, `Schedule`.
4. Check each conversion shows **one** event, not two — if `Schedule` appears
   twice, the `event_id`s diverged.
5. Check the match-quality score on `Schedule`. It should list email, phone,
   external_id, IP, user agent, and — for a visit that arrived with an
   `fbclid` — `fbc`.
6. **Unset `META_TEST_EVENT_CODE` when finished.** While it is set, server
   events go to the Test Events tab *instead of* production reporting.

> Test the fbclid path by loading the preview URL with `?fbclid=TEST123` before
> booking, then confirm `fbc` is present on the resulting `Schedule`.

---

## Weekly reconciliation

Open **`/admin/ads` → Tracking health**. Three numbers should agree:

- **Bookings** — real confirmed online bookings (our database)
- **Sent to Meta** — how many `Schedule` events we successfully sent
- Meta's **Bookings (Schedule)** count in the Conversions panel above

`Missing > 0` means bookings happened that Meta was never told about — check
Vercel logs for `[meta] CAPI Schedule failed`. "Sent to Meta" matching our
bookings but Meta reporting fewer means a dedupe or match-quality problem, not a
delivery problem.

Straight from SQL:

```sql
SELECT * FROM public.mc_meta_schedule_reconciliation;
```

`With ad click ID` is the share of bookings that carried an `fbclid`/`_fbc`.
It will not be 100% — plenty of customers arrive organically — but if it is
near zero while campaigns are running, click-ID capture is broken.

---

## Privacy

- The site has a privacy policy at `/privacy`.
- Raw PII never reaches Meta; everything identifying is SHA-256 hashed
  server-side.
- There is **no cookie-consent gate** on this site (a US-only local business, no
  GDPR/UK obligation). If one is ever added, `MetaPixel` and
  `captureAttribution()` must be gated behind consent before firing.
