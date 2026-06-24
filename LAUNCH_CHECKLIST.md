# MC Racing Sim FW — Launch Checklist

Everything required to take the `admin-panel-stripe-supabase` branch from
"merged code" to "live, accepting bookings, charging no-shows, and writing
to Mark's Google Calendar."

Work top-to-bottom. Items marked **[DONE]** are already complete.

---

## 1. [DONE] Supabase project + schema

- Project: `mc-racing-sim-fw` (id `gniqzosrrnlrczmeeryd`) on `us-east-2`
- Schema: 12 tables + RLS deny-by-default + `receipts` storage bucket
- Generated TypeScript types committed to `src/lib/supabase/types.ts`

Verify any time with:
```bash
npx tsx scripts/verify-payouts.ts
```

---

## 2. Vercel environment variables

Set scope to **Production** for all of these in the `mc-racing-sim-fw-web`
Vercel project → Settings → Environment Variables.

### Required for booking + admin to work

| Key                                    | Where to find the value                                                       |
| -------------------------------------- | ----------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | `https://gniqzosrrnlrczmeeryd.supabase.co`                                    |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase Dashboard → Settings → API → "Publishable key" (starts with `sb_publishable_`) |
| `SUPABASE_SECRET_KEY`                  | Supabase Dashboard → Settings → API → "Secret key" (starts with `sb_secret_`). Rotate after launch. |
| `STRIPE_SECRET_KEY`                    | Stripe Dashboard → Developers → API keys → restricted key (starts with `rk_live_`). NOT the standard `sk_live_…` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`   | Stripe Dashboard → Developers → API keys → "Publishable key" (starts with `pk_live_`) |
| `STRIPE_WEBHOOK_SECRET`                | Created in step 4 below (starts with `whsec_`)                                |
| `NEXT_PUBLIC_URL`                      | `https://mcracingfortwayne.com`                                               |

### Optional (for emails + calendar)

| Key                                  | Value                                                                   | When         |
| ------------------------------------ | ----------------------------------------------------------------------- | ------------ |
| `RESEND_API_KEY`                     | `re_…`                                                                  | After Resend domain verified |
| `RESEND_FROM_EMAIL`                  | `bookings@mcracingfortwayne.com` (or whichever subdomain)               | After Resend domain verified |
| `OWNER_NOTIFICATION_EMAIL`           | `mcracingfortwayne@gmail.com`                                           | Now          |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL`       | `xxx@xxx.iam.gserviceaccount.com`                                       | After step 5 |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | `-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----\n` (with literal `\n`s) | After step 5 |
| `GOOGLE_CALENDAR_ID`                 | `mcracingfortwayne@gmail.com`                                           | Now          |

> **Note on `STRIPE_WEBHOOK_SECRET`**: leave blank until step 4. The webhook
> endpoint route will return a 500 error until this is set, but the rest of
> the app works fine — webhook calls just won't be processed.

> **Note on Google private key**: when you paste it into Vercel, the literal
> `\n` characters in the PEM key will stay as `\n` (not actual newlines).
> Our code calls `.replace(/\\n/g, '\n')` at runtime to fix that. You don't
> need to do anything special when pasting.

---

## 3. Promote the branch to production

After env vars are set, the next deploy needs to come from
`admin-panel-stripe-supabase`. Two options:

### Option A: Merge to main (recommended once you've smoke-tested)
```bash
git checkout main
git merge admin-panel-stripe-supabase
git push origin main
```
Vercel auto-deploys main → production.

### Option B: Promote a preview deployment to production
1. Push triggers a preview deploy of `admin-panel-stripe-supabase`
2. Open the preview URL, smoke-test the booking flow + admin panel
3. Vercel → Deployments → ⋯ on the preview → **Promote to Production**

Either way, production lives at the same custom domain
(`mcracingfortwayne.com`).

---

## 4. Register the Stripe webhook

Once production has the new code deployed:

1. Open **Stripe Dashboard → Developers → Webhooks → Add endpoint**
2. **Endpoint URL**: `https://mcracingfortwayne.com/api/stripe/webhook`
3. **Description**: "MC Racing — booking + no-show events"
4. **Events to send** (select these exact 5):
   - `setup_intent.succeeded` ← **critical** — attaches card to booking
   - `setup_intent.setup_failed`
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `charge.dispute.created`
5. Save → reveal the **Signing secret** (starts with `whsec_`)
6. Add to Vercel as `STRIPE_WEBHOOK_SECRET` (Production scope)
7. **Redeploy** so the function picks up the new env var
   (Vercel → Deployments → most recent → ⋯ → Redeploy)

Test it: Stripe Dashboard → Developers → Webhooks → click your endpoint →
**Send test webhook** → pick `setup_intent.succeeded` → send. Confirm a row
appears in Supabase `stripe_webhook_events` with `processed_at` set.

---

## 5. Google Calendar service account (optional but recommended)

See `SETUP_GOOGLE_CALENDAR.md` in the repo root for the full 6-step guide.
Quick version:

1. Google Cloud Console → create project → enable Calendar API
2. IAM & Admin → Service Accounts → create → download JSON key
3. Open mcracingfortwayne@gmail.com calendar → Settings → Share with people
   → add the service account email → "Make changes to events"
4. Add the three Google env vars to Vercel
5. Redeploy → next booking creates a calendar event automatically

---

## 6. Resend email (optional — Mark working on domain verification)

Once Mark verifies the bookings@ subdomain on Resend:

1. Resend Dashboard → API Keys → create one → copy
2. Add to Vercel: `RESEND_API_KEY` + `RESEND_FROM_EMAIL`
3. Redeploy
4. Next booking will send: confirmation to customer + FYI to any additional
   racers with emails + internal notification to mcracingfortwayne@gmail.com

Until then: `lib/email.ts` gracefully no-ops (writes an `email_log` row
with status=`skipped`). The booking flow keeps working with zero email
errors.

---

## 7. First admin user — Mark's login

After production deploy is live:

1. Mark goes to `https://mcracingfortwayne.com/admin/login`
2. Enters his email (probably `mcracingfortwayne@gmail.com`)
3. Clicks magic link in his inbox
4. The auth callback redirects him to `/admin` — which will show
   "This account has no admin access" because there's no `admin_users` row yet
5. **Insert his admin_users row** — Cole, run this SQL in Supabase
   Dashboard → SQL Editor (replace the email):

```sql
INSERT INTO admin_users (auth_user_id, email, full_name, role, active)
SELECT id, email, 'Mark Camargo', 'owner', true
FROM auth.users
WHERE email = 'mcracingfortwayne@gmail.com';
```

6. Mark refreshes `/admin` → he's in.

Repeat for Cole (Sweet Dreams role) and any staff (Pit Crew role).

---

## 8. Security cleanup (do these the day after launch)

- **Rotate `sk_live_…`** in Stripe Dashboard → Developers → API keys →
  click the rotate icon on the standard secret key (we only use
  `rk_live_…` in app code, so rolling `sk_live_…` won't break anything but
  invalidates the chat-pasted copy)
- **Rotate `sb_secret_…`** and **`service_role`** in Supabase Dashboard →
  Settings → API → click rotate on each. Add the new `sb_secret_…` to
  Vercel as `SUPABASE_SECRET_KEY` and redeploy
- **Delete the chat history with the keys** from your end (Claude / Anthropic
  can't delete it, but your local copies should go)

---

## 9. Smoke tests (post-launch)

Walk through each flow on the live site:

- [ ] Public booking flow — `/book` — fill form → "Continue to Payment" →
      Stripe Elements appears → card form submits → confirmation page loads
- [ ] Supabase: booking row + customer row + booking_racers rows created
- [ ] Supabase: `stripe_setup_intent_id` and (after webhook) `stripe_payment_method_id` populated
- [ ] Stripe: customer + saved payment method visible in Stripe Dashboard
- [ ] Admin login: magic link works, dashboard loads
- [ ] Admin bookings list shows the new booking
- [ ] Admin booking detail shows the consent snapshot
- [ ] Mark no-show on a test booking → off-session charge succeeds against your
      test card → stripe_charges row + transaction row both created
- [ ] Reports page shows the test charge in monthly P&L
- [ ] Marketing payout dashboard loads, recalculate works
- [ ] Google Calendar event created on mcracingfortwayne@gmail.com (if step 5 done)
- [ ] Confirmation email received (if step 6 done)

---

## 10. Day-2 todos (post-launch, no rush)

- [ ] Set up Resend webhook (delivery / bounce / complaint events) so
      `email_log.status` reflects real delivery state — TODO in
      `src/app/api/stripe/webhook/route.ts` header
- [ ] Build /admin/transactions/[id] detail page (currently links to a
      placeholder)
- [ ] Build /admin/cash drawer page (basic — track cash on hand)
- [ ] Set up Vercel Cron for session reminder email (day-before sweep)
- [ ] Set up monthly cron to auto-recalculate marketing payout on the 1st
      of each month
- [ ] Schema for membership system (Phase 2 of future work)
- [ ] Stripe Terminal integration for in-person sales (when the reader
      arrives) — separate phase, will need
      `STRIPE_TERMINAL_LOCATION_ID` env var
