// /admin/bookings/[id] — booking detail page.
// Server component that fetches the booking + racers + charges and renders
// the full picture: customer info, session details, consent snapshot,
// per-racer status, charge history, and the no-show action dialog.
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  BookingStatusBadge,
  ChargeStatusBadge,
  PaymentMethodBadge,
} from '../../../StatusBadge'
import NoShowDialog from './NoShowDialog'
import ChargeRetryButton from './ChargeRetryButton'

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function formatTime(t: string): string {
  const [hStr, mStr] = t.split(':')
  let h = parseInt(hStr, 10)
  const period = h >= 12 ? 'PM' : 'AM'
  if (h === 0) h = 12
  else if (h > 12) h -= 12
  return `${h}:${mStr} ${period}`
}

function formatDate(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AdminAuthError) redirect('/admin/login')
    throw err
  }

  const { id } = await params
  const supabase = createAdminClient()

  // Fetch booking + customer
  const { data: booking } = await supabase
    .from('bookings')
    .select(
      `
      *,
      customer:customers(id, first_name, last_name, email, phone, stripe_customer_id),
      racers:booking_racers(id, slot, name, email, phone, showed_up, waiver_signed_at, friend_email_sent_at)
    `
    )
    .eq('id', id)
    .maybeSingle()

  if (!booking) {
    notFound()
  }

  // Fetch charge history
  const { data: charges } = await supabase
    .from('stripe_charges')
    .select('*')
    .eq('booking_id', id)
    .order('created_at', { ascending: false })

  // Normalize Supabase's array-or-single quirk
  const customer = Array.isArray(booking.customer)
    ? (booking.customer[0] ?? null)
    : booking.customer
  const racers = (booking.racers ?? []).sort(
    (a: { slot: number }, b: { slot: number }) => a.slot - b.slot
  )

  const hasCardOnFile = Boolean(booking.stripe_payment_method_id)
  const customerName = customer
    ? `${customer.first_name} ${customer.last_name}`
    : '(no customer record)'

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link
            href="/admin/bookings"
            className="telemetry-text text-xs text-pit-gray hover:text-grid-white"
          >
            ← Back to bookings
          </Link>
          <h1 className="racing-headline text-3xl text-grid-white mt-2">
            {booking.id}
          </h1>
          <p className="telemetry-text text-sm text-pit-gray mt-1">
            {formatDate(booking.session_date)} • {formatTime(booking.start_time)}–
            {formatTime(booking.end_time)} • {booking.duration_hours}h •{' '}
            {booking.racer_count} racer{booking.racer_count > 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <BookingStatusBadge status={booking.status} />
        </div>
      </div>

      {/* No-show action — only show for confirmed bookings */}
      {booking.status === 'confirmed' && (
        <NoShowDialog
          bookingId={booking.id}
          racers={racers.map(
            (r: {
              slot: number
              name: string
              showed_up: boolean | null
            }) => ({
              slot: r.slot,
              name: r.name,
              showedUp: r.showed_up,
            })
          )}
          noShowFeePerSeatCents={2000}
          hasCardOnFile={hasCardOnFile}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Customer + Racers */}
        <div className="lg:col-span-2 space-y-6">
          {/* Customer card */}
          <div className="bg-asphalt-dark border border-white/5 p-6">
            <h2 className="racing-headline text-lg text-grid-white mb-4">
              Customer
            </h2>
            {customer ? (
              <div className="space-y-1">
                <Link
                  href={`/admin/customers/${customer.id}`}
                  className="telemetry-text text-grid-white hover:text-apex-red"
                >
                  {customerName}
                </Link>
                <p className="telemetry-text text-sm text-pit-gray">{customer.email}</p>
                {customer.phone && (
                  <p className="telemetry-text text-sm text-pit-gray">{customer.phone}</p>
                )}
                {customer.stripe_customer_id && (
                  <p className="telemetry-text text-xs text-pit-gray mt-3">
                    Stripe ID: <code className="text-telemetry-cyan">{customer.stripe_customer_id}</code>
                  </p>
                )}
              </div>
            ) : (
              <p className="telemetry-text text-pit-gray">No customer record linked</p>
            )}
          </div>

          {/* Racers */}
          <div className="bg-asphalt-dark border border-white/5 p-6">
            <h2 className="racing-headline text-lg text-grid-white mb-4">
              Racers <span className="text-pit-gray">({racers.length})</span>
            </h2>
            <div className="space-y-3">
              {racers.map(
                (r: {
                  id: string
                  slot: number
                  name: string
                  email: string | null
                  phone: string | null
                  showed_up: boolean | null
                  waiver_signed_at: string | null
                  friend_email_sent_at: string | null
                }) => (
                  <div
                    key={r.id}
                    className="flex items-start gap-3 pb-3 border-b border-white/5 last:border-b-0 last:pb-0"
                  >
                    <span className="w-8 h-8 flex items-center justify-center bg-telemetry-cyan/20 text-telemetry-cyan racing-headline shrink-0">
                      {r.slot}
                    </span>
                    <div className="flex-1">
                      <p className="telemetry-text text-grid-white">{r.name}</p>
                      {r.email && (
                        <p className="telemetry-text text-xs text-pit-gray">{r.email}</p>
                      )}
                      {r.phone && (
                        <p className="telemetry-text text-xs text-pit-gray">{r.phone}</p>
                      )}
                      <div className="flex gap-2 mt-2">
                        {r.showed_up === true && (
                          <span className="telemetry-text text-xs px-2 py-0.5 bg-green-500/15 text-green-400 border border-green-500/30 uppercase">
                            ✓ Showed
                          </span>
                        )}
                        {r.showed_up === false && (
                          <span className="telemetry-text text-xs px-2 py-0.5 bg-apex-red/15 text-apex-red border border-apex-red/30 uppercase">
                            No-show
                          </span>
                        )}
                        {r.waiver_signed_at && (
                          <span className="telemetry-text text-xs px-2 py-0.5 bg-telemetry-cyan/15 text-telemetry-cyan border border-telemetry-cyan/30 uppercase">
                            Waiver signed
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>
          </div>

          {/* Charges */}
          <div className="bg-asphalt-dark border border-white/5 p-6">
            <h2 className="racing-headline text-lg text-grid-white mb-4">
              Charge History <span className="text-pit-gray">({charges?.length ?? 0})</span>
            </h2>
            {!charges || charges.length === 0 ? (
              <p className="telemetry-text text-sm text-pit-gray">No charges yet.</p>
            ) : (
              <div className="space-y-3">
                {charges.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-start gap-3 pb-3 border-b border-white/5 last:border-b-0 last:pb-0"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="racing-headline text-lg text-grid-white">
                          {formatDollars(c.amount_cents)}
                        </span>
                        <ChargeStatusBadge status={c.status} />
                        <PaymentMethodBadge method={c.payment_method_type} />
                      </div>
                      <p className="telemetry-text text-sm text-pit-gray mt-1">{c.reason}</p>
                      <p className="telemetry-text text-xs text-pit-gray mt-1">
                        {formatDateTime(c.created_at)} •{' '}
                        <code className="text-telemetry-cyan">{c.stripe_payment_intent_id}</code>
                      </p>
                      {c.status === 'failed' && (
                        <p className="telemetry-text text-xs text-apex-red mt-1">
                          {c.decline_code ? `[${c.decline_code}] ` : ''}
                          {c.failure_message ?? 'Unknown failure'}
                        </p>
                      )}
                    </div>
                    {c.status === 'failed' && hasCardOnFile && (
                      <ChargeRetryButton bookingId={booking.id} chargeId={c.id} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Money + Consent */}
        <div className="space-y-6">
          {/* Pricing */}
          <div className="bg-asphalt-dark border border-white/5 p-6">
            <h2 className="racing-headline text-lg text-grid-white mb-4">Pricing</h2>
            <div className="space-y-2">
              <div className="flex justify-between telemetry-text text-sm">
                <span className="text-pit-gray">Session price</span>
                <span className="text-grid-white">
                  {formatDollars(booking.session_price_cents)}
                </span>
              </div>
              <div className="flex justify-between telemetry-text text-sm">
                <span className="text-pit-gray">No-show fee</span>
                <span className="text-apex-red">
                  {formatDollars(booking.no_show_fee_cents)}
                </span>
              </div>
              <div className="border-t border-white/10 pt-2 mt-2">
                <div className="flex justify-between telemetry-text text-xs">
                  <span className="text-pit-gray">Card on file</span>
                  <span className={hasCardOnFile ? 'text-green-400' : 'text-amber-400'}>
                    {hasCardOnFile ? '✓ Saved' : '⚠ Not saved'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Source */}
          <div className="bg-asphalt-dark border border-white/5 p-6">
            <h2 className="racing-headline text-lg text-grid-white mb-4">Source</h2>
            <p className="telemetry-text text-sm text-grid-white capitalize">
              {booking.source}
            </p>
            <p className="telemetry-text text-xs text-pit-gray mt-1">
              Created {formatDateTime(booking.created_at)}
            </p>
          </div>

          {/* Consent snapshot — chargeback defense */}
          <div className="bg-asphalt-dark border border-telemetry-cyan/30 p-6">
            <h2 className="racing-headline text-lg text-grid-white mb-2">
              Consent <span className="text-telemetry-cyan">Snapshot</span>
            </h2>
            <p className="telemetry-text text-xs text-pit-gray mb-3">
              Exactly what the customer agreed to at booking. Use this if a charge is disputed.
            </p>
            <p className="telemetry-text text-xs text-grid-white bg-asphalt p-3 border border-white/5 whitespace-pre-wrap">
              {booking.consent_text}
            </p>
            <div className="mt-3 space-y-1 telemetry-text text-xs text-pit-gray">
              <p>Agreed: {formatDateTime(booking.consent_timestamp)}</p>
              {booking.consent_ip && <p>IP: {booking.consent_ip}</p>}
              {booking.consent_user_agent && (
                <p className="truncate" title={booking.consent_user_agent}>
                  UA: {booking.consent_user_agent}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Admin notes */}
      {booking.notes && (
        <div className="bg-asphalt-dark border border-white/5 p-6">
          <h2 className="racing-headline text-lg text-grid-white mb-2">Notes</h2>
          <p className="telemetry-text text-sm text-pit-gray whitespace-pre-wrap">
            {booking.notes}
          </p>
        </div>
      )}
    </div>
  )
}
