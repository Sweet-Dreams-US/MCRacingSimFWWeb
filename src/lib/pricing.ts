// Pricing configuration for MC Racing Sim
// Weekday: Tuesday-Thursday
// Weekend: Friday-Sunday
// Monday: Closed

type Duration = 1 | 2 | 3
type RacerCount = 1 | 2 | 3

const WEEKDAY_PRICES: Record<RacerCount, Record<Duration, number>> = {
  1: { 1: 45, 2: 85, 3: 115 },
  2: { 1: 90, 2: 160, 3: 220 },
  3: { 1: 130, 2: 245, 3: 340 },
}

const WEEKEND_PRICES: Record<RacerCount, Record<Duration, number>> = {
  1: { 1: 50, 2: 95, 3: 135 },
  2: { 1: 100, 2: 180, 3: 250 },
  3: { 1: 140, 2: 275, 3: 365 },
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

export function calculatePrice(
  date: Date | string,
  duration: Duration,
  racerCount: RacerCount
): { price: number; isWeekend: boolean } {
  const weekend = isWeekend(date)
  const priceMatrix = weekend ? WEEKEND_PRICES : WEEKDAY_PRICES
  const price = priceMatrix[racerCount][duration]

  return { price, isWeekend: weekend }
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

export function calculateNoShowFeeCents(racerCount: RacerCount): number {
  return racerCount * NO_SHOW_FEE_CENTS_PER_SEAT
}

export function formatNoShowFee(racerCount: RacerCount): string {
  const cents = calculateNoShowFeeCents(racerCount)
  return `$${(cents / 100).toFixed(0)}`
}
