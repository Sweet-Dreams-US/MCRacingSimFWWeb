// POST /api/booking/create
// Public endpoint used by the browser booking form. Creates a Supabase
// booking row, attaches/creates a Stripe Customer, generates a SetupIntent
// for off-session card-on-file usage, and returns the client_secret so the
// browser can mount Stripe Elements to collect the card.
//
// The card itself never touches our server — it goes browser → Stripe via
// the Elements iframe.
import { NextRequest, NextResponse } from 'next/server'
import { createBooking, type CreateBookingInput } from '@/lib/booking'
import { DiscountError } from '@/lib/discounts'

interface IncomingPayload {
  sessionDate?: string
  startTime?: string // "HH:MM" 24-hour
  duration?: string | number
  numberOfRacers?: number
  firstName?: string
  lastName?: string
  birthday?: string
  phone?: string
  email?: string
  howDidYouHear?: string
  marketingOptIn?: boolean
  consentText?: string
  consentTimestamp?: string
  discountCode?: string | null
  racer2?: { firstName: string; lastName: string; phone: string; email: string } | null
  racer3?: { firstName: string; lastName: string; phone: string; email: string } | null
}

function badRequest(message: string) {
  return NextResponse.json({ success: false, error: message }, { status: 400 })
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as IncomingPayload

    // ---- Validation: must-have fields ---------------------------------------
    if (!body.sessionDate) return badRequest('Missing sessionDate')
    if (!body.startTime) return badRequest('Missing startTime')
    if (!body.duration) return badRequest('Missing duration')
    if (!body.numberOfRacers) return badRequest('Missing numberOfRacers')
    if (!body.firstName) return badRequest('Missing firstName')
    if (!body.lastName) return badRequest('Missing lastName')
    if (!body.email) return badRequest('Missing email')
    if (!body.phone) return badRequest('Missing phone')
    if (!body.consentText) return badRequest('Missing consent text')
    if (!body.consentTimestamp) return badRequest('Missing consent timestamp')

    const durationHours = Number(body.duration)
    if (![1, 2, 3].includes(durationHours)) {
      return badRequest('duration must be 1, 2, or 3')
    }
    const racerCount = Number(body.numberOfRacers)
    if (![1, 2, 3].includes(racerCount)) {
      return badRequest('numberOfRacers must be 1, 2, or 3')
    }

    // ---- Collect additional racers (slots 2 + 3) ----------------------------
    const additionalRacers: CreateBookingInput['additionalRacers'] = []
    if (racerCount >= 2 && body.racer2) {
      additionalRacers.push({
        name: `${body.racer2.firstName} ${body.racer2.lastName}`.trim(),
        email: body.racer2.email || undefined,
        phone: body.racer2.phone || undefined,
      })
    }
    if (racerCount >= 3 && body.racer3) {
      additionalRacers.push({
        name: `${body.racer3.firstName} ${body.racer3.lastName}`.trim(),
        email: body.racer3.email || undefined,
        phone: body.racer3.phone || undefined,
      })
    }

    // ---- Capture chargeback-defense metadata --------------------------------
    // X-Forwarded-For is set by Vercel; trust only the first hop.
    const consentIp =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
    const consentUserAgent = request.headers.get('user-agent') ?? null

    // ---- Create the booking + Stripe SetupIntent ----------------------------
    const result = await createBooking({
      sessionDate: body.sessionDate,
      startTime: body.startTime,
      durationHours: durationHours as 1 | 2 | 3,
      racerCount: racerCount as 1 | 2 | 3,
      customer: {
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email,
        phone: body.phone,
        birthday: body.birthday ?? '',
        howHeard: body.howDidYouHear ?? '',
      },
      marketingOptIn: body.marketingOptIn ?? false,
      additionalRacers,
      consentText: body.consentText,
      consentTimestamp: body.consentTimestamp,
      consentIp,
      consentUserAgent,
      source: 'online',
      discountCode: body.discountCode ?? null,
    })

    return NextResponse.json({
      success: true,
      bookingId: result.bookingId,
      setupIntentClientSecret: result.setupIntentClientSecret,
      noShowFeeCents: result.noShowFeeCents,
      sessionPriceCents: result.sessionPriceCents,
      discountAmountCents: result.discountAmountCents,
      amountDueCents: result.amountDueCents,
      stripePublishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    })
  } catch (error) {
    // An invalid/expired discount code is a client-side problem — surface the
    // friendly reason with a 400 so the checkout can show it inline, rather
    // than a generic 500.
    if (error instanceof DiscountError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 })
    }
    console.error('Booking API error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
