// POST /api/checkin
// Public endpoint backing the check-in / liability-waiver kiosk. Supabase is
// the source of truth (this replaced the old Google Apps Script).
//
// Two usage modes:
//   (a) Walk-in kiosk: a racer fills out the waiver at the venue.
//   (b) Linked booking: a specific racer slot on an existing booking completes
//       their waiver remotely (?bookingId=&slot= passed through from the page).
//
// Behavior:
//   1. Find-or-create the customer by email (case-insensitive). Blank email
//      (walk-in without one) always creates a new customer — can't dedup.
//   2. Stamp the customer's waiver_signed_at = now() and waiver_form_data.
//   3. If bookingId + slot were given, also stamp the matching booking_racers
//      row's waiver_signed_at + waiver_form_data.
//
// Service-role client, no auth gate — same public trust model as
// /api/booking/create. We validate input but anyone can submit a check-in.
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/supabase/types'

interface CheckinBody {
  firstName?: string
  lastName?: string
  birthday?: string
  phone?: string
  email?: string
  howDidYouHear?: string
  marketingOptIn?: boolean
  agreedToWaiver?: boolean
  bookingId?: string
  slot?: string | number
}

function badRequest(message: string) {
  return NextResponse.json({ success: false, error: message }, { status: 400 })
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CheckinBody

    const firstName = body.firstName?.trim() ?? ''
    const lastName = body.lastName?.trim() ?? ''
    const birthday = body.birthday?.trim() ?? ''
    const phone = body.phone?.trim() ?? ''
    const email = body.email?.trim() ?? ''
    const emailLower = email.toLowerCase()
    const howHeard = body.howDidYouHear?.trim() ?? ''
    const marketingOptIn = body.marketingOptIn === true
    const bookingId = body.bookingId?.trim() ?? ''
    const slotRaw = body.slot
    const slot =
      slotRaw === undefined || slotRaw === null || slotRaw === ''
        ? null
        : Number(slotRaw)
    const isLinkedBooking = bookingId !== '' && slot !== null && !Number.isNaN(slot)

    // ---- Validation ---------------------------------------------------------
    if (!firstName) return badRequest('First name is required.')
    if (!lastName) return badRequest('Last name is required.')
    if (body.agreedToWaiver !== true) {
      return badRequest('You must accept the waiver to check in.')
    }

    const supabase = createAdminClient()
    const now = new Date().toISOString()

    // The signed waiver snapshot stored on the customer (and racer) row.
    const waiverFormData: Json = {
      firstName,
      lastName,
      birthday: birthday || null,
      phone: phone || null,
      email: email || null,
      howDidYouHear: howHeard || null,
      marketingOptIn,
      agreedToWaiver: true,
      signedAt: now,
      ...(isLinkedBooking ? { bookingId, slot } : {}),
    }

    // ---- Find-or-create the customer ---------------------------------------
    let customerId: string | null = null
    let isReturning = false

    // Only dedup when we actually have an email to match on.
    if (emailLower) {
      const { data: existing } = await supabase
        .from('customers')
        .select('id, first_name, last_name, birthday, phone, how_heard')
        .ilike('email', emailLower)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (existing) {
        isReturning = true
        customerId = existing.id

        // Fill/refresh only — never wipe existing data with blanks. Marketing
        // opt-in is sticky: turn it on if they opted in, never auto-off here.
        const update: {
          first_name?: string
          last_name?: string
          birthday?: string
          phone?: string
          how_heard?: string
          marketing_opt_in?: boolean
          waiver_signed_at: string
          waiver_form_data: Json
        } = {
          waiver_signed_at: now,
          waiver_form_data: waiverFormData,
        }
        if (firstName) update.first_name = firstName
        if (lastName) update.last_name = lastName
        if (birthday) update.birthday = birthday
        if (phone) update.phone = phone
        if (howHeard) update.how_heard = howHeard
        if (marketingOptIn) update.marketing_opt_in = true

        const { error: updateError } = await supabase
          .from('customers')
          .update(update)
          .eq('id', existing.id)

        if (updateError) {
          console.error('Check-in: failed to update customer:', updateError)
          return NextResponse.json(
            { success: false, error: 'Could not save your check-in. Please try again.' },
            { status: 500 }
          )
        }
      }
    }

    // No existing match (or no email) → create a fresh customer.
    if (!customerId) {
      const { data: created, error: insertError } = await supabase
        .from('customers')
        .insert({
          first_name: firstName,
          last_name: lastName,
          email: email || null,
          phone: phone || null,
          birthday: birthday || null,
          how_heard: howHeard || null,
          marketing_opt_in: marketingOptIn,
          source: isLinkedBooking ? 'checkin' : 'walk_in',
          waiver_signed_at: now,
          waiver_form_data: waiverFormData,
        })
        .select('id')
        .single()

      if (insertError || !created) {
        console.error('Check-in: failed to create customer:', insertError)
        return NextResponse.json(
          { success: false, error: 'Could not save your check-in. Please try again.' },
          { status: 500 }
        )
      }
      customerId = created.id
    }

    // ---- Linked booking: stamp the racer slot's waiver ----------------------
    if (isLinkedBooking) {
      const { error: racerError } = await supabase
        .from('booking_racers')
        .update({
          waiver_signed_at: now,
          waiver_form_data: waiverFormData,
        })
        .eq('booking_id', bookingId)
        .eq('slot', slot)

      // Don't fail the whole check-in if the slot can't be matched — the
      // customer's waiver is already saved. Log it for follow-up.
      if (racerError) {
        console.error('Check-in: failed to update booking racer waiver:', racerError)
      }
    }

    return NextResponse.json({
      success: true,
      customerId,
      isReturning,
      firstName,
    })
  } catch (error) {
    console.error('Check-in API error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
