// Lap times are stored as integer milliseconds so they sort correctly and
// tie-break precisely. Admins can type any of the natural forms:
//   "1:23.456"  → 1 min 23.456 s
//   "1:23"      → 1 min 23 s
//   "83.456"    → 83.456 s (sub-minute laps written without a colon)
//   "83" / "83.4"
// Both "." and "," are accepted as the decimal mark.

/** Parse an admin-typed lap time to whole milliseconds, or null if unparseable. */
export function parseLapTimeMs(input: string): number | null {
  const s = input.trim().replace(',', '.')
  if (!s) return null

  if (s.includes(':')) {
    // M:SS(.fff) — seconds must be 0–59 when minutes are given.
    const m = s.match(/^(\d+):([0-5]?\d)(?:\.(\d{1,3}))?$/)
    if (!m) return null
    const minutes = parseInt(m[1], 10)
    const seconds = parseInt(m[2], 10)
    const millis = m[3] ? parseInt(m[3].padEnd(3, '0'), 10) : 0
    const total = minutes * 60_000 + seconds * 1_000 + millis
    return total > 0 ? total : null
  }

  // S(.fff) — a bare number of seconds, which may exceed 59 (e.g. "83.456").
  const m = s.match(/^(\d+)(?:\.(\d{1,3}))?$/)
  if (!m) return null
  const seconds = parseInt(m[1], 10)
  const millis = m[2] ? parseInt(m[2].padEnd(3, '0'), 10) : 0
  const total = seconds * 1_000 + millis
  return total > 0 ? total : null
}

/** Format milliseconds as a lap time: "1:23.456" or, sub-minute, "58.223". */
export function formatLapTime(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.floor((ms % 60_000) / 1_000)
  const millis = Math.floor(ms % 1_000)
  const mmm = String(millis).padStart(3, '0')
  if (minutes > 0) {
    return `${minutes}:${String(seconds).padStart(2, '0')}.${mmm}`
  }
  return `${seconds}.${mmm}`
}
