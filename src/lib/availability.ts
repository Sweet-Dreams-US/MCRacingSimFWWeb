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
