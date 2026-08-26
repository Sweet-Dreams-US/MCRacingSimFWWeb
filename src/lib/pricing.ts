// Pricing configuration for MC Racing Sim
// Weekday: Tuesday-Thursday
// Weekend: Friday-Sunday
// Monday: Closed

/** Hours on the matrix. Half-hours in between are priced by interpolation. */
type MatrixHours = 1 | 2 | 3
/** Session length in hours — any half-hour step from 1 to 3. */
export type Duration = number
/** Racers on the matrix — one per sim. Beyond this, see EXTRA_RACER_RATE. */
type SeatedRacers = 1 | 2 | 3

/** The common session lengths, shown as tiles/chips. Longer is still bookable. */
export const DURATION_OPTIONS: readonly number[] = [1, 1.5, 2, 2.5, 3]

/** Longest bookable session — the venue's whole day (noon to 2am close). */
export const MAX_DURATION_HOURS = 14

/**
 * Hours past the 3-hour matrix are billed per SIM SEAT, per hour. Racers beyond
 * the sims keep their cheaper EXTRA_RACER_RATE_PER_HOUR for the whole session —
 * they're sharing a rig, not occupying a fourth one.
 */
export const LONG_SESSION_RATE_PER_SEAT_HOUR = 30

/** Every bookable length in half-hour steps, for admin dropdowns. */
export function allDurationOptions(): number[] {
  const out: number[] = []
  for (let h = 1; h <= MAX_DURATION_HOURS; h += 0.5) out.push(h)
  return out
}

/** A bookable length: 1 hour up to a full day, on a half-hour step. */
export function isValidDuration(hours: number): boolean {
  return (
    Number.isFinite(hours) &&
    hours >= 1 &&
    hours <= MAX_DURATION_HOURS &&
    Number.isInteger(hours * 2) // half-hour steps only
  )
}

/** "1 hour" / "1.5 hours" / "2 hours" — one label rule for every surface. */
export function formatDuration(hours: number): string {
  const n = Number(hours)
  const text = Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '')
  return `${text} hour${n === 1 ? '' : 's'}`
}
/** Any racer count on a booking. 1–3 fill the sims; extras rotate through them. */
export type RacerCount = number

/**
 * The venue has 3 sims, so the price matrix tops out at 3 racers. A bigger group
 * still books the same 3 rigs and takes turns, so each racer beyond the third is
 * a flat add-on per hour rather than a full seat price.
 *
 * Must match SIM_COUNT / EXTRA_RACER_RATE in android-pos/.../ui/Pricing.kt.
 */
export const SIM_COUNT = 3
export const EXTRA_RACER_RATE_PER_HOUR = 10 // dollars, per racer past the 3rd

/**
 * Group size that gets a "did you mean that?" confirm before it's booked.
 * There's no hard cap, so this is the guard against a fat-fingered 50 — which
 * would quietly hold the whole venue and quote a four-figure session.
 */
export const LARGE_GROUP_RACERS = 10

const WEEKDAY_PRICES: Record<SeatedRacers, Record<MatrixHours, number>> = {
  1: { 1: 45, 2: 85, 3: 115 },
  2: { 1: 90, 2: 160, 3: 220 },
  3: { 1: 130, 2: 245, 3: 340 },
}

const WEEKEND_PRICES: Record<SeatedRacers, Record<MatrixHours, number>> = {
  1: { 1: 50, 2: 95, 3: 135 },
  2: { 1: 100, 2: 180, 3: 250 },
  3: { 1: 140, 2: 275, 3: 365 },
}

/** Racers charged the flat hourly add-on (everyone past the 3rd). */
export function extraRacers(racerCount: RacerCount): number {
  return Math.max(0, Math.floor(racerCount) - SIM_COUNT)
}

/** Dollar add-on for the extra racers over the whole session. */
export function extraRacerChargeDollars(
  racerCount: RacerCount,
  duration: Duration
): number {
  return extraRacers(racerCount) * EXTRA_RACER_RATE_PER_HOUR * duration
}

export function isWeekend(date: Date | string): boolean {
  const d = typeof date === 'string' ? new Date(date + 'T12:00:00') : date
  const day = d.getDay()
  // Friday = 5, Saturday = 6, Sunday = 0
  return day === 0 || day === 5 || day === 6
}

export function isMonday(date: Date | string): boolean {
  const d = typeof date === 'string' ? new Date(date + 'T12:00:00') : date
  return d.getDay() === 1
}

/**
 * Matrix price for a seated racer count at any half-hour length. The matrix
 * only lists whole hours, so a half-hour lands exactly between its neighbours
 * (e.g. 1.5h = midway between the 1h and 2h price).
 */
function matrixPrice(
  matrix: Record<SeatedRacers, Record<MatrixHours, number>>,
  seated: SeatedRacers,
  hours: number
): number {
  const clamped = Math.min(Math.max(hours, 1), 3)
  const whole = Math.floor(clamped) as MatrixHours
  const hasHalf = clamped - whole >= 0.5

  // A trailing half hour bills at HALF THE ONE-HOUR RATE, on top of the whole
  // hours. It deliberately does NOT interpolate toward the next tier: the 2h
  // and 3h prices carry a bulk discount, and interpolating handed a 1.5h
  // session part of the 2-hour discount it hasn't earned.
  //   weekend 3 racers: 1h $140 -> 1.5h = 140 + 70 = $210  (interpolation gave $207.50)
  const within = matrix[seated][whole] + (hasHalf ? matrix[seated][1] / 2 : 0)

  // Past 3 hours the matrix runs out, so every further hour bills at the flat
  // per-seat long-session rate.
  const longHours = Math.max(0, hours - 3)
  return within + longHours * LONG_SESSION_RATE_PER_SEAT_HOUR * seated
}

export function calculatePrice(
  date: Date | string,
  duration: Duration,
  racerCount: RacerCount
): { price: number; isWeekend: boolean } {
  const weekend = isWeekend(date)
  const priceMatrix = weekend ? WEEKEND_PRICES : WEEKDAY_PRICES

  // Up to 3 racers price straight off the matrix. Past that the group is still
  // on the same 3 sims (taking turns), so each additional racer is the flat
  // hourly add-on on top of the full 3-racer rate.
  const seated = Math.min(Math.max(Math.floor(racerCount), 1), SIM_COUNT) as SeatedRacers
  const price =
    matrixPrice(priceMatrix, seated, duration) +
    extraRacerChargeDollars(racerCount, duration)

  // Half-hours can land on a half-dollar (e.g. $187.50); round to the cent so
  // no float dust reaches the charge.
  return { price: Math.round(price * 100) / 100, isWeekend: weekend }
}

export function getDayType(date: Date | string): 'weekday' | 'weekend' | 'closed' {
  if (isMonday(date)) return 'closed'
  return isWeekend(date) ? 'weekend' : 'weekday'
}

export function formatPrice(price: number): string {
  return `$${price}`
}

// Get all time slots for operating hours (noon to 2am)
export function getTimeSlots(): string[] {
  const slots: string[] = []

  // From noon (12:00) to 11:30 PM
  for (let hour = 12; hour <= 23; hour++) {
    const period = hour >= 12 ? 'PM' : 'AM'
    const displayHour = hour % 12 || 12
    slots.push(`${displayHour}:00 ${period}`)
    slots.push(`${displayHour}:30 ${period}`)
  }

  // From 12:00 AM to 1:30 AM (closing is 2am)
  slots.push('12:00 AM')
  slots.push('12:30 AM')
  slots.push('1:00 AM')
  slots.push('1:30 AM')

  return slots
}

export function formatTime(time: string): string {
  return time
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00')
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export function formatDateLong(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00')
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

// ============================================================================
// No-show fee
// ============================================================================
// Per spec (June 23, 2026): flat $20 per seat booked, charged to card on file
// if the customer no-shows. Stored on the booking at creation time so we can't
// retroactively change what they consented to.

export const NO_SHOW_FEE_CENTS_PER_SEAT = 2000 // $20.00

/**
 * Charged per SIM SEAT held, not per racer — a no-show only ever costs the
 * venue the 3 rigs, so a 5-racer group's fee caps at 3 × $20 = $60.
 */
export function calculateNoShowFeeCents(racerCount: RacerCount): number {
  const seatsHeld = Math.min(Math.max(Math.floor(racerCount), 1), SIM_COUNT)
  return seatsHeld * NO_SHOW_FEE_CENTS_PER_SEAT
}

export function formatNoShowFee(racerCount: RacerCount): string {
  const cents = calculateNoShowFeeCents(racerCount)
  return `$${(cents / 100).toFixed(0)}`
}
