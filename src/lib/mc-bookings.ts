// mc_bookings — the unified, all-channels booking ledger for reporting (Claude
// Cowork). Writing to it is ALWAYS best-effort and NEVER throws, so it can be
// added to the booking/payment path without any risk to it. Amounts are stored
// in DOLLARS here (the operational `bookings` table stays in integer cents).
import { createAdminClient } from './supabase/admin'
import { toAttributionSource } from './attribution'

export interface RecordMcBookingInput {
  channel: 'online' | 'phone' | 'in_person'
  bookingDatetime?: string | null // ISO timestamp of the session start
  racers?: number | null
  durationHours?: number | null
  // Provide EITHER cents (converted to dollars) or dollars directly.
  amountCents?: number | null
  amountDollars?: number | null
  depositCents?: number | null
  depositDollars?: number | null
  isMembership?: boolean
  // Links the row to a customer and backfills attributed_source from them when
  // attributedSource isn't given explicitly (per spec: don't guess if unlinked).
  customerId?: string | null
  attributedSource?: string | null
  notes?: string | null
}

export async function recordMcBooking(input: RecordMcBookingInput): Promise<void> {
  try {
    const supabase = createAdminClient()

    let attributed = input.attributedSource ?? null
    if (!attributed && input.customerId) {
      const { data: c } = await supabase
        .from('customers')
        .select('attributed_source')
        .eq('id', input.customerId)
        .maybeSingle()
      attributed = c?.attributed_source ?? null
    }

    const amount =
      input.amountDollars != null
        ? input.amountDollars
        : input.amountCents != null
          ? Math.round(input.amountCents) / 100
          : null
    const deposit =
      input.depositDollars != null
        ? input.depositDollars
        : input.depositCents != null
          ? Math.round(input.depositCents) / 100
          : null

    await supabase.from('mc_bookings').insert({
      channel: input.channel,
      booking_datetime: input.bookingDatetime ?? null,
      racers: input.racers ?? null,
      duration_hours: input.durationHours ?? null,
      amount,
      deposit_paid: deposit,
      is_membership: input.isMembership ?? false,
      customer_ref: input.customerId ?? null,
      // Normalize to the canonical set so the CHECK constraint can never reject
      // (and thus never drop) a reporting row.
      attributed_source: toAttributionSource(attributed),
      notes: input.notes ?? null,
    })
  } catch (err) {
    // Reporting is best-effort — it must NEVER affect the booking/payment flow.
    console.error('recordMcBooking failed (non-fatal):', err)
  }
}
