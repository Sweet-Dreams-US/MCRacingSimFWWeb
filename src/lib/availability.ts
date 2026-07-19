// Availability blocks — pure time math shared by the server (booking
// enforcement) and the browser (greying out slots in the picker).
//
// The venue runs noon -> 2am, so a "session day" spills past midnight: a
// 1:00 AM slot belongs to the PREVIOUS calendar date's session. All overlap
// math therefore works in "extended minutes": times before noon are treated
// as the late-night tail and get +24h, so 1:00 AM = 25:00. That makes a
// block of 23:00 -> 01:00 a simple [23h, 25h) interval.
//
// This module must stay import-safe for client components: no supabase/admin,
// no Node-only APIs.

export interface AvailabilityBlockWindow {
  /** "HH:MM" 24-hour venue wall-clock, or null (with endTime null) = whole day. */
  startTime: string | null
  endTime: string | null
}

const OPEN_HOUR = 12 // venue opens at noon; anything earlier is late-night tail

/**
 * Convert "HH:MM" (or Postgres TIME "HH:MM:SS") to minutes on the extended
 * noon-to-2am axis: hours before noon belong to the same session date's
 * late-night tail and get +24h. "12:00" -> 720, "23:30" -> 1410, "01:00" -> 1500.
 */
export function toExtendedMinutes(time: string): number {
  const [h = 0, m = 0] = time.split(':').map(Number)
  const minutes = h * 60 + m
  return h < OPEN_HOUR ? minutes + 24 * 60 : minutes
}

/**
 * True when a session of `durationHours` starting at `startTime` overlaps any
 * of the given blocks. Whole-day blocks (null times) match everything.
 * Half-open interval semantics: a session may START exactly when a block ends,
 * and a block may start exactly when the session ends.
 */
export function isSlotBlocked(
  blocks: AvailabilityBlockWindow[],
  startTime: string,
  durationHours: number
): boolean {
  const slotStart = toExtendedMinutes(startTime)
  const slotEnd = slotStart + durationHours * 60
  return blocks.some((b) => {
    if (b.startTime == null || b.endTime == null) return true // whole day
    const blockStart = toExtendedMinutes(b.startTime)
    const blockEnd = toExtendedMinutes(b.endTime)
    return slotStart < blockEnd && blockStart < slotEnd
  })
}

/** True when any block in the list covers the whole day. */
export function isWholeDayBlocked(blocks: AvailabilityBlockWindow[]): boolean {
  return blocks.some((b) => b.startTime == null || b.endTime == null)
}

/** Half-open overlap of two extended-minute ranges: [aStart,aEnd) vs [bStart,bEnd). */
function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd
}

/**
 * True when two availability windows conflict. A null start/end means "whole
 * day", which conflicts with everything (including another whole-day window).
 * Used to forbid overlapping admin blocks.
 */
export function windowsConflict(a: AvailabilityBlockWindow, b: AvailabilityBlockWindow): boolean {
  if (a.startTime == null || a.endTime == null) return true // A is whole-day
  if (b.startTime == null || b.endTime == null) return true // B is whole-day
  return rangesOverlap(
    toExtendedMinutes(a.startTime),
    toExtendedMinutes(a.endTime),
    toExtendedMinutes(b.startTime),
    toExtendedMinutes(b.endTime)
  )
}

/**
 * True when a block window overlaps a booking's occupied time range. A
 * whole-day block covers every booking that day. Used to forbid a block that
 * would collide with a live booking.
 */
export function blockConflictsWithBooking(
  block: AvailabilityBlockWindow,
  booking: SeatBooking
): boolean {
  if (block.startTime == null || block.endTime == null) return true // whole day
  const bookStart = toExtendedMinutes(booking.startTime)
  const bookEnd = bookStart + booking.durationHours * 60
  return rangesOverlap(
    toExtendedMinutes(block.startTime),
    toExtendedMinutes(block.endTime),
    bookStart,
    bookEnd
  )
}

// ---------------------------------------------------------------------------
// Seat capacity — the venue has a fixed number of sim seats (rigs). A time slot
// is only "full" when the concurrent racers there would exceed capacity, so a
// 1-seat booking at 6pm still leaves the other seats open at 6pm.
// ---------------------------------------------------------------------------

/** Total concurrent sim seats. Overridable server-side via SEAT_CAPACITY. */
export const DEFAULT_SEAT_CAPACITY = 3

/** An existing booking that occupies seats over a time window. */
export interface SeatBooking {
  startTime: string // "HH:MM" / "HH:MM:SS"
  durationHours: number
  racerCount: number
}

/**
 * Peak number of concurrently-booked seats during [startTime, +durationHours).
 * Occupancy is piecewise-constant and only jumps up at an existing booking's
 * start, so the peak is found by sampling at the candidate start plus every
 * existing start that falls inside the window.
 */
export function maxConcurrentRacers(
  existing: SeatBooking[],
  startTime: string,
  durationHours: number
): number {
  const candStart = toExtendedMinutes(startTime)
  const candEnd = candStart + durationHours * 60

  const samplePoints = [candStart]
  for (const b of existing) {
    const s = toExtendedMinutes(b.startTime)
    if (s > candStart && s < candEnd) samplePoints.push(s)
  }

  let peak = 0
  for (const t of samplePoints) {
    let occ = 0
    for (const b of existing) {
      const s = toExtendedMinutes(b.startTime)
      const e = s + b.durationHours * 60
      if (s <= t && t < e) occ += b.racerCount
    }
    if (occ > peak) peak = occ
  }
  return peak
}

/** True when `racerCount` more seats fit at this slot without exceeding capacity. */
export function seatsAvailableFor(
  existing: SeatBooking[],
  startTime: string,
  durationHours: number,
  racerCount: number,
  capacity: number = DEFAULT_SEAT_CAPACITY
): boolean {
  return maxConcurrentRacers(existing, startTime, durationHours) + racerCount <= capacity
}
