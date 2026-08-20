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

### Dedupe keys are structural, not conventional

Meta collapses a browser/server pair into one conversion only when both carry
the same `(event_name, event_id)`. The two halves of each pair live far apart —
the browser `Schedule` fires in a React component on `/book/confirmation`, the
server `Schedule` fires in a Stripe webhook minutes later — so both call the
**same builder** in `src/lib/meta/event-ids.ts`. You cannot change one half
without changing the other.

Ids must stay **deterministic**, derived from the booking id and never from
`Date.now()` or a random UUID, so a refresh, a form retry, or a redelivered
webhook reproduces the id instead of minting a second conversion.

`Lead` is the one exception: at submit time there is no server-side row to key
off, so the browser mints a UUID and passes it to the server. It is held in a
ref for the life of the form, so a retry after a failed response reuses it.

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
| Shared dedupe `event_id` builders | `src/lib/meta/event-ids.ts` |
| `Schedule` + `AddPaymentInfo` (server) | `src/lib/booking.ts` → `finalizeConfirmedBooking()` |
| `InitiateCheckout` (server) | `src/app/api/booking/create/route.ts` |
| `Purchase` (server) | `src/app/api/stripe/webhook/route.ts` |
| `Lead` (server) | `src/app/api/contact/route.ts` |
| Weekly reconciliation | `src/lib/meta/reconciliation.ts` → `/admin/ads` |
| Bookings by ad (first-party) | `src/lib/meta/campaign-attribution.ts` → `/admin/ads` |
| Custom Audience CSV export | `src/lib/marketing/audience-export.ts` → `/admin/marketing` |
| Attribution columns | `supabase/migrations/016_meta_click_attribution.sql` |
| Campaign reporting view | `supabase/migrations/017_campaign_attribution_view.sql` |

---

## Advanced matching

Meta never receives a raw identifier. `src/lib/meta/capi.ts` SHA-256 hashes
everything **on the server** before it leaves the building:

- **email** (`em`) — lowercased, trimmed, then hashed
- **first/last name** (`fn`/`ln`) — lowercased, trimmed, then hashed
- **external_id** — our `customer_id`, hashed

Unhashed by design (Meta requires these raw): `client_ip_address`,
`client_user_agent`, `fbp`, `fbc`.

### Phone numbers are never sent — hashed or otherwise

`ph` is deliberately absent from every Conversions API payload. Our SMS program
runs under 10DLC/A2P registration, whose carrier-mandated disclosure states:
*"We do not share mobile information with third parties for marketing or
promotional purposes."* Sending even a SHA-256 phone hash to an ad platform sits
against that promise, so the promise wins.

This is enforced structurally, not by convention:

- `MetaUserData` has **no `phone` field**, so the compiler rejects any caller
  that tries to pass one.
- `src/lib/__tests__/meta-capi-payload.test.ts` asserts no `ph` key and no phone
  digits ever appear on the wire — including the case where a phone is smuggled
  onto `userData` at runtime past the type.
- `/privacy` states it explicitly.

The match-quality cost is negligible: email is required to book, so `em` gives
near-100% coverage, and `fbp`/`fbc`/`external_id`/IP/UA carry the rest.
**If this is ever revisited, the 10DLC disclosure must change first.**

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
5. **Aggregated Event Measurement — put `Schedule` at or near the top of the
   8-event priority list.** iOS conversions route through AEM, and events that
   aren't prioritized are simply dropped for Apple users. This is a silent,
   platform-wide undercount if missed, and it looks identical to a tracking bug.

---

## Campaign tagging (UTMs)

Every ad's destination URL carries the campaign context. `utm_content` **is the
ad name**, and it is the only thing that identifies a winning creative without
asking Meta:

```
https://www.mcracingfortwayne.com/book?utm_source=meta&utm_medium=paid&utm_campaign=<CAMPAIGN>&utm_content=<AD_NAME>
```

> **`utm_content` must equal the ad's name in Ads Manager, character for
> character.** A rename on one side and not the other splits one creative into
> two rows and quietly ruins the comparison you are running the test for.

Meta appends `?fbclid=…` to that URL on a real click; we capture both.

### How to read the results

- **`/admin/ads` → Bookings by ad** — our own numbers, grouped by
  `utm_content` / `utm_campaign`, with revenue and how many carried a click id.
  Independent of Meta by design, so it stays right when Meta under-reports.
- **SQL:** `SELECT * FROM public.mc_bookings_by_campaign;`
- `mc_bookings.attributed_source` still records the coarse channel
  (`Facebook or Instagram`), derived from `fbclid`/`utm_source`.

Untagged bookings (direct, organic, an untagged link) are counted on their own
row rather than folded into a campaign, so the ad rows stay honest.

`src/lib/__tests__/meta-utm-end-to-end.test.ts` walks each live ad URL through
capture → submit → the columns written on the booking row. **If an ad is
renamed, update the list of ad names in that test.**

### What survives what

| Situation | Campaign kept? |
|---|---|
| Land on the ad URL, book immediately | yes |
| Land on the ad URL, browse the site, then book | yes — UTMs are first-touch |
| Land via `/book?code=FASTESTLAP` after an ad click | yes — internal links can't overwrite |
| Click a **second, different** ad | re-attributed to the newer ad |
| `localStorage` blocked (private mode) | yes — read back from the URL at submit |
| Organic visit, no tags | no campaign recorded (not guessed) |

---

## Meta Custom Audience export

**`/admin/marketing` → Meta ad audience → Download CSV** (owner-only) produces
the seed list for a Customer List custom audience and the Lookalike built from
it.

- **One `email` column.** Lowercased, trimmed, deduplicated by inbox. Meta
  hashes on upload, so the file is plain text and reviewable before you send it.
- **No phone column — ever.** Same reasoning as dropping `ph` from the
  Conversions API: a phone list uploaded for ad targeting is the most literal
  instance of the "share mobile information for marketing" our 10DLC disclosure
  rules out. `audience-export.test.ts` asserts no phone digits reach the file.
- **Suppression is shared with email marketing.** The export calls the same
  `getEmailableAudience()` the campaign sender uses, so unsubscribes, bounces,
  and spam complaints are excluded — and an unsubscribe removes someone from
  advertising and email at the same moment, with no second list to maintain.

The page shows the estimated match count (~70% of the list) against Meta's
100-match Lookalike floor and warns when the seed is too thin. **If the
Lookalike will not build, use a broad Advantage+ audience instead** — do not
lower the floor by padding the list.

---

## Go-live runbook

Order matters — do not reorder.

### 1. Deploy

1. **Apply migrations 016 and 017 first.** Both are additive, but the code
   writes the 016 columns, so they must exist before the deploy that writes
   them. 017 is the campaign reporting view and depends on 016.
2. Deploy frontend + serverless.
3. Confirm a new booking row gets `fbclid` / `utm_*` / `fbp` / `fbc` populated
   (when the visit carried them) and `meta_schedule_sent_at` stamped on confirm.
   Fastest check: load `/book?utm_source=meta&utm_medium=paid&utm_campaign=TEST&utm_content=TEST_AD&fbclid=TEST123`,
   book, then confirm `utm_content = 'TEST_AD'` on the row and the booking
   appears under **/admin/ads → Bookings by ad**.

### 2. Events Manager

Complete every item in **Manual steps in Events Manager** above — automatic
event detection off, Automatic Advanced Matching off, `Schedule` as the
optimization event, and `Schedule` prioritized in the AEM list.

### 3. Validate before any spend

Set `META_TEST_EVENT_CODE` in the Vercel **preview** environment (not
production) to the code from Events Manager → Test Events, then run **one real
end-to-end booking** against the preview deploy and confirm:

- The funnel fires once each: `ViewContent` (/book) → `InitiateCheckout` →
  `AddPaymentInfo` → `Schedule`.
- **Dedupe:** browser + server `Schedule` collapse to ONE event in the Events
  Manager overlap/deduplication view. Two rows means the `event_id`s diverged —
  fix before spending anything.
- **EMQ** on `Schedule` shows email, `fbp`/`fbc`, IP, UA, and `external_id`.
- **The 3DS path** produces a server-side `AddPaymentInfo` (the browser event is
  unreachable there).
- Load the preview with `?fbclid=TEST123` before booking and confirm `fbc`
  lands on the resulting `Schedule`.

Then **unset `META_TEST_EVENT_CODE`.**

### 4. Reconcile — daily for the first two weeks, then weekly

- `/admin/ads` → Tracking health shows **0 Missing** for new bookings.
- Three numbers converge: booking-system bookings = Meta's `Schedule` count =
  rows with `attributed_source` populated.
- Spot-check that `mc_bookings.attributed_source` is picking up UTMs, so
  first-party attribution exists independently of Meta.

See **Weekly reconciliation** below for how to read those numbers.

### 5. Only then, turn spend on

Point the ad set at `Schedule`. If `Schedule` volume is too thin to exit the
learning phase, optimize on `InitiateCheckout` first and migrate to `Schedule`
once volume supports it.

---

## The failure mode to watch

**The risk has flipped from under-counting to double-counting.** The browser
`Schedule` used to lose its race with the webhook and silently never fire; now
it fires reliably, so both halves of every pair are live and dedupe is what
stands between us and inflated numbers.

If reconciliation reads clean (0 Missing) but the optimizer's conversion count
looks high, **check `event_id` parity first** — `src/lib/meta/event-ids.ts` and
the Events Manager deduplication view. That failure is invisible in our own
reconciliation, because our side genuinely is healthy; only Meta sees the
double. It is the single most likely cause of a "too good" number.

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
- Phone numbers are never sent to Meta at all, hashed or otherwise (10DLC —
  see the advanced-matching section above).
- There is **no cookie-consent gate** on this site (a US-only local business, no
  GDPR/UK obligation). If one is ever added, `MetaPixel` and
  `captureAttribution()` must be gated behind consent before firing.
