// Date ranges for the /admin/ads switcher.
//
// Pure module (no env, no network) so it can be tested and shared between the
// Meta insights fetch and our own first-party attribution query.
//
// The two CALENDAR-MONTH presets matter: the marketing payout is computed per
// calendar month, but the rolling "last 30 days" window can never line up with
// one — on Oct 9 it covers Sep 9 – Oct 8, so there was no way to see what was
// spent on MC Racing ads in September next to September's revenue.
import { easternYearMonth, easternMonthStartUtc, previousMonth } from '../eastern'

export type DatePreset =
  | 'today'
  | 'last_7d'
  | 'last_30d'
  | 'this_month'
  | 'last_month'
  | 'last_90d'
  | 'maximum'

export const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'last_7d', label: 'Last 7 days' },
  { value: 'last_30d', label: 'Last 30 days' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'last_90d', label: 'Last 90 days' },
  { value: 'maximum', label: 'All time' },
]

export interface PresetWindow {
  /** Inclusive lower bound, or null for "no lower bound". */
  since: Date | null
  /** EXCLUSIVE upper bound, or null for "up to now". */
  until: Date | null
}

const ROLLING_DAYS: Partial<Record<DatePreset, number>> = {
  today: 1,
  last_7d: 7,
  last_30d: 30,
  last_90d: 90,
}

/**
 * Resolve a preset to a concrete window for querying OUR OWN database
 * (Meta's API takes the preset name directly). Rolling presets are "now minus N
 * days"; month presets are Eastern calendar months.
 */
export function presetWindow(preset: DatePreset, now: Date = new Date()): PresetWindow {
  const days = ROLLING_DAYS[preset]
  if (days !== undefined) {
    const since = new Date(now)
    since.setUTCDate(since.getUTCDate() - days)
    return { since, until: null }
  }

  if (preset === 'this_month') {
    const { year, month } = easternYearMonth(now)
    return { since: easternMonthStartUtc(year, month), until: null }
  }

  if (preset === 'last_month') {
    const cur = easternYearMonth(now)
    const prev = previousMonth(cur.year, cur.month)
    return {
      since: easternMonthStartUtc(prev.year, prev.month),
      until: easternMonthStartUtc(cur.year, cur.month),
    }
  }

  return { since: null, until: null } // 'maximum'
}
